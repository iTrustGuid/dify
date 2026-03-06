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
import Recorder from 'js-audio-recorder'
import { useRafInterval } from 'ahooks'
import { convertToMp3 } from './utils'
import { audioToText } from '@/service/share'

export type VoiceInputRef = {
  start: () => Promise<boolean>;
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

    // 防止重复调用
    const isStopping = useRef(false)

    // 关闭键盘辅助函数
    const closeKeyboard = useCallback(() => {
      if (document.activeElement) {
        ;(document.activeElement as HTMLElement).blur()
      }
      if (/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.body.scrollIntoView({ behavior: 'smooth' })
      }
    }, [])

    // 启动录音
    const handleStartRecord = useCallback(async (): Promise<boolean> => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('浏览器不支持录音功能')
        }

        if (recorder.current) {
          recorder.current.destroy()
          recorder.current = null
        }
        
        recorder.current = new Recorder({
          sampleBits: 16,
          sampleRate: 16000,
          numChannels: 1,
          compiling: false,
        })
        
        await recorder.current.start()
        setStartRecord(true)
        setOriginDuration(0)
        closeKeyboard()
        return true
      } catch (err) {
        console.error('录音启动/授权失败:', err)
        closeKeyboard()
        if (recorder.current) {
          try { recorder.current.destroy() } catch {}
          recorder.current = null
        }
        setStartRecord(false)
        setOriginDuration(0)
        // 授权失败时调用取消回调
        onCancel()
        return false
      }
    }, [closeKeyboard, onCancel])

    // 停止录音并识别
    const handleStopRecorder = useCallback(async () => {
      if (isStopping.current) return
      isStopping.current = true

      try {
        closeKeyboard()
        
        if (!startRecord || !recorder.current) {
          return
        }

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
        recorder.current = null
        closeKeyboard()
        isStopping.current = false
      }
    }, [startRecord, onConverted, params.appId, params.token, pathname, wordTimestamps, closeKeyboard])

    useImperativeHandle(ref, () => ({
      start: handleStartRecord,
      stop: handleStopRecorder,
    }), [handleStartRecord, handleStopRecorder])

    // 组件卸载时清理
    useEffect(() => {
      return () => {
        if (recorder.current) {
          try { 
            recorder.current.stop(); 
            recorder.current.destroy();
            closeKeyboard()
          } catch {}
          recorder.current = null
        }
      }
    }, [closeKeyboard])

    return <div className="hidden" />
  }
)

VoiceInput.displayName = 'VoiceInput'
export default VoiceInput