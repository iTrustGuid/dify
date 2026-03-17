import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import Textarea from 'react-textarea-autosize'
import { useTranslation } from 'react-i18next'
import { decode } from 'html-entities'
import type {
  EnableType,
  OnSend,
} from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import type { InputForm } from '../type'
import { useCheckInputsForms } from '../check-input-forms-hooks'
import { useTextAreaHeight } from './hooks'
import Operation from './operation'
import cn from '@/utils/classnames'
import { FileListInChatInput } from '@/app/components/base/file-uploader'
import { useFile } from '@/app/components/base/file-uploader/hooks'
import {
  FileContextProvider,
  useFileStore,
} from '@/app/components/base/file-uploader/store'
import { useToastContext } from '@/app/components/base/toast'
import FeatureBar from '@/app/components/base/features/new-feature-panel/feature-bar'
import type { FileUpload } from '@/app/components/base/features/types'
import { TransferMethod } from '@/types/app'

// ================= 阿里云配置 =================
const ALIYUN_TOKEN = '5fa5a06a276e4bc7870c26cd0db927cb'
const ALIYUN_APP_KEY = 'PtcXfBxLzBd8HU4N'
const ALIYUN_URL = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'
// =============================================

type ChatInputAreaProps = {
  botName?: string
  showFeatureBar?: boolean
  showFileUpload?: boolean
  featureBarDisabled?: boolean
  onFeatureBarClick?: (state: boolean) => void
  visionConfig?: FileUpload
  speechToTextConfig?: EnableType
  onSend?: OnSend
  inputs?: Record<string, any>
  inputsForm?: InputForm[]
  theme?: Theme | null
  isResponding?: boolean
  disabled?: boolean
}

const ChatInputArea = ({
  botName,
  showFeatureBar,
  showFileUpload,
  featureBarDisabled,
  onFeatureBarClick,
  visionConfig,
  speechToTextConfig = { enabled: true },
  onSend,
  inputs = {},
  inputsForm = [],
  theme,
  isResponding,
  disabled,
}: ChatInputAreaProps) => {
  const { t } = useTranslation()
  const { notify } = useToastContext()
  const {
    wrapperRef,
    textareaRef,
    textValueRef,
    holdSpaceRef,
    handleTextareaResize,
    isMultipleLine,
  } = useTextAreaHeight()
  const [query, setQuery] = useState('')
  const filesStore = useFileStore()
  const {
    handleDragFileEnter,
    handleDragFileLeave,
    handleDragFileOver,
    handleDropFile,
    handleClipboardPasteFile,
    isDragActive,
  } = useFile(visionConfig!)
  const { checkInputsForm } = useCheckInputsForms()
  const historyRef = useRef([''])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const isComposingRef = useRef(false)

  // 语音识别相关
  const [isRecording, setIsRecording] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const lastStableTextRef = useRef('') // 记录已稳定的文本前缀

  const taskIdRef = useRef<string>(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  )

  // 生成 message_id
  const generateMessageId = useCallback(() => {
    return Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('')
  }, [])

  // 恢复 AudioContext
  const resumeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(console.error)
    }
  }, [])

  // 5秒静音自动停止
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = window.setTimeout(() => {
      stopRecognition()
    }, 5000)
  }, [])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  // ✅ 手动编辑输入框时停止录音
  const handleManualEdit = useCallback((value: string) => {
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
    }
    setQuery(value)
    setTimeout(handleTextareaResize, 0)
  }, [isRecording, handleTextareaResize])

  // ✅ 流式更新输入框（微信式纠错）
  const updateQueryWithRecognition = useCallback((newText: string, isFinal: boolean = false) => {
    setQuery(prev => {
      if (isFinal) {
        // 最终结果：直接替换不稳定部分
        return lastStableTextRef.current + newText
      } else {
        // 中间结果：保留前缀，更新后半部分（模拟纠错）
        return lastStableTextRef.current + newText
      }
    })
    handleTextareaResize()
  }, [handleTextareaResize])

  // 开始识别
  const startRecognition = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      streamRef.current = stream

      const wsUrl = `${ALIYUN_URL}?token=${ALIYUN_TOKEN}&appkey=${ALIYUN_APP_KEY}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      // 录音开始时，记录当前输入框内容作为稳定前缀
      lastStableTextRef.current = query.trim()
      if (lastStableTextRef.current) lastStableTextRef.current += ' '

      ws.onopen = () => {
        console.log('✅ 阿里云语音连接成功')
        sendStartCommand(ws)
        setIsRecording(true)
        startAudioProcessing(stream)
        resetSilenceTimer()
      }

      ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') return
          const data = JSON.parse(event.data)
          const header = data.header
          if (!header) return

          // ========================
          // ✅ 核心：流式实时纠正
          // ========================
          if (header.name === 'TranscriptionResultChanged') {
            const tempText = data.payload?.result || ''
            updateQueryWithRecognition(tempText, false)
            resetSilenceTimer()
          }

          // ========================
          // ✅ 最终确认：用完整结果修正
          // ========================
          if (header.name === 'TranscriptionCompleted') {
            const finalText = data.payload?.result?.trim() || ''
            if (finalText) {
              updateQueryWithRecognition(finalText, true)
            }
            lastStableTextRef.current = '' // 重置稳定前缀
            setIsRecording(false)
            cleanup()
          }

          if (header.name === 'SentenceEnd') {
            // 句子结束时，将当前结果标记为稳定前缀
            const sentence = data.payload?.result?.trim() || ''
            if (sentence) {
              lastStableTextRef.current += sentence + ' '
            }
          }

          if (header.name === 'TaskFailed') {
            console.error('识别失败', data.header?.status_text)
            setIsRecording(false)
            cleanup()
          }
        } catch (e) {
          console.error('解析消息错误', e)
        }
      }

      ws.onerror = (err) => {
        console.error('ws 错误', err)
        setIsRecording(false)
        cleanup()
      }

      ws.onclose = () => {
        setIsRecording(false)
        cleanup()
      }
    } catch (err) {
      console.error('启动录音失败', err)
      setIsRecording(false)
      cleanup()
    }
  }

  const sendStartCommand = (ws: WebSocket) => {
    ws.send(JSON.stringify({
      header: {
        message_id: generateMessageId(),
        task_id: taskIdRef.current,
        namespace: 'SpeechTranscriber',
        name: 'StartTranscription',
        appkey: ALIYUN_APP_KEY,
      },
      payload: {
        format: 'pcm',
        sample_rate: 16000,
        enable_intermediate_result: true,
        enable_punctuation_prediction: true,
        enable_inverse_text_normalization: true,
      },
    }))
  }

  const sendStopCommand = () => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        header: {
          message_id: generateMessageId(),
          task_id: taskIdRef.current,
          namespace: 'SpeechTranscriber',
          name: 'StopTranscription',
          appkey: ALIYUN_APP_KEY,
        },
        payload: {},
      }))
    }
  }

  const startAudioProcessing = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const audioContext = new AudioContextClass({ sampleRate: 16000 })
    audioContextRef.current = audioContext

    if (audioContext.state === 'suspended') resumeAudioContext()

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      const inputData = e.inputBuffer.getChannelData(0)
      const output = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      ws.send(output.buffer)
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const stopRecognition = () => {
    setIsRecording(false)
    clearSilenceTimer()
    sendStopCommand()
  }

  const cleanup = () => {
    clearSilenceTimer()
    lastStableTextRef.current = ''

    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close()

    processorRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    wsRef.current = null
  }

  // 切换录音
  const toggleVoiceInput = useCallback(() => {
    if (isRecording) {
      stopRecognition()
    } else {
      startRecognition()
    }
  }, [isRecording])

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  const handleOnMessage = (event: any) => {
    if (event.data.type === 'dify-chatbot-append-message') {
      const message = event.data.message as string
      setQuery(message)
      historyRef.current.push(message)
      setCurrentIndex(historyRef.current.length)
      if (onSend) {
        onSend(message)
        setQuery('')
      }
    }
  }

  const configChangeHandler = (event: MessageEvent) => {
    const windowAny = window as any;
    if (event.data && event.data.type === 'dify-chatbot-config-change') {
      const newConfig = event.data.difyChatbotConfig;
      windowAny.difyChatbotConfig = newConfig;
    }
  }

  useEffect(() => {
    const windowAny = window as any;
    windowAny.addEventListener('message', handleOnMessage)
    windowAny.addEventListener('message', configChangeHandler)
    return () => {
      windowAny.removeEventListener('message', handleOnMessage)
      windowAny.removeEventListener('message', configChangeHandler)
      cleanup()
    }
  }, [])

  const handleSend = () => {
    if (isResponding) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForResponse') })
      return
    }
    if (onSend) {
      const { files, setFiles } = filesStore.getState()
      if (files.find(item => item.transferMethod === TransferMethod.local_file && !item.uploadedId)) {
        notify({ type: 'info', message: t('appDebug.errorMessage.waitForFileUpload') })
        return
      }
      if (!query || !query.trim()) {
        notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
        return
      }
      if (checkInputsForm(inputs, inputsForm)) {
        onSend(query, files)
        handleQueryChange('')
        setFiles([])
      }
    }
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isComposingRef.current = false
    }, 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (isComposingRef.current) return
      e.preventDefault()
      setQuery(query.replace(/\n$/, ''))
      historyRef.current.push(query)
      setCurrentIndex(historyRef.current.length)
      handleSend()
    }
  }

  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      isRecording={isRecording}
      onToggleVoiceInput={toggleVoiceInput}
      onSend={handleSend}
      theme={theme}
    />
  )

  return (
    <>
      <div
        className={cn(
          'relative z-10 overflow-hidden rounded-xl border border-components-chat-input-border bg-components-panel-bg-blur pb-[9px] shadow-md',
          isDragActive && 'border border-dashed border-components-option-card-option-selected-border',
          disabled && 'pointer-events-none border-components-panel-border opacity-50 shadow-none',
        )}
      >
        <div className='relative max-h-[158px] overflow-y-auto overflow-x-hidden px-[9px] pt-[9px]'>
          <FileListInChatInput fileConfig={visionConfig!} />
          <div ref={wrapperRef} className='flex items-center justify-between'>
            <div className='relative flex w-full grow items-center'>
              <div ref={textValueRef} className='body-lg-regular pointer-events-none invisible absolute h-auto w-auto whitespace-pre p-1 leading-6'>
                {query}
              </div>
              <Textarea
                ref={ref => textareaRef.current = ref as any}
                className={cn('body-lg-regular w-full resize-none bg-transparent p-1 leading-6 text-text-primary outline-none')}
                placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '')}
                autoFocus
                minRows={1}
                value={query}
                onChange={e => handleManualEdit(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onPaste={handleClipboardPasteFile}
                onDragEnter={handleDragFileEnter}
                onDragLeave={handleDragFileLeave}
                onDragOver={handleDragFileOver}
                onDrop={handleDropFile}
                readOnly={isRecording}
              />
            </div>
            {!isMultipleLine && operation}
          </div>
        </div>
        {isMultipleLine && <div className='px-[9px]'>{operation}</div>}
      </div>
      {showFeatureBar && <FeatureBar showFileUpload={showFileUpload} disabled={featureBarDisabled} onFeatureBarClick={onFeatureBarClick} />}
    </>
  )
}

const ChatInputAreaWrapper = (props: ChatInputAreaProps) => {
  return (
    <FileContextProvider>
      <ChatInputArea {...props} />
    </FileContextProvider>
  )
}

export default ChatInputAreaWrapper