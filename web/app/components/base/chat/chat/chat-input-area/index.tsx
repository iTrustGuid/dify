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
const ALIYUN_TOKEN = 'c0e798e91ab6432d937e3fe64f6c38f7'
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

// 核心：去重 + 纠错 + 通顺化
const correctAndCleanText = (text: string): string => {
  if (!text) return ''

  let t = text.trim()

  // 1. 基础纠错
  Object.entries(CUSTOM_CORRECTION_DICT).forEach(([w, r]) => {
    t = t.replace(new RegExp(w, 'g'), r)
  })

  // 2. 超级去重：连续重复字/词只保留一次
  t = t
    .replace(/([\u4e00-\u9fa5a-zA-Z])\1+/g, '$1')
    .replace(/(.{2,5}?)\1+/g, '$1')

  // 3. 清理多余空格、乱码
  t = t.replace(/\s+/g, ' ').trim()

  return t
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

  // 【只修复】你原本的写法：visionConfig可能undefined，加安全判断
  const { isDragActive } = visionConfig ? useFile(visionConfig) : { isDragActive: false }

  // 【只修复】补缺失的 store 和 checkInputsForm
  const filesStore = useFileStore()
  const { checkInputsForm } = useCheckInputsForms()

  // 语音状态（完全保留你原逻辑）
  const [isRecording, setIsRecording] = useState(false)
  const isStoppingRef = useRef(false)
  const tempResultRef = useRef('')
  const finalResultRef = useRef('')

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

  // 【完全保留你原逻辑】实时更新输入框
  const updateTempResult = (text: string) => {
    const clean = correctAndCleanText(text)
    tempResultRef.current = clean
    setQuery(clean)
    handleTextareaResize()
  }

  const updateFinalResult = (text: string) => {
    const clean = correctAndCleanText(text)
    finalResultRef.current = clean
    tempResultRef.current = clean
    setQuery(clean)
    handleTextareaResize()
  }

  // 【完全保留你原逻辑】手动编辑
  const handleManualEdit = (value: string) => {
    if (isRecording) {
      stopRecognition()
      setIsRecording(false)
    }
    setQuery(value)
    finalResultRef.current = value
    tempResultRef.current = value
    setTimeout(handleTextareaResize, 0)
  }

  // 【完全保留你原逻辑】startRecognition
  const startRecognition = async () => {
    try {
      isStoppingRef.current = false
      setQuery('')
      finalResultRef.current = ''
      tempResultRef.current = ''

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        notify({ type: 'error', message: '浏览器不支持录音功能' })
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          sampleRate: 16000, 
          channelCount: 1, 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0.05
        },
      })
      streamRef.current = stream

      const ws = new WebSocket(`${ALIYUN_URL}?token=${ALIYUN_TOKEN}&appkey=${ALIYUN_APP_KEY}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ 语音连接成功')
        setIsRecording(true)
        sendStartCmd(ws)
        startAudioPipe(stream)
        silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 2000) as any
      }

      ws.onmessage = (e) => {
        if (isStoppingRef.current) return
        try {
          const data = JSON.parse(e.data)
          const h = data.header
          if (!h) return

          console.log('📥 识别结果:', data)

          if (h.name === 'TranscriptionResultChanged') {
            const txt = data.payload?.result || ''
            updateTempResult(txt)
            resetSilenceTimer()
          }

          if (h.name === 'TranscriptionCompleted') {
            const txt = data.payload?.result || tempResultRef.current
            updateFinalResult(txt)
            stopRecognition()
          }

          if (h.name === 'SentenceEnd') {
            const txt = data.payload?.result || ''
            updateTempResult(txt)
          }

          if (h.name === 'TaskFailed') {
            console.error('❌ 识别失败:', data.header?.status_text)
            if (tempResultRef.current) {
              updateFinalResult(tempResultRef.current)
            }
            stopRecognition()
          }
        } catch (err) {
          console.error('❌ 解析结果失败:', err)
        }
      }

      ws.onerror = (err) => {
        console.error('❌ WebSocket错误:', err)
        if (tempResultRef.current) {
          updateFinalResult(tempResultRef.current)
        }
        stopRecognition()
      }

      ws.onclose = (e) => {
        console.log('🔌 连接关闭:', e.code, e.reason)
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

  // 【完全保留你原逻辑】sendStartCmd
  const sendStartCmd = (ws: WebSocket) => {
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
        enable_semantic_sentence_detection: true,
        enable_multi_thresh_mod: true,
        max_sentence_silence: 800,
        disfluency: true,
        speech_noise_threshold: -0.2,
        enable_words: false,
        first_package_delay: 100,
        max_delay_time: 200,
        output_format: 'json',
      },
    }))
  }

  const resetSilenceTimer = () => {
    if (isStoppingRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 8000) as any
  }

  // 【完全保留你原逻辑】startAudioPipe
  const startAudioPipe = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 16000,
        latencyHint: 'interactive'
      })
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const proc = ctx.createScriptProcessor(2048, 1, 1)
      processorRef.current = proc

      proc.onaudioprocess = (e) => {
        if (isStoppingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
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

  // 【完全保留你原逻辑】stopRecognition
  const stopRecognition = () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    setIsRecording(false)
    clearSilenceTimer()

    if (tempResultRef.current) {
      updateFinalResult(tempResultRef.current)
    }

    if (processorRef.current) { 
      processorRef.current.disconnect(); 
      processorRef.current = null 
    }
    if (streamRef.current) { 
      streamRef.current.getTracks().forEach(t => t.stop()); 
      streamRef.current = null 
    }

    setTimeout(() => {
      if (wsRef.current) { 
        if (wsRef.current.readyState === WebSocket.OPEN) {
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
        }
        wsRef.current.close(); 
        wsRef.current = null 
      }
      if (audioContextRef.current) { 
        audioContextRef.current.close(); 
        audioContextRef.current = null 
      }
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
    return () => {
      stopRecognition()
    }
  }, [])

  // ==============================================
  // ✅【唯一修改：修复发送按钮，完全不碰输入框/语音】
  // ==============================================
  const handleSend = () => {
    console.log('点击发送:', { query, isResponding, disabled })

    if (isResponding) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForResponse') })
      return
    }
    if (!onSend) return

    const { files, setFiles } = filesStore.getState()
    // 检查是否有未上传完的本地文件
    const hasUnuploaded = files.some(
      item => item.transferMethod === TransferMethod.local_file && !item.uploadedId
    )
    if (hasUnuploaded) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForFileUpload') })
      return
    }

    const finalText = correctAndCleanText(query)
    if (!finalText) {
      notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
      return
    }

    // 表单验证（你原本就有，补全调用）
    const isValid = checkInputsForm(inputs, inputsForm)
    if (!isValid) return

    // 发送
    onSend(finalText, files)
    // 清空
    setQuery('')
    finalResultRef.current = ''
    tempResultRef.current = ''
    setFiles([])
  }

  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      isRecording={isRecording}
      onToggleVoiceInput={toggleVoice}
      onSend={handleSend}
      theme={theme}
    />
  )

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
            {/* ✅ 完全还原你原本的 Textarea：没有 disabled，只有 readOnly={isRecording} */}
            <Textarea
              ref={textareaRef}
              className={cn('body-lg-regular w-full resize-none bg-transparent p-1 leading-6 text-text-primary outline-none')}
              placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '请输入消息')}
              autoFocus
              minRows={1}
              value={query}
              onChange={e => handleManualEdit(e.target.value)}
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