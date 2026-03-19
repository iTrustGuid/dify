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

// ================= 阿里云配置（强纠错版） =================
const ALIYUN_TOKEN = 'e5c99cf4e2534774ac17f348c522edf5'
const ALIYUN_APP_KEY = 'PtcXfBxLzBd8HU4N'
const ALIYUN_URL = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'
// =============================================

// 【移除所有正则纠错】只保留基础文本清理
const cleanText = (text: string): string => {
  if (!text) return ''
  // 仅保留首尾去空格，所有纠错交给阿里云
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

  const [query, setQuery] = useState('')
  const isComposingRef = useRef(false)

  // 安全判断
  const { isDragActive } = visionConfig ? useFile(visionConfig) : { isDragActive: false }

  // 补全依赖
  const filesStore = useFileStore()
  const { checkInputsForm } = useCheckInputsForms()

  // 语音状态（保留原结构）
  const [isRecording, setIsRecording] = useState(false)
  const isStoppingRef = useRef(false)
  const tempResultRef = useRef('')
  const finalResultRef = useRef('')
  // 新增：标记是否已发送启动指令
  const isStartCmdSentRef = useRef(false)

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

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }

  // 【优化：实时更新无卡顿】
  const updateTempResult = useCallback((text: string) => {
    if (isStoppingRef.current) return
    const clean = cleanText(text)
    tempResultRef.current = clean
    // 立即更新，无防抖延迟
    setQuery(clean)
    handleTextareaResize()
  }, [handleTextareaResize])

  const updateFinalResult = useCallback((text: string) => {
    const clean = cleanText(text)
    finalResultRef.current = clean
    tempResultRef.current = clean
    setQuery(clean)
    handleTextareaResize()
  }, [handleTextareaResize])

  // 【核心修复1：输入框点击/输入立即停止识别】
  const handleTextareaClick = () => {
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
    }
  }

  // 【核心修复2：手动编辑时强制停止识别】
  const handleManualEdit = (value: string) => {
    // 不管是否在识别，都停止
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
    }
    setQuery(value)
    finalResultRef.current = value
    tempResultRef.current = value
    setTimeout(handleTextareaResize, 0)
  }

  // 【核心修复3：修复 Gateway:MESSAGE_INVALID 错误】
  const startRecognition = async () => {
    try {
      // 重置所有状态
      isStoppingRef.current = false
      isStartCmdSentRef.current = false
      setQuery('')
      finalResultRef.current = ''
      tempResultRef.current = ''

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        notify({ type: 'error', message: '浏览器不支持录音功能' })
        return
      }

      // 【修复1：音频参数兼容所有浏览器】
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          sampleRate: 16000, 
          channelCount: 1, 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: false,
          latency: 0.05 // 降低兼容性问题
        },
      })
      streamRef.current = stream

      // 【修复2：正确拼接 URL 参数】
      const wsUrl = `${ALIYUN_URL}?appkey=${ALIYUN_APP_KEY}&token=${ALIYUN_TOKEN}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer' // 明确指定二进制类型
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ 语音连接成功')
        // 【修复3：先发送启动指令，再启动音频管道】
        sendStartCmd(ws)
        isStartCmdSentRef.current = true
        
        // 延迟启动音频管道，确保启动指令已处理
        setTimeout(() => {
          if (!isStoppingRef.current) {
            startAudioPipe(stream)
            setIsRecording(true)
            // 初始静默超时
            silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 2000) as any
          }
        }, 100)
      }

      ws.onmessage = (e) => {
        if (isStoppingRef.current) return
        
        try {
          // 区分文本消息和二进制消息
          if (typeof e.data === 'string') {
            const data = JSON.parse(e.data)
            const h = data.header
            if (!h) return

            console.log('📥 识别结果:', data)

            // 实时结果更新
            if (h.name === 'TranscriptionResultChanged') {
              const txt = data.payload?.result || ''
              updateTempResult(txt)
              resetSilenceTimer()
            }

            // 完成后更新
            if (h.name === 'TranscriptionCompleted') {
              const txt = data.payload?.result || tempResultRef.current
              updateFinalResult(txt)
              setTimeout(() => stopRecognition(), 100)
            }

            if (h.name === 'SentenceEnd') {
              const txt = data.payload?.result || ''
              updateTempResult(txt)
            }

            if (h.name === 'TaskFailed') {
              console.error('❌ 识别失败:', data.header?.status_text)
              notify({ type: 'error', message: '语音识别失败，请重试' })
              if (tempResultRef.current) {
                updateFinalResult(tempResultRef.current)
              }
              stopRecognition()
            }
          } else {
            // 忽略二进制消息（阿里云不会下发）
            console.warn('📥 收到二进制消息，忽略')
          }
        } catch (err) {
          console.error('❌ 解析结果失败:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('❌ WebSocket错误:', err)
        notify({ type: 'error', message: '语音连接失败，请检查网络' })
        if (tempResultRef.current) {
          updateFinalResult(tempResultRef.current)
        }
        stopRecognition()
      }

      ws.onclose = (e) => {
        console.log('🔌 连接关闭:', e.code, e.reason)
        // 关闭时更新最后结果
        if (tempResultRef.current) {
          updateFinalResult(tempResultRef.current)
        }
        stopRecognition()
      }
    } catch (err) {
      console.error('❌ 启动录音失败:', err)
      notify({ type: 'error', message: '录音启动失败，请检查麦克风权限' })
      stopRecognition()
    }
  }

  // 【核心修复4：简化启动指令，避免参数错误】
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
          max_sentence_silence: 300,
          disfluency: true,
          language: 'zh-CN'
        },
      }))
      console.log('✅ 启动指令发送成功')
    } catch (err) {
      console.error('❌ 发送启动指令失败:', err)
    }
  }

  // 【修复5：音频发送前检查状态，避免无效发送】
  const startAudioPipe = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 16000,
        latencyHint: 'interactive'
      })
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      // 使用兼容的缓冲区大小
      const proc = ctx.createScriptProcessor(1024, 1, 1)
      processorRef.current = proc

      proc.onaudioprocess = (e) => {
        // 【关键修复：只在已发送启动指令且连接正常时发送音频】
        if (isStoppingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isStartCmdSentRef.current) {
          return
        }
        
        try {
          const d = e.inputBuffer.getChannelData(0)
          const out = new Int16Array(d.length)
          for (let i = 0; i < d.length; i++) {
            const s = Math.max(-1, Math.min(1, d[i]))
            out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          wsRef.current.send(out.buffer)
        } catch (err) {
          console.error('❌ 发送音频数据失败:', err)
        }
      }

      source.connect(proc)
      proc.connect(ctx.destination)
    } catch (err) {
      console.error('❌ 初始化音频管道失败:', err)
      stopRecognition()
    }
  }

  // 【优化：重置静默超时】
  const resetSilenceTimer = () => {
    if (isStoppingRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 8000) as any
  }

  // 【优化：停止识别逻辑】
  const stopRecognition = () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    setIsRecording(false)
    clearSilenceTimer()

    // 强制更新最后结果
    if (tempResultRef.current) {
      updateFinalResult(tempResultRef.current)
    }

    // 清理音频资源
    if (processorRef.current) { 
      processorRef.current.disconnect(); 
      processorRef.current = null 
    }
    if (streamRef.current) { 
      streamRef.current.getTracks().forEach(t => t.stop()); 
      streamRef.current = null 
    }

    // 关闭WebSocket
    setTimeout(() => {
      if (wsRef.current) { 
        if (wsRef.current.readyState === WebSocket.OPEN) {
          // 发送停止指令
          try {
            wsRef.current.send(JSON.stringify({
              header: { 
                message_id: generateMessageId(), 
                task_id: taskIdRef.current, 
                namespace: 'SpeechTranscriber', 
                name: 'StopTranscription', 
                appkey: ALIYUN_APP_KEY 
              },
              payload: {}
            }))
          } catch (err) {
            console.error('❌ 发送停止指令失败:', err)
          }
        }
        wsRef.current.close(); 
        wsRef.current = null 
      }
      if (audioContextRef.current) { 
        audioContextRef.current.close(); 
        audioContextRef.current = null 
      }
      isStartCmdSentRef.current = false
      isStoppingRef.current = false
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
    // 组件卸载时清理资源
    return () => {
      stopRecognition()
    }
  }, [])

  // 发送逻辑 - 优化：发送时停止语音识别
  const handleSend = () => {
    console.log('点击发送:', { query, isResponding, disabled })

    // 新增：发送时停止语音识别
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
    }

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

    const finalText = cleanText(query)
    if (!finalText) {
      notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
      return
    }

    const isValid = checkInputsForm(inputs, inputsForm)
    if (!isValid) return

    onSend(finalText, files)
    setQuery('')
    finalResultRef.current = ''
    tempResultRef.current = ''
    setFiles([])
  }

  // 新增：点击文件上传图标时停止语音识别
  const handleFileUploadClick = () => {
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
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

  // 渲染结构
  return (
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
              ref={textareaRef}
              className={cn('body-lg-regular w-full resize-none bg-transparent p-1 leading-6 text-text-primary outline-none')}
              placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '请输入消息')}
              autoFocus
              minRows={1}
              value={query}
              onChange={e => handleManualEdit(e.target.value)}
              onClick={handleTextareaClick}
              onFocus={handleTextareaClick}
              readOnly={isRecording}
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