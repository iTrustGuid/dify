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
import {
  RiCloseLine,
  RiLoader2Line,
} from '@remixicon/react'
import Recorder from 'js-audio-recorder'
import { useRafInterval } from 'ahooks'
import { convertToMp3 } from './utils'
import s from './index.module.css'
import cn from '@/utils/classnames'
import { StopCircle } from '@/app/components/base/icons/src/vender/solid/mediaAndDevices'
import { audioToText } from '@/service/share'

export type VoiceInputRef = {
  start: () => void;
  stop: () => void;
};

type VoiceInputProps = {
  onConverted: (text: string) => void;
  onCancel: () => void;
  wordTimestamps?: string;
};

const VoiceInput = forwardRef<VoiceInputRef, VoiceInputProps>(
  ({ onConverted, onCancel, wordTimestamps }, ref) => {
    const { t } = useTranslation()
    const recorder = useRef(
      new Recorder({
        sampleBits: 16,
        sampleRate: 16000,
        numChannels: 1,
        compiling: false,
      })
    )
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
    const drawRecordId = useRef<number | null>(null)
    const [originDuration, setOriginDuration] = useState(0)
    const [startRecord, setStartRecord] = useState(false)
    const [startConvert, setStartConvert] = useState(false)
    const pathname = usePathname()
    const params = useParams()

    const clearInterval = useRafInterval(
      () => {
        setOriginDuration(prev => prev + 1)
      },
      1000,
      { immediate: false, runImmediately: false, enabled: startRecord }
    )

    const drawRecord = useCallback(() => {
      drawRecordId.current = requestAnimationFrame(drawRecord)
      if (!canvasRef.current || !ctxRef.current) return
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      const dataUnit8Array = recorder.current.getAnalyseData()
      const dataArray = [].slice.call(dataUnit8Array)
      const lineLength = Number.parseInt(`${canvas.width / 3}`)
      const gap = Number.parseInt(`${1024 / lineLength}`)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.beginPath()
      let x = 0
      for (let i = 0; i < lineLength; i++) {
        let v = dataArray
          .slice(i * gap, i * gap + gap)
          .reduce((prev: number, next: number) => prev + next, 0) / gap
        v = Math.max(128, Math.min(178, v))
        const y = (v - 128) / 50 * canvas.height
        ctx.moveTo(x, 16)
        if (ctx.roundRect) ctx.roundRect(x, 16 - y, 2, y, [1, 1, 0, 0])
        else ctx.rect(x, 16 - y, 2, y)
        ctx.fill()
        x += 3
      }
      ctx.closePath()
    }, [])

    const handleStopRecorder = useCallback(async () => {
      if (!startRecord) return
      setStartRecord(false)
      setStartConvert(true)
      recorder.current.stop()
      if (drawRecordId.current) {
        cancelAnimationFrame(drawRecordId.current)
        drawRecordId.current = null
      }
      if (canvasRef.current && ctxRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }

      try {
        const mp3Blob = convertToMp3(recorder.current)
        const mp3File = new File([mp3Blob], 'temp.mp3', { type: 'audio/mp3' })
        const formData = new FormData()
        formData.append('file', mp3File)
        formData.append('word_timestamps', wordTimestamps || 'disabled')

        let url = ''
        let isPublic = false
        if (params.token) {
          url = '/audio-to-text'
          isPublic = true
        } else if (params.appId) {
          url = pathname.search('explore/installed') > -1
            ? `/installed-apps/${params.appId}/audio-to-text`
            : `/apps/${params.appId}/audio-to-text`
        }
        const audioResponse = await audioToText(url, isPublic, formData)
        onConverted(audioResponse?.text || '')
      } catch (error) {
        onConverted('')
      } finally {
        setStartConvert(false)
        setOriginDuration(0)
        onCancel()
      }
    }, [onCancel, onConverted, params.appId, params.token, pathname, startRecord, wordTimestamps])

    const handleStartRecord = useCallback(async () => {
      try {
        setOriginDuration(0)
        setStartConvert(false)
        recorder.current = new Recorder({
          sampleBits: 16,
          sampleRate: 16000,
          numChannels: 1,
          compiling: false,
        })
        await recorder.current.start()
        if (canvasRef.current && !ctxRef.current) {
          const dpr = window.devicePixelRatio || 1
          const { width: cssWidth, height: cssHeight } = canvasRef.current.getBoundingClientRect()
          canvasRef.current.width = dpr * cssWidth
          canvasRef.current.height = dpr * cssHeight
          const ctx = canvasRef.current.getContext('2d')
          if (ctx) {
            ctx.scale(dpr, dpr)
            ctx.fillStyle = 'rgba(209, 224, 255, 1)'
            ctxRef.current = ctx
          }
        }
        setStartRecord(true)
        if (canvasRef.current && ctxRef.current) {
          drawRecord()
        }
      } catch (error) {
        setStartRecord(false)
        onCancel()
      }
    }, [drawRecord, onCancel])

    useImperativeHandle(ref, () => ({
      start: handleStartRecord,
      stop: handleStopRecorder
    }), [handleStartRecord, handleStopRecorder])

    const initCanvas = useCallback(() => {
      const canvas = document.getElementById('voice-input-record') as HTMLCanvasElement
      if (canvas && !canvasRef.current) {
        canvasRef.current = canvas
      }
    }, [])

    useEffect(() => {
      if (originDuration >= 600 && startRecord) {
        handleStopRecorder()
      }
    }, [originDuration, startRecord, handleStopRecorder])

    useEffect(() => {
      initCanvas()
      return () => {
        recorder.current.stop()
        clearInterval()
        if (drawRecordId.current) {
          cancelAnimationFrame(drawRecordId.current)
        }
      }
    }, [clearInterval, initCanvas])

    const minutes = Number.parseInt(`${originDuration / 60}`)
    const seconds = originDuration % 60

    return (
      <div className={cn(s.wrapper, 'absolute inset-0 rounded-xl hidden')}>
        <div className='absolute inset-[1.5px] flex items-center overflow-hidden rounded-[10.5px] bg-primary-25 py-[14px] pl-[14.5px] pr-[6.5px]'>
          <canvas
            id='voice-input-record'
            className='absolute bottom-0 left-0 h-4 w-full'
            ref={el => el && (canvasRef.current = el)}
          />
          {startConvert && (
            <RiLoader2Line className='mr-2 h-4 w-4 animate-spin text-primary-700' />
          )}
          <div className='grow'>
            {startRecord && (
              <div className='text-sm text-gray-500'>{t('common.voiceInput.speaking')}</div>
            )}
            {startConvert && (
              <div className={cn(s.convert, 'text-sm')}>{t('common.voiceInput.converting')}</div>
            )}
          </div>
          {startRecord && (
            <div
              className='mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg  hover:bg-primary-100'
              onClick={handleStopRecorder}
            >
              <StopCircle className='h-5 w-5 text-primary-600' />
            </div>
          )}
          {startConvert && (
            <div
              className='mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg  hover:bg-gray-200'
              onClick={onCancel}
            >
              <RiCloseLine className='h-4 w-4 text-gray-500' />
            </div>
          )}
          <div
            className={`w-[45px] pl-1 text-xs font-medium ${
              originDuration > 500 ? 'text-[#F04438]' : 'text-gray-700'
            }`}
          >
            {`0${minutes.toFixed(0)}:${seconds >= 10 ? seconds : `0${seconds}`}`}
          </div>
        </div>
      </div>
    )
  }
)

VoiceInput.displayName = 'VoiceInput'
export default VoiceInput