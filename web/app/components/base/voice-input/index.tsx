import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiCloseLine, RiLoader2Line } from '@remixicon/react'
import cn from '@/utils/classnames'
import s from './index.module.css'

type VoiceInputTypes = {
  onConverted: (text: string) => void
  onCancel: () => void
}

// ================= 阿里云配置 =================
const ALIYUN_TOKEN = 'e5c99cf4e2534774ac17f348c522edf5' // ⚠️ 仅测试用！
const ALIYUN_APP_KEY = 'PtcXfBxLzBd8HU4N'
const ALIYUN_URL = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'
// =============================================

const VoiceInput = ({
  onCancel,
  onConverted,
}: VoiceInputTypes) => {
  const { t } = useTranslation()
  
  const [isConnecting, setIsConnecting] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [realTimeText, setRealTimeText] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  
  const taskIdRef = useRef<string>(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  )
  const finalSentencesRef = useRef<string[]>([])

  // ✅ 生成 32 位小写十六进制 ID（匹配阿里云示例）
  const generateMessageId = useCallback(() => {
    return Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('')
  }, [])

  // 恢复 AudioContext（防挂起）
  const resumeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(console.error)
    }
  }, [])

  useEffect(() => {
    initRecognition()
    return () => cleanup()
  }, [])

  // 用户交互时恢复音频上下文（解决页面切后台后挂起问题）
  useEffect(() => {
    document.addEventListener('click', resumeAudioContext, { once: true })
    document.addEventListener('touchstart', resumeAudioContext, { once: true })
    return () => {
      document.removeEventListener('click', resumeAudioContext)
      document.removeEventListener('touchstart', resumeAudioContext)
    }
  }, [resumeAudioContext])

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setDuration(d => d >= 60 ? 60 : d + 1)
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording])

  const initRecognition = async () => {
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

      ws.onopen = () => {
        console.log('✅ Aliyun NLS WebSocket Connected')
        sendStartCommand(ws)
        setIsConnecting(false)
        setIsRecording(true)
        startAudioProcessing(stream)
      }

      ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') return
          const data = JSON.parse(event.data)
          const header = data.header
          if (!header || typeof header.name !== 'string') return

          if (header.name === 'TranscriptionResultChanged') {
            setRealTimeText(data.payload?.result || '')
          } 
          else if (header.name === 'SentenceEnd') {
            const sentence = data.payload?.result?.trim() || ''
            if (sentence) finalSentencesRef.current.push(sentence)
          }
          else if (header.name === 'TranscriptionCompleted') {
            const finalText = finalSentencesRef.current.join('') || realTimeText.trim()
            if (finalText) onConverted(finalText)
            else onCancel()
            cleanup()
          }
          else if (header.name === 'TaskFailed') {
            const errorMsg = data.header?.status_text || 'Unknown error'
            console.error('❌ NLS Task Failed:', errorMsg)
            onCancel()
            cleanup()
          }
        } catch (e) {
          console.error('Parse WS message error', e)
        }
      }

      ws.onerror = (err) => {
        console.error('❌ WebSocket Error:', err)
        setIsConnecting(false)
        onCancel()
        cleanup()
      }

      ws.onclose = () => {
        if (isRecording) onCancel()
        cleanup()
      }

    } catch (err) {
      console.error('Init recognition failed:', err)
      onCancel()
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

    // 如果被挂起，尝试恢复（配合用户交互）
    if (audioContext.state === 'suspended') {
      resumeAudioContext()
    }

    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    let lastSendTime = Date.now()

    processor.onaudioprocess = (e) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      const inputData = e.inputBuffer.getChannelData(0)
      const output = new Int16Array(inputData.length)

      // 转换为 16-bit PCM
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      // ✅ 关键：始终发送数据（即使静音），防止 IDLE_TIMEOUT
      ws.send(output.buffer)

      // 可选：记录发送时间用于调试
      lastSendTime = Date.now()
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const stopRecognition = () => {
    setIsRecording(false)
    sendStopCommand()
  }

  const cleanup = () => {
    finalSentencesRef.current = []
    
    if (timerRef.current) clearInterval(timerRef.current)
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(track => track.stop())
    audioContextRef.current?.close()
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close()
    
    timerRef.current = null
    silenceTimerRef.current = null
    processorRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    wsRef.current = null
  }

  const handleManualStop = () => stopRecognition()

  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  return (
    <div className={cn(s.wrapper, 'absolute inset-0 rounded-xl')}>
      <div className='absolute inset-[1.5px] flex items-center overflow-hidden rounded-[10.5px] bg-primary-25 py-[14px] pl-[14.5px] pr-[6.5px]'>
        
        {isConnecting && (
          <RiLoader2Line className='mr-2 h-4 w-4 animate-spin text-primary-700' />
        )}

        {!isConnecting && isRecording && (
           <div className="flex space-x-1 mr-2 items-end h-4">
             <div className="w-1 bg-primary-500 animate-[bounce_0.6s_infinite] h-2"></div>
             <div className="w-1 bg-primary-500 animate-[bounce_0.8s_infinite] h-3"></div>
             <div className="w-1 bg-primary-500 animate-[bounce_0.5s_infinite] h-4"></div>
           </div>
        )}
        
        <div className='grow min-w-0'>
          {isConnecting && (
            <div className='text-sm text-gray-500'>{t('common.voiceInput.connecting') || 'Connecting...'}</div>
          )}
          
          {isRecording && (
            <div className='text-sm text-gray-700 truncate font-medium'>
              {realTimeText || (t('common.voiceInput.speaking') || 'Speaking...')}
            </div>
          )}
        </div>

        {!isConnecting && isRecording && (
          <div
            className='ml-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-primary-100 transition-colors'
            onClick={handleManualStop}
            title="Stop Recording"
          >
            <RiCloseLine className='h-5 w-5 text-primary-600' />
          </div>
        )}
        
        <div className={`ml-2 w-[45px] shrink-0 text-right text-xs font-medium ${duration > 50 ? 'text-[#F04438]' : 'text-gray-500'}`}>
          {`0${minutes}:${seconds >= 10 ? seconds : `0${seconds}`}`}
        </div>
      </div>
    </div>
  )
}

export default VoiceInput