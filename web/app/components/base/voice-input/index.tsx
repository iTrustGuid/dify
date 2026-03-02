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

    // 新增：关闭键盘辅助函数
    const closeKeyboard = useCallback(() => {
      // 确保所有场景下都关闭键盘
      if (document.activeElement) {
        ;(document.activeElement as HTMLElement).blur()
      }
      // 兼容移动端特殊处理
      if (/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.body.scrollIntoView({ behavior: 'smooth' })
      }
    }, [])

    const clearInterval = useRafInterval(() => {
      setOriginDuration(p => p + 1)
    }, 1000, { enabled: startRecord })

    // 开始录音
    const handleStartRecord = useCallback(async () => {
      try {
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
        closeKeyboard() // 新增：开始录音立即关闭键盘
      } catch (err) {
        closeKeyboard() // 新增：录音启动失败也关闭键盘
        onCancel() // 授权失败时关闭弹框
      }
    }, [onCancel, closeKeyboard])

    // 停止并识别
    const handleStopRecorder = useCallback(async () => {
      // 先关闭键盘，不管识别是否成功
      closeKeyboard()
      
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
        onConverted('') // 识别失败也调用回调
      } finally {
        setStartConvert(false)
        setStartRecord(false)
        setOriginDuration(0)
        recorder.current = null
        closeKeyboard() // 新增：最终兜底关闭键盘
      }
    }, [startRecord, onConverted, onCancel, params.appId, params.token, pathname, wordTimestamps, closeKeyboard])

    useImperativeHandle(ref, () => ({
      start: handleStartRecord,
      stop: handleStopRecorder,
    }), [handleStartRecord, handleStopRecorder])

    useEffect(() => {
      return () => {
        if (recorder.current) {
          try { 
            recorder.current.stop(); 
            recorder.current.destroy();
            closeKeyboard() // 新增：组件卸载时关闭键盘
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