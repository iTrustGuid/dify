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

// 自定义纠错词典
const CUSTOM_CORRECTION_DICT: Record<string, string> = {
  '万年限': '万年县',
  '北京是': '北京市',
  '上海是': '上海市',
  '广州省': '广东省',
  '深圳省': '广东省深圳市',
  '星期零': '星期天',
  '一百零': '一百零一',
  '二千': '两千',
  '俩千': '两千',
}

// 通用纠错函数
const correctText = (text: string): string => {
  let corrected = text
  // 1. 自定义词典替换
  Object.entries(CUSTOM_CORRECTION_DICT).forEach(([wrong, right]) => {
    corrected = corrected.replace(new RegExp(wrong, 'g'), right)
  })
  // 2. 常见拼音错误纠正
  corrected = corrected
    .replace(/的话/g, '的')
    .replace(/了话/g, '了')
    .replace(/呢话/g, '呢')
    .replace(/么话/g, '么')
    .replace(/0([1-9])/g, '零$1')
    .replace(/([1-9])0/g, '$1十')
  // 3. 去重空格和重复字符
  corrected = corrected.replace(/\s+/g, ' ').replace(/([^ ])\1{2,}/g, '$1')
  return corrected.trim()
}

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
  const isStoppingRef = useRef(false) // ✅ 新增：标记是否正在停止任务
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const lastStableTextRef = useRef('')

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
    if (isStoppingRef.current) return // ✅ 停止中不重置定时器
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

  // 手动编辑输入框时停止录音
  const handleManualEdit = useCallback((value: string) => {
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
    }
    setQuery(value)
    setTimeout(handleTextareaResize, 0)
  }, [isRecording, handleTextareaResize])

  // 流式更新输入框（带纠错）
  const updateQueryWithRecognition = useCallback((newText: string, isFinal: boolean = false) => {
    if (isStoppingRef.current) return // ✅ 停止中不更新文本
    const correctedText = correctText(newText)
    let finalText = ''
    
    if (isFinal) {
      finalText = lastStableTextRef.current + correctedText
    } else {
      finalText = lastStableTextRef.current + correctedText
    }
    
    setQuery(finalText)
    handleTextareaResize()
  }, [handleTextareaResize])

  // 清空历史内容并开始识别
  const startRecognition = async () => {
    try {
      // 重置停止标记
      isStoppingRef.current = false
      // 1. 清空历史内容
      setQuery('')
      lastStableTextRef.current = ''
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0.02
        }
      })
      streamRef.current = stream

      const wsUrl = `${ALIYUN_URL}?token=${ALIYUN_TOKEN}&appkey=${ALIYUN_APP_KEY}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ 阿里云语音连接成功')
        sendStartCommand(ws)
        setIsRecording(true)
        startAudioProcessing(stream)
        resetSilenceTimer()
      }

      ws.onmessage = (event) => {
        try {
          if (isStoppingRef.current) return // ✅ 停止中忽略消息
          if (typeof event.data !== 'string') return
          const data = JSON.parse(event.data)
          const header = data.header
          if (!header) return

          if (header.name === 'TranscriptionResultChanged') {
            const tempText = data.payload?.result || ''
            updateQueryWithRecognition(tempText, false)
            resetSilenceTimer()
          }

          if (header.name === 'TranscriptionCompleted') {
            const finalText = data.payload?.result?.trim() || ''
            if (finalText) {
              updateQueryWithRecognition(finalText, true)
            }
            lastStableTextRef.current = ''
            setIsRecording(false)
            cleanup()
          }

          if (header.name === 'SentenceEnd') {
            const sentence = data.payload?.result?.trim() || ''
            if (sentence) {
              const correctedSentence = correctText(sentence)
              lastStableTextRef.current += correctedSentence + ' '
            }
          }

          if (header.name === 'TaskFailed') {
            // ✅ 过滤停止过程中的正常错误
            if (!data.header?.status_text?.includes('Got stream data while task is stopping')) {
              console.error('识别失败', data.header?.status_text)
            }
            setIsRecording(false)
            cleanup()
          }
        } catch (e) {
          console.error('解析消息错误', e)
        }
      }

      ws.onerror = (err) => {
        if (!isStoppingRef.current) { // ✅ 停止中忽略错误
          console.error('ws 错误', err)
        }
        setIsRecording(false)
        cleanup()
      }

      ws.onclose = () => {
        if (!isStoppingRef.current) { // ✅ 停止中忽略关闭事件
          setIsRecording(false)
        }
        cleanup()
      }
    } catch (err) {
      console.error('启动录音失败', err)
      setIsRecording(false)
      cleanup()
    }
  }

  // 优化阿里云识别参数
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
        enable_voice_detection: true,
        voice_detection_silence_time: 500,
        max_sentence_silence: 1000,
        enable_words: true,
      },
    }))
  }

  // ✅ 原子化停止：先标记状态 → 停止音频流 → 发送停止指令 → 清理资源
  const stopRecognition = () => {
    if (isStoppingRef.current) return // 防止重复调用
    isStoppingRef.current = true
    
    // 1. 立即停止录音状态
    setIsRecording(false)
    // 2. 清除静音定时器
    clearSilenceTimer()
    // 3. 立即断开音频处理器（关键：停止数据发送）
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    // 4. 停止媒体流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    // 5. 发送停止指令（非阻塞）
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendStopCommand()
    }
    // 6. 延迟清理WebSocket（确保停止指令发送完成）
    setTimeout(() => {
      cleanup()
      isStoppingRef.current = false
    }, 300)
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
    const audioContext = new AudioContextClass({ 
      sampleRate: 16000,
      latencyHint: 'interactive'
    })
    audioContextRef.current = audioContext

    if (audioContext.state === 'suspended') resumeAudioContext()

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(8192, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      // ✅ 停止中不发送数据
      if (isStoppingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return
      }

      const inputData = e.inputBuffer.getChannelData(0)
      const output = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      wsRef.current?.send(output.buffer)
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const cleanup = () => {
    isStoppingRef.current = false
    clearSilenceTimer()
    lastStableTextRef.current = ''

    // 1. 清理音频处理器
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    // 2. 清理媒体流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    // 3. 清理AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    // 4. 清理WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Normal closure')
      }
      wsRef.current = null
    }
  }

  // 切换录音（开启时清空内容）
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
      const finalText = correctText(query)
      if (checkInputsForm(inputs, inputsForm)) {
        onSend(finalText, files)
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