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

// 阿里云配置
const ALIYUN_TOKEN = 'e5c99cf4e2534774ac17f348c522edf5'
const ALIYUN_APP_KEY = 'PtcXfBxLzBd8HU4N'
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

  // 核心状态
  const [confirmedText, setConfirmedText] = useState('')
  const [currentRecognizingText, setCurrentRecognizingText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  
  // 辅助Ref（关键：精准跟踪焦点状态）
  const isTextareaFocused = useRef(false)
  const lastRecognizedRef = useRef('')
  const sentenceEndTimerRef = useRef<number | null>(null)
  const cursorPositionRef = useRef<number>(0)
  const isStoppingRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const taskIdRef = useRef<string>(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  )

  // 其他依赖
  const { isDragActive } = visionConfig ? useFile(visionConfig) : { isDragActive: false }
  const filesStore = useFileStore()
  const { checkInputsForm } = useCheckInputsForms()

  // 最终显示文本
  const displayText = `${confirmedText} ${currentRecognizingText}`.trim()

  // 工具方法：清除计时器
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
  }
  const clearSentenceEndTimer = () => {
    if (sentenceEndTimerRef.current) clearTimeout(sentenceEndTimerRef.current)
  }

  // 静音自动停止录音（6秒）
  const resetSilenceTimer = () => {
    if (isStoppingRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 6000) as any
  }

  // 句子结束合并文本
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

  // 光标位置管理
  const saveCursorPosition = () => {
    if (textareaRef.current) {
      cursorPositionRef.current = textareaRef.current.selectionStart
    }
  }
  const restoreCursorPosition = () => {
    if (!textareaRef.current) return
    const endPos = displayText.length
    textareaRef.current.selectionStart = endPos
    textareaRef.current.selectionEnd = endPos
    cursorPositionRef.current = endPos
  }

  // 生成消息ID
  const generateMessageId = () =>
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')

  // 更新识别结果
  const updateRecognitionResult = useCallback((text: string) => {
    if (isStoppingRef.current) return
    const clean = cleanText(text)
    if (clean === lastRecognizedRef.current) return
    
    lastRecognizedRef.current = clean
    setCurrentRecognizingText(clean)
    handleTextareaResize()
    resetSilenceTimer()
    resetSentenceEndTimer()
    setTimeout(restoreCursorPosition, 0)
  }, [handleTextareaResize])

  // 安全聚焦输入框（仅未聚焦时执行，避免闪烁）
  const safeFocusTextarea = () => {
    if (textareaRef.current && !isTextareaFocused.current) {
      textareaRef.current.focus()
      restoreCursorPosition()
      isTextareaFocused.current = true
    }
  }

  // 安全失焦输入框（仅聚焦时执行，避免闪烁）
  const safeBlurTextarea = () => {
    if (textareaRef.current && isTextareaFocused.current) {
      textareaRef.current.blur()
      isTextareaFocused.current = false
    }
  }

  // 监听输入框焦点状态（核心：100%精准跟踪）
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const handleFocus = () => {
      isTextareaFocused.current = true
    }
    const handleBlur = () => {
      isTextareaFocused.current = false
    }

    textarea.addEventListener('focus', handleFocus)
    textarea.addEventListener('blur', handleBlur)

    return () => {
      textarea.removeEventListener('focus', handleFocus)
      textarea.removeEventListener('blur', handleBlur)
    }
  }, [])

  // 手动编辑文本
  const handleManualEdit = (value: string) => {
    if (isRecording) stopRecognition()
    setConfirmedText(value)
    setCurrentRecognizingText('')
    lastRecognizedRef.current = ''
    saveCursorPosition()
    setTimeout(handleTextareaResize, 0)
  }

  // 启动录音（聚焦输入框 + 打开键盘，光标闪烁）
  const startRecognition = async () => {
    try {
      // 重置状态
      setConfirmedText('')
      setCurrentRecognizingText('')
      lastRecognizedRef.current = ''
      isStoppingRef.current = false
      clearSentenceEndTimer()

      // 检查浏览器支持
      if (!navigator.mediaDevices?.getUserMedia) {
        notify({ type: 'error', message: '浏览器不支持录音' })
        return
      }

      // 聚焦输入框（打开键盘，光标闪烁）- 仅首次启动时执行
      safeFocusTextarea()

      // 获取麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      // 创建WebSocket连接
      const ws = new WebSocket(`${ALIYUN_URL}?appkey=${ALIYUN_APP_KEY}&token=${ALIYUN_TOKEN}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      // WebSocket打开
      ws.onopen = () => {
        sendStartCmd(ws)
        setTimeout(() => {
          if (isStoppingRef.current) return
          startAudioPipe(stream)
          setIsRecording(true)
          resetSilenceTimer()
        }, 100)
      }

      // WebSocket消息处理
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

      // WebSocket错误
      ws.onerror = (err) => {
        console.error('WebSocket错误:', err)
        notify({ type: 'error', message: '语音连接失败，请检查网络' })
        stopRecognition()
      }

      // WebSocket关闭
      ws.onclose = () => {
        stopRecognition()
      }

    } catch (err) {
      console.error('启动录音失败:', err)
      notify({ type: 'error', message: '录音启动失败，请检查麦克风权限' })
      stopRecognition()
    }
  }

  // 发送启动指令
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

  // 启动音频管道
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

  /**
   * 停止录音（仅关闭语音功能，完全不碰焦点/键盘）
   */
  const stopRecognition = () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true

    // 清除计时器
    clearSilenceTimer()
    clearSentenceEndTimer()

    // 合并最后识别的文本
    if (currentRecognizingText) {
      setConfirmedText(prev => `${prev} ${currentRecognizingText}`.trim())
      setCurrentRecognizingText('')
      lastRecognizedRef.current = ''
    }

    // 仅更新语音状态，不碰任何焦点相关逻辑
    setIsRecording(false)

    // 清理音频资源（安全关闭，避免重复操作）
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    // 清理WebSocket和AudioContext
    setTimeout(() => {
      // 关闭WebSocket
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      // 安全关闭AudioContext（避免重复关闭错误）
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().then(() => {
          audioContextRef.current = null
        }).catch(err => console.error('关闭AudioContext失败:', err))
      } else {
        audioContextRef.current = null
      }

      isStoppingRef.current = false
      // 🔥 核心修改：移除所有焦点恢复逻辑，完全不碰输入框焦点
    }, 300)
  }

  // 切换麦克风状态（仅开关语音，不影响焦点）
  const toggleVoice = () => {
    if (isRecording) {
      stopRecognition() // 关闭语音：焦点/键盘/光标完全不变
    } else {
      startRecognition() // 开启语音：首次聚焦输入框，键盘弹出
    }
  }

  // 发送消息（仅这里执行失焦，关闭键盘）
  const handleSend = () => {
    if (isRecording) stopRecognition() // 先关语音（保留当前焦点状态）
    
    if (isResponding) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForResponse') })
      return
    }
    if (!onSend) return

    const { files, setFiles } = filesStore.getState()
    
    // 检查文件上传状态
    const hasUnuploaded = files.some(
      item => item.transferMethod === TransferMethod.local_file && !item.uploadedId
    )
    if (hasUnuploaded) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForFileUpload') })
      return
    }

    // 检查输入文本
    const finalText = cleanText(displayText)
    if (!finalText) {
      notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
      return
    }

    // 检查表单验证
    const isValid = checkInputsForm(inputs, inputsForm)
    if (!isValid) return

    // 仅发送时失焦输入框（关闭键盘）
    safeBlurTextarea()

    // 发送消息
    onSend(finalText, files)
    
    // 清空输入
    setConfirmedText('')
    setCurrentRecognizingText('')
    lastRecognizedRef.current = ''
    setFiles([])
  }

  // 点击上传文件（核心：仅关闭语音，不影响焦点/键盘状态）
  const handleFileUploadClick = () => {
    // 1. 如果正在录音，先关闭实时语音（麦克风恢复默认）
    if (isRecording) {
      stopRecognition()
    }
    // 2. 完全不碰焦点/键盘相关逻辑，保持当前状态
    // 3. 弹窗逻辑由FileUploaderInChatInput内部处理
  }

  // 组件卸载清理
  useEffect(() => {
    return () => {
      stopRecognition()
      clearSentenceEndTimer()
    }
  }, [])

  // 渲染操作栏
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
              minRows={1}
              value={displayText}
              onChange={e => handleManualEdit(e.target.value)}
              onSelect={saveCursorPosition}
              // 阻止冒泡，避免点击输入框外区域意外失焦
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {!isMultipleLine && operation}
        </div>
      </div>
      {isMultipleLine && <div className='px-[9px]'>{operation}</div>}
    </div>
  )
}

// 包装组件
const ChatInputAreaWrapper = (props: ChatInputAreaProps) => (
  <FileContextProvider><ChatInputArea {...props} /></FileContextProvider>
)

export default ChatInputAreaWrapper