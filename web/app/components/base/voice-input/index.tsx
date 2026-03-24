import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiCloseLine, RiLoader2Line } from '@remixicon/react'
import cn from '@/utils/classnames'
import s from './index.module.css'
import { fetchAliyunNlsToken } from '@/utils/aliyun-nls'

type VoiceInputTypes = {
  onConverted: (text: string) => void
  onCancel: () => void
}

const ALIYUN_URL = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1'

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
  
  const aliyunConfigRef = useRef<{ token: string; appKey: string } | null>(null)
  const taskIdRef = useRef<string>(
    Array(32).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  )
  const finalSentencesRef = useRef<string[]>([])

  const generateMessageId = useCallback(() => {
    return Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('')
  }, [])

  const resumeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(console.error)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const config = await fetchAliyunNlsToken()
        aliyunConfigRef.current = config
        initRecognition()
      } catch (err) {
        console.error('获取阿里云Token失败', err)
        onCancel()
      }
    }
    init()
    return () => cleanup()
  }, [onCancel])

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
      const config = aliyunConfigRef.current
      if (!config) {
        onCancel()
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })
      streamRef.current = stream

      const wsUrl = `${ALIYUN_URL}?token=${config.token}&appkey=${config.appKey}`
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
            console.error('❌ NLS Task Failed:', data.header?.status_text || 'Unknown error')
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
    const config = aliyunConfigRef.current
    if (!config) return

    ws.send(JSON.stringify({
      header: {
        message_id: generateMessageId(),
        task_id: taskIdRef.current,
        namespace: 'SpeechTranscriber',
        name: 'StartTranscription',
        appkey: config.appKey,
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
    const config = aliyunConfigRef.current
    const ws = wsRef.current
    if (!ws || !config || ws.readyState !== WebSocket.OPEN) return

    ws.send(JSON.stringify({
      header: {
        message_id: generateMessageId(),
        task_id: taskIdRef.current,
        namespace: 'SpeechTranscriber',
        name: 'StopTranscription',
        appkey: config.appKey,
      },
      payload: {},
    }))
  }

  const startAudioProcessing = (stream: MediaStream) => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const audioContext = new AudioContextClass({ sampleRate: 16000 })
    audioContextRef.current = audioContext

    if (audioContext.state === 'suspended') {
      resumeAudioContext()
    }

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