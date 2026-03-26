import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import Textarea from 'react-textarea-autosize'
import { useTranslation } from 'react-i18next'
import Recorder from 'js-audio-recorder'
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
import VoiceInput from '@/app/components/base/voice-input'
import { useToastContext } from '@/app/components/base/toast'
import FeatureBar from '@/app/components/base/features/new-feature-panel/feature-bar'
import type { FileUpload } from '@/app/components/base/features/types'
import { TransferMethod } from '@/types/app'
import { fetchAliyunNlsToken } from '@/utils/aliyun-nls'

const ALIYUN_URL = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'

const cleanText = (text: string): string => {
  if (!text) return ''
  return text.trim()
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

  const historyRef = useRef([''])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const isComposingRef = useRef(false)

  // ====================== 语音识别状态 ======================
  const [confirmedText, setConfirmedText] = useState('')
  const [currentRecognizingText, setCurrentRecognizingText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  // 👇 已废弃：不再使用弹窗蒙版
  const [showVoiceInput, setShowVoiceInput] = useState(false)
  
  const isTextareaFocused = useRef(false)
  const lastRecognizedRef = useRef('')
  const sentenceEndTimerRef = useRef<number | null>(null)
  const cursorPositionRef = useRef<number>(0)
  const isStoppingRef = useRef(false)
  const isConnectingRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const taskIdRef = useRef<string>('')
  const aliyunConfigRef = useRef<{ token: string; appKey: string } | null>(null)

  const {
    handleDragFileEnter,
    handleDragFileLeave,
    handleDragFileOver,
    handleDropFile,
    handleClipboardPasteFile,
    isDragActive,
  } = useFile(visionConfig!)
  const filesStore = useFileStore()
  const { checkInputsForm } = useCheckInputsForms()

  // 删除多余空格，确保文本能正确渲染到输入框
  const displayText = `${confirmedText}${currentRecognizingText}`.trim()

  // ====================== 外部消息监听 ======================
  const handleOnMessage = (event: any) => {
    if (event.data.type === 'dify-chatbot-append-message') {
      const message = event.data.message as string
      setConfirmedText(message)
      setCurrentRecognizingText('')
      historyRef.current.push(message)
      setCurrentIndex(historyRef.current.length)
      if (onSend) {
        onSend(message)
        setConfirmedText('')
        setCurrentRecognizingText('')
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
    windowAny.addEventListener('message', configChangeHandler);

    return () => {
      windowAny.removeEventListener('message', handleOnMessage)
      windowAny.removeEventListener('message', configChangeHandler);
    }
  }, [onSend])

  // ====================== 工具方法 ======================
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
  }
  
  const clearSentenceEndTimer = () => {
    if (sentenceEndTimerRef.current) clearTimeout(sentenceEndTimerRef.current)
    sentenceEndTimerRef.current = null
  }

  const forceCleanupResources = () => {
    clearSilenceTimer()
    clearSentenceEndTimer()
    
    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch (e) {}
      processorRef.current = null
    }
    
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()) } catch (e) {}
      streamRef.current = null
    }
    
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null
        wsRef.current.onmessage = null
        wsRef.current.onerror = null
        wsRef.current.onclose = null
        if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close()
      } catch (e) {}
      wsRef.current = null
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close() } catch (e) {}
      audioContextRef.current = null
    }
    
    isStoppingRef.current = false
    isConnectingRef.current = false
  }

  const resetSilenceTimer = () => {
    if (isStoppingRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 6000) as any
  }

  const resetSentenceEndTimer = () => {
    clearSentenceEndTimer()
    sentenceEndTimerRef.current = window.setTimeout(() => {
      if (currentRecognizingText) {
        setConfirmedText(prev => `${prev} ${currentRecognizingText}`.trim())
        setCurrentRecognizingText('')
        lastRecognizedRef.current = ''
      }
    }, 1000) as any
  }

  const saveCursorPosition = () => {
    if (textareaRef.current) {
      cursorPositionRef.current = textareaRef.current.selectionStart
    }
  }
  
  // 确保光标永远在最后，输入框实时显示
  const restoreCursorPosition = () => {
    if (!textareaRef.current) return
    setTimeout(() => {
      textareaRef.current!.selectionStart = displayText.length
      textareaRef.current!.selectionEnd = displayText.length
    }, 0)
  }

  const generateMessageId = () =>
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')

  const generateTaskId = () => {
    return Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  // 确保识别结果实时同步到输入框
  const updateRecognitionResult = useCallback((text: string) => {
    if (isStoppingRef.current) return
    const clean = cleanText(text)
    if (clean === lastRecognizedRef.current) return
    
    lastRecognizedRef.current = clean
    setCurrentRecognizingText(clean)
    handleTextareaResize()
    resetSilenceTimer()
    resetSentenceEndTimer()
    restoreCursorPosition()
  }, [handleTextareaResize])

  const safeFocusTextarea = () => {
    if (textareaRef.current && !isTextareaFocused.current) {
      textareaRef.current.focus()
      restoreCursorPosition()
      isTextareaFocused.current = true
    }
  }

  const safeBlurTextarea = () => {
    if (textareaRef.current && isTextareaFocused.current) {
      textareaRef.current.blur()
      isTextareaFocused.current = false
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const handleFocus = () => { isTextareaFocused.current = true }
    const handleBlur = () => { isTextareaFocused.current = false }
    textarea.addEventListener('focus', handleFocus)
    textarea.addEventListener('blur', handleBlur)
    return () => {
      textarea.removeEventListener('focus', handleFocus)
      textarea.removeEventListener('blur', handleBlur)
    }
  }, [])

  const handleQueryChange = useCallback(
    (value: string) => {
      setConfirmedText(value)
      setCurrentRecognizingText('')
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  const handleManualEdit = (value: string) => {
    if (isRecording) stopRecognition()
    setConfirmedText(value)
    setCurrentRecognizingText('')
    lastRecognizedRef.current = ''
    saveCursorPosition()
    setTimeout(handleTextareaResize, 0)
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
      const finalText = displayText.replace(/\n$/, '').trim()
      historyRef.current.push(finalText)
      setCurrentIndex(historyRef.current.length)
      handleSend()
    }
    else if (e.key === 'ArrowUp' && !e.shiftKey && !e.nativeEvent.isComposing && e.metaKey) {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
        handleQueryChange(historyRef.current[currentIndex - 1])
      }
    }
    else if (e.key === 'ArrowDown' && !e.shiftKey && !e.nativeEvent.isComposing && e.metaKey) {
      if (currentIndex < historyRef.current.length - 1) {
        setCurrentIndex(currentIndex + 1)
        handleQueryChange(historyRef.current[currentIndex + 1])
      }
      else if (currentIndex === historyRef.current.length - 1) {
        setCurrentIndex(historyRef.current.length)
        handleQueryChange('')
      }
    }
  }

  // 👇 已废弃：不再打开弹窗
  const handleShowVoiceInput = useCallback(() => {
    toggleVoice()
  }, [])

  // ====================== 阿里云语音识别核心 ======================
  const startRecognition = async () => {
    if (isConnectingRef.current || isRecording) return
    isConnectingRef.current = true

    try {
      const config = 
      {
              token: 'cdd952fae90047ff98e1a55f95879406',
              appKey: 'PtcXfBxLzBd8HU4N',
            }

      aliyunConfigRef.current = config
      
      forceCleanupResources()
      setConfirmedText('')
      setCurrentRecognizingText('')
      lastRecognizedRef.current = ''
      isStoppingRef.current = false
      taskIdRef.current = generateTaskId()

      if (!navigator.mediaDevices?.getUserMedia) {
        notify({ type: 'error', message: '浏览器不支持录音' })
        isConnectingRef.current = false
        return
      }

      safeFocusTextarea()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const configData = aliyunConfigRef.current
      if (!configData) throw new Error('获取配置失败')
      
      const ws = new WebSocket(`${ALIYUN_URL}?appkey=${configData.appKey}&token=${configData.token}`)

      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        if (isStoppingRef.current) {
          ws.close()
          isConnectingRef.current = false
          return
        }
        
        sendStartCmd(ws)
        setTimeout(() => {
          if (isStoppingRef.current) return
          startAudioPipe(stream)
          setIsRecording(true)
          resetSilenceTimer()
          isConnectingRef.current = false
        }, 100)
      }

      ws.onmessage = (e) => {
        if (isStoppingRef.current || typeof e.data !== 'string') return
        try {
          const data = JSON.parse(e.data)
          const h = data.header
          if (!h) return

          if (h.name === 'TranscriptionResultChanged') {
            updateRecognitionResult(data.payload?.result || '')
          } else if (h.name === 'SentenceEnd' || h.name === 'TranscriptionCompleted') {
            const clean = cleanText(data.payload?.result || '')
            if (clean) {
              setConfirmedText(p => `${p} ${clean}`.trim())
              setCurrentRecognizingText('')
              lastRecognizedRef.current = ''
            }
          } else if (h.name === 'TaskFailed') {
            notify({ type: 'error', message: '语音识别失败，请重试' })
            stopRecognition()
          }
        } catch (err) {
          console.error('解析识别结果失败:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('WebSocket错误:', err)
        notify({ type: 'error', message: '语音连接失败，请检查网络' })
        forceCleanupResources()
        isConnectingRef.current = false
      }

      ws.onclose = () => {
        setIsRecording(false)
        forceCleanupResources()
        isConnectingRef.current = false
      }

    } catch (err) {
      console.error('启动录音失败:', err)
      notify({ type: 'error', message: ''+err })
      forceCleanupResources()
      isConnectingRef.current = false
    }
  }

  const sendStartCmd = (ws: WebSocket) => {
    try {
      const config = aliyunConfigRef.current
      if (!config) return
      
      ws.send(JSON.stringify({
        header: {
          message_id: generateMessageId(),
          task_id: taskIdRef.current,
          namespace: 'SpeechTranscriber',
          name: 'StartTranscription',
          appkey: config.appKey
        },
        payload: {
          format: 'pcm',
          sample_rate: 16000,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
          max_sentence_silence: 1000,
          disfluency: true,
          language: 'zh-CN'
        },
      }))
    } catch (err) {
      console.error('发送启动指令失败:', err)
    }
  }

  const startAudioPipe = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const proc = ctx.createScriptProcessor(1024, 1, 1)
      processorRef.current = proc

      proc.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isStoppingRef.current) return
        
        try {
          const d = e.inputBuffer.getChannelData(0)
          const out = new Int16Array(d.length)
          for (let i = 0; i < d.length; i++) {
            const s = Math.max(-1, Math.min(1, d[i]))
            out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          wsRef.current.send(out.buffer)
        } catch (err) {
          console.error('发送音频数据失败:', err)
        }
      }

      source.connect(proc)
      proc.connect(ctx.destination)
    } catch (err) {
      console.error('初始化音频管道失败:', err)
      stopRecognition()
    }
  }

  const stopRecognition = () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true

    clearSilenceTimer()
    clearSentenceEndTimer()

    if (currentRecognizingText) {
      setConfirmedText(prev => `${prev} ${currentRecognizingText}`.trim())
      setCurrentRecognizingText('')
      lastRecognizedRef.current = ''
    }

    setIsRecording(false)
    forceCleanupResources()
    
    setTimeout(() => {
      isStoppingRef.current = false
    }, 300)
  }

  // 👇 核心修改：直接开关录音，无弹窗、无蒙版
  const toggleVoice = () => {
    if (isRecording) {
      stopRecognition()
    } else {
      startRecognition()
    }
  }

  const handleSend = () => {
    if (isRecording) stopRecognition()
    
    if (isResponding) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForResponse') })
      return
    }
    if (!onSend) return

    const { files, setFiles } = filesStore.getState()
    
    const hasUnuploaded = files.some(
      item => item.transferMethod === TransferMethod.local_file && !item.uploadedId
    )
    if (hasUnuploaded) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForFileUpload') })
      return
    }

    const finalText = cleanText(displayText)
    if (!finalText) {
      notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
      return
    }

    const isValid = checkInputsForm(inputs, inputsForm)
    if (!isValid) return

    safeBlurTextarea()
    onSend(finalText, files)
    
    setConfirmedText('')
    setCurrentRecognizingText('')
    lastRecognizedRef.current = ''
    setFiles([])
  }

  const handleFileUploadClick = () => {
    if (isRecording) {
      stopRecognition()
    }
  }

  useEffect(() => {
    return () => {
      forceCleanupResources()
    }
  }, [])

  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      isRecording={isRecording}
      onToggleVoiceInput={toggleVoice}
      onShowVoiceInput={handleShowVoiceInput}
      onSend={handleSend}
      onFileUploadClick={handleFileUploadClick}
      theme={theme}
    />
  )

  return (
    <>
      <div className={cn(
        'relative z-10 overflow-hidden rounded-xl border border-components-chat-input-border bg-components-panel-bg-blur pb-[9px] shadow-md',
        isDragActive && 'border border-dashed border-components-option-card-option-selected-border',
        disabled && 'pointer-events-none border-components-panel-border opacity-50 shadow-none',
      )}>
        <div className='relative max-h-[158px] overflow-y-auto overflow-x-hidden px-[9px] pt-[9px]'>
          <FileListInChatInput fileConfig={visionConfig!} />
          <div ref={wrapperRef} className='flex items-center justify-between'>
            <div className='relative flex w-full grow items-center'>
              <div ref={textValueRef} className='body-lg-regular pointer-events-none invisible absolute h-auto w-auto whitespace-pre p-1 leading-6'>
                {displayText}
              </div>
              <Textarea
                ref={textareaRef}
                className='body-lg-regular w-full resize-none bg-transparent p-1 leading-6 text-text-primary outline-none'
                placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '请输入消息')}
                autoFocus
                minRows={1}
                value={displayText}
                onChange={e => handleManualEdit(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onSelect={saveCursorPosition}
                onPaste={handleClipboardPasteFile}
                onDragEnter={handleDragFileEnter}
                onDragLeave={handleDragFileLeave}
                onDragOver={handleDragFileOver}
                onDrop={handleDropFile}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {!isMultipleLine && operation}
          </div>

          {/* 👇 已彻底移除语音蒙版弹窗 */}
          {/* {showVoiceInput && (
            <VoiceInput
              onCancel={() => setShowVoiceInput(false)}
              onConverted={text => handleQueryChange(text)}
            />
          )} */}
        </div>
        {isMultipleLine && <div className='px-[9px]'>{operation}</div>}
      </div>
      {showFeatureBar && <FeatureBar showFileUpload={showFileUpload} disabled={featureBarDisabled} onFeatureBarClick={onFeatureBarClick} />}
    </>
  )
}

const ChatInputAreaWrapper = (props: ChatInputAreaProps) => (
  <FileContextProvider><ChatInputArea {...props} /></FileContextProvider>
)

export default ChatInputAreaWrapper