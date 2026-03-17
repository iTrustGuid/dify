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

  // 定义缺失的 isDragActive 变量
  const { isDragActive } = useFile(visionConfig!)

  // 语音状态
  const [isRecording, setIsRecording] = useState(false)
  const isStoppingRef = useRef(false)
  const tempResultRef = useRef('') // 临时存储识别中的文本
  const finalResultRef = useRef('') // 最终完整句子

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

  // 实时更新输入框（移除isRecording限制）
  const updateTempResult = (text: string) => {
    const clean = correctAndCleanText(text)
    tempResultRef.current = clean
    // 强制更新输入框，确保实时显示
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

  const startRecognition = async () => {
    try {
      isStoppingRef.current = false
      setQuery('')
      finalResultRef.current = ''
      tempResultRef.current = ''

      // 权限检查
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
          autoGainControl: true, // 确保录音音量正常
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
        // 延长静音检测时间（避免过早停止）
        silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 3000) as any
      }

      ws.onmessage = (e) => {
        if (isStoppingRef.current) return
        try {
          const data = JSON.parse(e.data)
          const h = data.header
          if (!h) return

          console.log('📥 识别结果:', data) // 调试日志

          // 实时更新中间结果（边说边显）
          if (h.name === 'TranscriptionResultChanged') {
            const txt = data.payload?.result || ''
            // 立即更新，不做任何限制
            updateTempResult(txt)
            resetSilenceTimer()
          }

          // 最终结果确认
          if (h.name === 'TranscriptionCompleted') {
            const txt = data.payload?.result || tempResultRef.current // 兜底：用临时结果
            updateFinalResult(txt)
            stopRecognition()
          }

          // 句子结束也更新（避免无输出）
          if (h.name === 'SentenceEnd') {
            const txt = data.payload?.result || ''
            updateTempResult(txt)
          }

          // 错误处理
          if (h.name === 'TaskFailed') {
            console.error('❌ 识别失败:', data.header?.status_text)
            // 失败时用临时结果兜底
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
        // 错误时兜底
        if (tempResultRef.current) {
          updateFinalResult(tempResultRef.current)
        }
        stopRecognition()
      }

      ws.onclose = (e) => {
        console.log('🔌 连接关闭:', e.code, e.reason)
        // 关闭时兜底
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

  // ✅ 核心优化：基于阿里云官方参数说明配置最优参数
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
        // 基础必开参数
        enable_intermediate_result: true, // 开启中间结果（语义断句依赖）
        enable_punctuation_prediction: true, // 开启标点预测
        enable_inverse_text_normalization: true, // 开启文本归一化
        
        // ✅ 断句优化
        enable_semantic_sentence_detection: true, // 开启语义断句（提升断句准确率）
        enable_multi_thresh_mod: true, // 防止VAD断句切割过长（语义断句关闭时生效）
        max_sentence_silence: 800, // 语义断句开启后自动失效，保留默认值
        
        // ✅ 识别质量优化
        disfluency: true, // 过滤语气词（嗯、啊、哦），减少无效重复
        speech_noise_threshold: -0.2, // 噪音阈值（平衡噪音过滤和语音识别）
        enable_words: false, // 关闭词信息返回（默认值，减少数据量）
        
        // 实时性优化
        first_package_delay: 100, // 首包延迟
        max_delay_time: 200, // 最大延迟
        output_format: 'json',
      },
    }))
  }

  // 重置静音定时器（保证持续说话时不停止）
  const resetSilenceTimer = () => {
    if (isStoppingRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => stopRecognition(), 8000) as any
  }

  const startAudioPipe = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 16000,
        latencyHint: 'interactive'
      })
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      // 减小缓冲区，提升实时性
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

  // 停止时兜底：确保有输出
  const stopRecognition = () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    setIsRecording(false)
    clearSilenceTimer()

    // 停止时用临时结果更新输入框（核心：解决无输出）
    if (tempResultRef.current) {
      updateFinalResult(tempResultRef.current)
    }

    // 清理资源
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
        // 先发送停止指令
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

  // 页面卸载清理
  useEffect(() => {
    return () => {
      stopRecognition()
    }
  }, [])

  // 发送逻辑
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
      const finalText = correctAndCleanText(query)
      if (!finalText) {
        notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
        return
      }
      if (checkInputsForm(inputs, inputsForm)) {
        onSend(finalText, files)
        setQuery('')
        finalResultRef.current = ''
        tempResultRef.current = ''
        setFiles([])
      }
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
            {/* 确保输入框可实时显示，只读状态不影响显示 */}
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