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
import type { FileUpload } from '@/app/components/base/features/types'
import { TransferMethod } from '@/types/app'

// ================= 阿里云配置 =================
const ALIYUN_TOKEN = 'e5c99cf4e2534774ac17f348c522edf5'
const ALIYUN_APP_KEY = 'PtcXfBxLzBd8HU4N'
const ALIYUN_URL = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'
// =============================================

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

  // ========== 核心拆分：已确认文本 + 当前识别文本 ==========
  const [confirmedText, setConfirmedText] = useState('') // 已说完的、稳定的文本
  const [currentRecognizingText, setCurrentRecognizingText] = useState('') // 当前正在识别的文本
  const lastRecognizedRef = useRef('') // 去重：上一次识别结果
  const sentenceEndTimerRef = useRef<number | null>(null) // 句子结束计时器
  const cursorPositionRef = useRef<number>(0) // 记录光标位置

  const { isDragActive } = visionConfig ? useFile(visionConfig) : { isDragActive: false }
  const filesStore = useFileStore()
  const { checkInputsForm } = useCheckInputsForms()

  const [isRecording, setIsRecording] = useState(false)
  const isStoppingRef = useRef(false)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<number | null>(null)

  const taskIdRef = useRef<string>(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  )
  const generateMessageId = () =>
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')

  // 最终显示的文本 = 已确认文本 + 当前识别文本
  const displayText = `${confirmedText} ${currentRecognizingText}`.trim()

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }

  const clearSentenceEndTimer = () => {
    if (sentenceEndTimerRef.current) {
      clearTimeout(sentenceEndTimerRef.current)
      sentenceEndTimerRef.current = null
    }
  }

  // 2秒静音自动停止录音
  const resetSilenceTimer = () => {
    if (isStoppingRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => {
      stopRecognition()
    }, 6000) as any
  }

  // 句子结束：1秒无更新则合并到已确认文本
  const resetSentenceEndTimer = () => {
    clearSentenceEndTimer()
    sentenceEndTimerRef.current = window.setTimeout(() => {
      if (currentRecognizingText) {
        setConfirmedText(prev => `${prev} ${currentRecognizingText}`.trim())
        setCurrentRecognizingText('')
        lastRecognizedRef.current = ''
        // 更新光标位置到末尾
        if (textareaRef.current) {
          const newPos = `${prev} ${currentRecognizingText}`.trim().length
          cursorPositionRef.current = newPos
          textareaRef.current.selectionStart = newPos
          textareaRef.current.selectionEnd = newPos
        }
      }
    }, 1000) as any
  }

  // 保存光标位置
  const saveCursorPosition = () => {
    if (textareaRef.current) {
      cursorPositionRef.current = textareaRef.current.selectionStart
    }
  }

  // 恢复光标位置
  const restoreCursorPosition = () => {
    if (textareaRef.current && isRecording) {
      // 语音输入时光标始终在末尾
      const endPos = displayText.length
      textareaRef.current.selectionStart = endPos
      textareaRef.current.selectionEnd = endPos
      cursorPositionRef.current = endPos
    } else if (textareaRef.current) {
      textareaRef.current.selectionStart = cursorPositionRef.current
      textareaRef.current.selectionEnd = cursorPositionRef.current
    }
  }

  // ========== 核心：实时识别只更新当前句（不重叠），整句完成后拼接 ==========
  const updateRecognitionResult = useCallback((text: string) => {
    if (isStoppingRef.current) return
    const clean = cleanText(text)
    
    // 去重：相同结果不更新
    if (clean === lastRecognizedRef.current) return
    lastRecognizedRef.current = clean

    // 只更新当前识别文本（不重叠）
    setCurrentRecognizingText(clean)
    handleTextareaResize()
    resetSilenceTimer()
    resetSentenceEndTimer()
    
    // 确保光标在文本末尾
    setTimeout(restoreCursorPosition, 0)
  }, [handleTextareaResize, displayText, isRecording])

  const handleTextareaClick = () => {
    if (isRecording) {
      stopRecognition()
    }
  }

  const handleManualEdit = (value: string) => {
    if (isRecording) {
      // 手动编辑时停止录音
      stopRecognition()
    }
    setConfirmedText(value)
    setCurrentRecognizingText('')
    lastRecognizedRef.current = ''
    // 保存手动编辑后的光标位置
    saveCursorPosition()
    setTimeout(handleTextareaResize, 0)
  }

  // 启动录音：清空所有内容并聚焦输入框
  const startRecognition = async () => {
    try {
      // 重置所有状态
      setConfirmedText('')
      setCurrentRecognizingText('')
      lastRecognizedRef.current = ''
      isStoppingRef.current = false
      clearSentenceEndTimer()

      if (!navigator.mediaDevices?.getUserMedia) {
        notify({ type: 'error', message: '浏览器不支持录音' })
        return
      }

      // 聚焦输入框并设置光标到末尾
      if (textareaRef.current) {
        textareaRef.current.focus()
        cursorPositionRef.current = 0
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      const wsUrl = `${ALIYUN_URL}?appkey=${ALIYUN_APP_KEY}&token=${ALIYUN_TOKEN}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        sendStartCmd(ws)
        setTimeout(() => {
          if (!isStoppingRef.current) {
            startAudioPipe(stream)
            setIsRecording(true)
            resetSilenceTimer()
            // 确保输入框聚焦且光标在末尾
            if (textareaRef.current) {
              textareaRef.current.focus()
              restoreCursorPosition()
            }
          }
        }, 100)
      }

      ws.onmessage = (e) => {
        if (isStoppingRef.current || typeof e.data !== 'string') return
        try {
          const data = JSON.parse(e.data)
          const h = data.header
          if (!h) return

          // 实时识别结果更新
          if (h.name === 'TranscriptionResultChanged') {
            updateRecognitionResult(data.payload?.result || '')
          }
          // 句子结束：合并到已确认文本
          else if (h.name === 'SentenceEnd') {
            const clean = cleanText(data.payload?.result || '')
            if (clean) {
              setConfirmedText(prev => `${prev} ${clean}`.trim())
              setCurrentRecognizingText('')
              lastRecognizedRef.current = ''
              // 更新光标位置
              restoreCursorPosition()
            }
          }
          // 识别完成
          else if (h.name === 'TranscriptionCompleted') {
            const clean = cleanText(data.payload?.result || '')
            if (clean) {
              setConfirmedText(prev => `${prev} ${clean}`.trim())
              setCurrentRecognizingText('')
              lastRecognizedRef.current = ''
              // 更新光标位置
              restoreCursorPosition()
            }
          }
          // 识别失败
          else if (h.name === 'TaskFailed') {
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
        stopRecognition()
      }

      ws.onclose = () => {
        stopRecognition()
      }

    } catch (err) {
      console.error('启动录音失败:', err)
      notify({ type: 'error', message: '录音启动失败，请检查麦克风权限' })
      stopRecognition()
    }
  }

  const sendStartCmd = (ws: WebSocket) => {
    try {
      ws.send(JSON.stringify({
        header: {
          message_id: generateMessageId(),
          task_id: taskIdRef.current,
          namespace: 'SpeechTranscriber',
          name: 'StartTranscription',
          appkey: ALIYUN_APP_KEY
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
        if (
          isStoppingRef.current ||
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN
        ) return

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

    // 清理计时器
    clearSilenceTimer()
    clearSentenceEndTimer()

    // 合并最后识别的文本
    if (currentRecognizingText) {
      setConfirmedText(prev => `${prev} ${currentRecognizingText}`.trim())
      setCurrentRecognizingText('')
      lastRecognizedRef.current = ''
    }

    // 更新状态
    setIsRecording(false)

    // 清理音频资源
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    // 关闭WebSocket
    setTimeout(() => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      isStoppingRef.current = false
      // 停止录音后保持输入框聚焦
      if (textareaRef.current) {
        textareaRef.current.focus()
        restoreCursorPosition()
      }
    }, 300)
  }

  const toggleVoice = () => {
    if (isRecording) {
      stopRecognition()
    } else {
      startRecognition()
    }
  }

  useEffect(() => {
    // 组件卸载清理
    return () => {
      stopRecognition()
      clearSentenceEndTimer()
    }
  }, [])

  // 监听输入框焦点变化，录音时自动聚焦
  useEffect(() => {
    if (isRecording && textareaRef.current && !document.activeElement?.isEqualNode(textareaRef.current)) {
      textareaRef.current.focus()
      restoreCursorPosition()
    }
  }, [isRecording])

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

    // 发送消息
    onSend(finalText, files)
    
    // 清空输入
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

  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      isRecording={isRecording}
      onToggleVoiceInput={toggleVoice}
      onSend={handleSend}
      onFileUploadClick={handleFileUploadClick}
      theme={theme}
    />
  )

  return (
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
              onClick={handleTextareaClick}
              onFocus={handleTextareaClick}
              onSelect={saveCursorPosition} // 选择文本时保存光标位置
              // 移除readOnly属性，保持输入框可编辑
            />
          </div>
          {!isMultipleLine && operation}
        </div>
      </div>
      {isMultipleLine && <div className='px-[9px]'>{operation}</div>}
    </div>
  )
}

const ChatInputAreaWrapper = (props: ChatInputAreaProps) => (
  <FileContextProvider><ChatInputArea {...props} /></FileContextProvider>
)

export default ChatInputAreaWrapper