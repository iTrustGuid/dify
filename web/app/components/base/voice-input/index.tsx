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
import cn from '@/utils/classnames'
import { StopCircle } from '@/app/components/base/icons/src/vender/solid/mediaAndDevices'
import { audioToText } from '@/service/share'

// 定义组件Ref类型
export type VoiceInputRef = {
  start: () => void;
  stop: () => void;
  isRecording: boolean; // 暴露录音状态
};

// 组件Props类型
type VoiceInputProps = {
  onConverted: (text: string) => void;
  onCancel: () => void;
  wordTimestamps?: string;
};

// 转发Ref的函数式组件
const VoiceInput = forwardRef<VoiceInputRef, VoiceInputProps>(
  ({ onConverted, onCancel, wordTimestamps }, ref) => {
    const { t } = useTranslation()
    
    // 录音器实例Ref
    const recorder = useRef<Recorder | null>(null)
    // Canvas相关Ref
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
    const drawRecordId = useRef<number | null>(null)
    const isStopping = useRef(false) // 新增：防止重复停止
    
    // 状态管理
    const [originDuration, setOriginDuration] = useState(0)
    const [startRecord, setStartRecord] = useState(false)
    const [startConvert, setStartConvert] = useState(false)
    const [isRecording, setIsRecording] = useState(false) // 标记是否正在录音
    
    // 路由相关
    const pathname = usePathname()
    const params = useParams()

    // 录音时长计时器（使用RAF保证精度）
    const clearInterval = useRafInterval(
      () => {
        setOriginDuration(prev => prev + 1)
      },
      1000,
      { immediate: false, runImmediately: false, enabled: startRecord }
    )

    // 绘制录音波形
    const drawRecord = useCallback(() => {
      if (!startRecord || !canvasRef.current || !ctxRef.current || !recorder.current) {
        return
      }
      
      drawRecordId.current = requestAnimationFrame(drawRecord)
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      
      // 获取录音分析数据
      const dataUnit8Array = recorder.current.getAnalyseData()
      const dataArray = [].slice.call(dataUnit8Array)
      const lineLength = Number.parseInt(`${canvas.width / 3}`)
      const gap = Number.parseInt(`${1024 / lineLength}`)

      // 清空画布并绘制波形
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
        if (ctx.roundRect) {
          ctx.roundRect(x, 16 - y, 2, y, [1, 1, 0, 0])
        } else {
          ctx.rect(x, 16 - y, 2, y)
        }
        ctx.fill()
        x += 3
      }
      ctx.closePath()
    }, [startRecord])

    // 停止录音并转换为文字（核心修复：防止重复调用onCancel）
    const handleStopRecorder = useCallback(async () => {
      // 已经在停止中，直接返回
      if (isStopping.current) return
      isStopping.current = true

      try {
        // 边界判断：未开始录音则直接返回（仅重置状态，不调用onCancel）
        if (!startRecord || !recorder.current) {
          setStartRecord(false)
          setStartConvert(false)
          setIsRecording(false)
          return // 关键：不再调用onCancel，打破递归
        }

        // 标记状态：停止录音，开始转换
        setStartRecord(false)
        setIsRecording(false)
        setStartConvert(true)
        
        // 强制停止录音（增加异常捕获）
        try {
          recorder.current.stop()
        } catch (e) {
          console.warn('Recorder stop error:', e)
        }

        // 停止波形绘制
        if (drawRecordId.current) {
          cancelAnimationFrame(drawRecordId.current)
          drawRecordId.current = null
        }

        // 清空画布
        if (canvasRef.current && ctxRef.current) {
          ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }

        // 转换录音为MP3并调用语音转文字接口
        const mp3Blob = convertToMp3(recorder.current)
        const mp3File = new File([mp3Blob], 'temp.mp3', { type: 'audio/mp3' })
        const formData = new FormData()
        formData.append('file', mp3File)
        formData.append('word_timestamps', wordTimestamps || 'disabled')

        // 拼接接口URL
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

        // 调用语音转文字接口
        const audioResponse = await audioToText(url, isPublic, formData)
        onConverted(audioResponse?.text || '')
      } catch (error) {
        console.error('Audio to text error:', error)
        onConverted('') // 异常时返回空字符串
      } finally {
        // 最终重置所有状态
        setStartConvert(false)
        setOriginDuration(0)
        recorder.current = null // 清空录音器实例
        isStopping.current = false // 重置标记
        // 转换完成后不再调用onCancel，由父组件自行处理状态
      }
    }, [onConverted, params.appId, params.token, pathname, startRecord, wordTimestamps])

    // 开始录音
    const handleStartRecord = useCallback(async () => {
      // 重置之前的状态
      setOriginDuration(0)
      setStartConvert(false)
      setStartRecord(false)
      setIsRecording(false)

      // 销毁旧的录音器实例
      if (recorder.current) {
        try {
          recorder.current.destroy()
        } catch (e) {
          console.warn('Recorder destroy error:', e)
        }
        recorder.current = null
      }

      try {
        // 创建新的录音器实例
        recorder.current = new Recorder({
          sampleBits: 16,
          sampleRate: 16000,
          numChannels: 1,
          compiling: false,
        })

        // 开始录音
        await recorder.current.start()
        
        // 标记录音状态
        setIsRecording(true)
        setStartRecord(true)

        // 初始化Canvas
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

        // 标记开始录音并绘制波形
        drawRecord()
      } catch (error) {
        console.error('Start record error:', error)
        // 异常时重置所有状态
        setStartRecord(false)
        setIsRecording(false)
        recorder.current = null
        onCancel() // 仅初始化失败时调用onCancel
      }
    }, [drawRecord, onCancel])

    // 暴露组件方法给父组件
    useImperativeHandle(ref, () => ({
      start: handleStartRecord,
      stop: handleStopRecorder,
      isRecording: isRecording
    }), [handleStartRecord, handleStopRecorder, isRecording])

    // 初始化Canvas
    const initCanvas = useCallback(() => {
      if (canvasRef.current) return
      
      const canvas = document.getElementById('voice-input-record') as HTMLCanvasElement
      if (canvas) {
        canvasRef.current = canvas
      }
    }, [])

    // 监听录音时长：超过10分钟自动停止
    useEffect(() => {
      if (originDuration >= 600 && startRecord) {
        handleStopRecorder()
      }
    }, [originDuration, startRecord, handleStopRecorder])

    // 组件挂载/卸载逻辑
    useEffect(() => {
      initCanvas()
      
      // 卸载时清理所有资源
      return () => {
        // 停止录音
        if (recorder.current) {
          try {
            recorder.current.stop()
            recorder.current.destroy()
          } catch (e) {
            console.warn('Recorder cleanup error:', e)
          }
          recorder.current = null
        }
        
        // 清理计时器和动画
        clearInterval()
        if (drawRecordId.current) {
          cancelAnimationFrame(drawRecordId.current)
          drawRecordId.current = null
        }
        
        // 重置状态
        setStartRecord(false)
        setIsRecording(false)
        setStartConvert(false)
        setOriginDuration(0)
        isStopping.current = false
      }
    }, [clearInterval, initCanvas])

    // 格式化录音时长显示
    const minutes = Number.parseInt(`${originDuration / 60}`)
    const seconds = originDuration % 60
    const formattedTime = `0${minutes.toFixed(0)}:${seconds >= 10 ? seconds : `0${seconds}`}`

    return (
      <div className={cn('absolute inset-0 rounded-xl hidden')}>
        <div className='absolute inset-[1.5px] flex items-center overflow-hidden rounded-[10.5px] bg-primary-25 py-[14px] pl-[14.5px] pr-[6.5px]'>
          {/* 录音波形画布 */}
          <canvas
            id='voice-input-record'
            className='absolute bottom-0 left-0 h-4 w-full'
            ref={el => el && (canvasRef.current = el)}
          />
          
          {/* 转换中加载图标 */}
          {startConvert && (
            <RiLoader2Line className='mr-2 h-4 w-4 animate-spin text-primary-700' />
          )}
          
          {/* 状态文本 */}
          <div className='grow'>
            {startRecord && (
              <div className='text-sm text-gray-500'>{t('common.voiceInput.speaking')}</div>
            )}
            {startConvert && (
              <div className={cn('text-sm')}>{t('common.voiceInput.converting')}</div>
            )}
          </div>
          
          {/* 操作按钮：录音中显示停止，转换中显示取消 */}
          {startRecord && (
            <div
              className='mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-primary-100'
              onClick={handleStopRecorder}
              onContextMenu={(e) => e.preventDefault()} // 拦截右键菜单
            >
              <StopCircle className='h-5 w-5 text-primary-600' />
            </div>
          )}
          {startConvert && (
            <div
              className='mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-gray-200'
              onClick={() => {
                setStartConvert(false)
                setOriginDuration(0)
                setIsRecording(false)
                // 取消转换时仅重置状态，不调用onCancel
              }}
              onContextMenu={(e) => e.preventDefault()} // 拦截右键菜单
            >
              <RiCloseLine className='h-4 w-4 text-gray-500' />
            </div>
          )}
          
          {/* 录音时长显示（超过500秒变红） */}
          <div
            className={`w-[45px] pl-1 text-xs font-medium ${
              originDuration > 500 ? 'text-[#F04438]' : 'text-gray-700'
            }`}
          >
            {formattedTime}
          </div>
        </div>
      </div>
    )
  }
)

// 设置组件显示名称，方便调试
VoiceInput.displayName = 'VoiceInput'

export default VoiceInput