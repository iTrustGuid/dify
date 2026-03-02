import {
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, usePathname } from 'next/navigation'
import { RiLoader2Line } from '@remixicon/react'
import Recorder from 'js-audio-recorder'
import { useRafInterval } from 'ahooks'
import { convertToMp3 } from './utils'
import cn from '@/utils/classnames'
import { StopCircle } from '@/app/components/base/icons/src/vender/solid/mediaAndDevices'
import { audioToText } from '@/service/share'

export type VoiceInputRef = {
  start: () => void
  stop: () => void
}

type VoiceInputProps = {
  onConverted: (text: string) => void
  onCancel: () => void
  wordTimestamps?: string
}

const VoiceInput = forwardRef<VoiceInputRef, VoiceInputProps>(
  ({ onConverted, onCancel, wordTimestamps }, ref) => {
    const { t } = useTranslation()
    const recorder = useRef<Recorder | null>(null)
    const [startRecord, setStartRecord] = useState(false)
    const [startConvert, setStartConvert] = useState(false)
    const [originDuration, setOriginDuration] = useState(0)
    const pathname = usePathname()
    const params = useParams()

    const clearInterval = useRafInterval(() => {
      setOriginDuration(p => p + 1)
    }, 1000, { enabled: startRecord })

    // 开始录音 - 增强错误处理
    const handleStartRecord = useCallback(async () => {
      try {
        if (recorder.current) {
          recorder.current.destroy()
          recorder.current = null
        }
        
        // 先检测麦克风权限
        const permission = await navigator.permissions.query({ 
          name: 'microphone' as PermissionName 
        })
        
        // 如果权限被拒绝，直接调用取消回调
        if (permission.state === 'denied') {
          onCancel()
          return
        }
        
        recorder.current = new Recorder({
          sampleBits: 16,
          sampleRate: 16000,
          numChannels: 1,
          compiling: false,
        })
        
        // 微信环境下，授权后可能需要延迟启动录音
        if (/MicroMessenger/i.test(navigator.userAgent)) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
        
        await recorder.current.start()
        setStartRecord(true)
        setOriginDuration(0)
      } catch (err) {
        console.error('录音启动失败:', err)
        // 确保错误时也关闭弹框
        onCancel()
      }
    }, [onCancel])

    // 停止并识别
    const handleStopRecorder = useCallback(async () => {
      if (!startRecord || !recorder.current) {
        onCancel()
        return
      }

      try {
        setStartRecord(false)
        setStartConvert(true)
        recorder.current.stop()

        const blob = convertToMp3(recorder.current)
        const file = new File([blob], 'voice.mp3', { type: 'audio/mp3' })
        const formData = new FormData()
        formData.append('file', file)
        formData.append('word_timestamps', wordTimestamps || 'disabled')

        let url = ''
        let isPublic = false
        if (params.token) {
          url = '/audio-to-text'
          isPublic = true
        } else if (params.appId) {
          url = pathname.includes('explore/installed')
            ? `/installed-apps/${params.appId}/audio-to-text`
            : `/apps/${params.appId}/audio-to-text`
        }

        const res = await audioToText(url, isPublic, formData)
        onConverted(res?.text || '')
      } catch (e) {
        console.error('语音识别失败:', e)
        onConverted('')
      } finally {
        setStartConvert(false)
        setStartRecord(false)
        setOriginDuration(0)
        if (recorder.current) {
          try {
            recorder.current.destroy()
          } catch (err) {}
          recorder.current = null
        }
      }
    }, [startRecord, onConverted, onCancel, params.appId, params.token, pathname, wordTimestamps])

    useImperativeHandle(ref, () => ({
      start: handleStartRecord,
      stop: handleStopRecorder,
    }), [handleStartRecord, handleStopRecorder])

    useEffect(() => {
      return () => {
        if (recorder.current) {
          try { 
            recorder.current.stop(); 
            recorder.current.destroy() 
          } catch {}
          recorder.current = null
        }
      }
    }, [])

    return <div className="hidden" />
  }
)

VoiceInput.displayName = 'VoiceInput'
export default VoiceInput