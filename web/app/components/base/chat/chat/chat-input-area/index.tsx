import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import Textarea from 'react-textarea-autosize'
import { useTranslation } from 'react-i18next'
import Recorder from 'js-audio-recorder'
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
import VoiceInput, { VoiceInputRef } from '@/app/components/base/voice-input'
import { useToastContext } from '@/app/components/base/toast'
import FeatureBar from '@/app/components/base/features/new-feature-panel/feature-bar'
import type { FileUpload } from '@/app/components/base/features/types'
import { TransferMethod } from '@/types/app'

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
  const [voiceMode, setVoiceMode] = useState(false)
  // 录音动画状态
  const [recordingAnim, setRecordingAnim] = useState(false)
  const [dragY, setDragY] = useState(0)
  // 波纹数据（持续动画）
  const [waveDots, setWaveDots] = useState<number[]>(Array(40).fill(0))
  const waveInterval = useRef<NodeJS.Timeout | null>(null)
  const isRecordingRef = useRef(false)
  const voiceInputRef = useRef<VoiceInputRef | null>(null)
  const isComposingRef = useRef(false)
  const filesStore = useFileStore()

  const {
    handleDragFileEnter,
    handleDragFileLeave,
    handleDragFileOver,
    handleDropFile,
    handleClipboardPasteFile,
    isDragActive,
  } = useFile(visionConfig!)
  const { checkInputsForm } = useCheckInputsForms()

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  // 【修复1】波纹持续动画，按住一直动，不会停
  const startWaveAnimation = useCallback(() => {
    // 先清旧定时器
    if (waveInterval.current) clearInterval(waveInterval.current)
    waveInterval.current = setInterval(() => {
      setWaveDots(prev => prev.map(() => 4 + Math.random() * 7))
    }, 120)
  }, [])

  // 【修复2】松开才停止波纹
  const stopWaveAnimation = useCallback(() => {
    if (waveInterval.current) {
      clearInterval(waveInterval.current)
      waveInterval.current = null
    }
    setWaveDots(Array(40).fill(0))
  }, [])

  // 清理副作用
  useEffect(() => {
    return () => {
      if (waveInterval.current) clearInterval(waveInterval.current)
    }
  }, [])

  // 开始录音 + 开启动画（只覆盖输入框）
  const handleStartRecord = useCallback(() => {
    if (disabled || isResponding || isRecordingRef.current) return
    setRecordingAnim(true)
    startWaveAnimation() // 持续波纹

    ;(Recorder as any).getPermission().then(() => {
      isRecordingRef.current = true
      voiceInputRef.current?.start()
    }).catch(() => {
      notify({ type: 'error', message: t('common.voiceInput.notAllow') })
      setRecordingAnim(false)
      stopWaveAnimation()
    })
  }, [t, notify, disabled, isResponding, startWaveAnimation, stopWaveAnimation])

  // 松开停止 + 取消逻辑 + 关闭动画
  const handleStopRecord = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      e?.preventDefault()
      const cancelSend = dragY < -30

      // 停止录音 & 动画 & 波纹
      isRecordingRef.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      setDragY(0)

      if (cancelSend) {
        notify({ type: 'info', message: '已取消' })
        voiceInputRef.current?.stop()
        return
      }

      // 正常发送
      setTimeout(() => {
        if (voiceInputRef.current) voiceInputRef.current.stop()
      }, 100)
    },
    [dragY, notify, stopWaveAnimation]
  )

  // 上滑拖动取消
  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim) return
    let y = 'touches' in e ? e.touches[0].clientY : e.clientY
    const startY = e.currentTarget.getBoundingClientRect().top + 20
    const offset = startY - y
    setDragY(-offset)
  }, [recordingAnim])

  // 语音转文字发送
  const handleVoiceConverted = useCallback((voiceText: string) => {
    if (!onSend || dragY < -30) return
    if (!voiceText?.trim()) {
      isRecordingRef.current = false
      return
    }
    const { files, setFiles } = filesStore.getState()
    if (isResponding) return
    if (files.find(f => f.transferMethod === TransferMethod.local_file && !f.uploadedId)) return
    if (!checkInputsForm(inputs, inputsForm)) return

    onSend(voiceText, files)
    handleQueryChange('')
    setFiles([])
    isRecordingRef.current = false
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, handleQueryChange])

  // 单击切换语音模式
  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(prev => !prev)
    setQuery('')
  }, [])

  const handleVoiceModeLongPress = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!voiceMode || disabled || isResponding) return
    handleStartRecord()
  }, [voiceMode, disabled, isResponding, handleStartRecord])

  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (voiceMode || recordingAnim) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      onSend?.(query, filesStore.getState().files)
      handleQueryChange('')
    }
  }

  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      voiceMode={voiceMode}
      toggleVoiceMode={toggleVoiceMode}
      onMicLongPress={handleStartRecord}
      onMicEnd={handleStopRecord}
      onSend={() => {
        if (!isResponding && query.trim()) {
          onSend?.(query, filesStore.getState().files)
          handleQueryChange('')
        }
      }}
      theme={theme}
    />
  )

  return (
    <>
      {/* 【核心修复】动画只覆盖输入框，不全屏！大小完全贴合输入框 */}
      <div className="relative z-10 rounded-full border border-gray-200 bg-white py-2.5 px-4 shadow-sm transition-all">
        {/* 录音动画层：和输入框同大小、同位置、同圆角，只盖输入框 */}
        {recordingAnim && (
          <div
            className="absolute inset-0 z-20 rounded-full flex flex-col items-center justify-center
                      bg-gradient-to-r from-blue-500 to-blue-600 animate-fade-in overflow-hidden"
            onMouseMove={handleRecordMove}
            onTouchMove={handleRecordMove}
            onMouseUp={handleStopRecord}
            onTouchEnd={handleStopRecord}
            onMouseLeave={handleStopRecord}
          >
            {/* 提示文字 */}
            <div className="text-white text-[15px] font-medium mb-2">
              {dragY < -30 ? '松开取消' : '松手发送，上移取消'}
            </div>

            {/* 动态波纹：按住一直动，绝不消失 */}
            <div className="flex items-center justify-center gap-[2px] h-6 px-1">
              {waveDots.map((h, i) => (
                <div
                  key={i}
                  className="w-[2px] rounded-full bg-white opacity-90 transition-all"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        )}

        <div
          className={cn(
            'w-full flex items-center justify-between relative z-10',
            recordingAnim && 'opacity-0', // 动画时隐藏原输入框内容
          )}
        >
          {voiceMode ? (
            <div
              className="w-full h-9 flex items-center justify-center relative cursor-pointer"
              onMouseDown={handleVoiceModeLongPress}
              onMouseUp={handleStopRecord}
              onMouseLeave={handleStopRecord}
              onTouchStart={handleVoiceModeLongPress}
              onTouchEnd={handleStopRecord}
            >
              <span className="text-sm text-gray-500 font-normal">按住说话</span>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {operation}
              </div>
            </div>
          ) : (
            <div
              ref={wrapperRef}
              className="flex-1 flex items-center gap-2"
              onMouseDown={handleStartRecord}
              onMouseUp={handleStopRecord}
              onMouseLeave={handleStopRecord}
              onTouchStart={handleStartRecord}
              onTouchEnd={handleStopRecord}
            >
              <div className="flex-1 relative">
                <div
                  ref={textValueRef}
                  className="invisible absolute left-0 right-0 whitespace-pre px-1 text-sm leading-6"
                >
                  {query}
                </div>
                <Textarea
                  ref={ref => textareaRef.current = ref as any}
                  className="w-full resize-none bg-transparent px-1 text-sm leading-6 outline-none text-gray-800"
                  placeholder="和 Bot 聊天"
                  autoFocus
                  minRows={1}
                  maxRows={4}
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  disabled={disabled || recordingAnim}
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {operation}
              </div>
            </div>
          )}
        </div>

        <VoiceInput
          ref={voiceInputRef}
          onConverted={handleVoiceConverted}
          onCancel={() => { isRecordingRef.current = false }}
          style={{ display: 'none' }}
        />
      </div>

      {showFeatureBar && <FeatureBar showFileUpload={showFileUpload} disabled={featureBarDisabled} onFeatureBarClick={onFeatureBarClick} />}
    </>
  )
}

const ChatInputAreaWrapper = (props: ChatInputAreaProps) => {
  return (
    <FileContextProvider>
      <ChatInputArea {...props} />
    </FileContextProvider>
  )
}

export default ChatInputAreaWrapper