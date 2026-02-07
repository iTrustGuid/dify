import {
  useCallback,
  useEffect,
  useRef,
  useState,
  TouchEvent
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
import FeatureBar from '@/app/components/base/features/new-feature-panel'
import type { FileUpload } from '@/app/components/base/file-uploader/types'
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

  const LONG_PRESS_DELAY = 400
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const hasRecordedData = useRef(false) // 修复：标记是否有录音数据

  const [recordingAnim, setRecordingAnim] = useState(false)
  const [dragY, setDragY] = useState(0)
  const isRecordingRef = useRef(false)
  const voiceInputRef = useRef<VoiceInputRef | null>(null)

  const [waveDots, setWaveDots] = useState<number[]>(Array(60).fill(0))
  const waveInterval = useRef<NodeJS.Timeout | null>(null)
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

  const focusTextarea = () => {
    if (textareaRef.current && !voiceMode && !recordingAnim && !disabled) {
      textareaRef.current.focus()
    }
  }

  const handleQueryChange = useCallback(
    (value) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  const startWaveAnimation = useCallback(() => {
    hasRecordedData.current = true
    if (waveInterval.current) clearInterval(waveInterval.current)
    waveInterval.current = setInterval(() => {
      setWaveDots(prev => prev.map(() => 2 + Math.random() * 8))
    }, 100)
  }, [])

  const stopWaveAnimation = useCallback(() => {
    if (waveInterval.current) {
      clearInterval(waveInterval.current)
      waveInterval.current = null
    }
    setWaveDots(Array(60).fill(0))
  }, [])

  useEffect(() => {
    return () => {
      if (waveInterval.current) clearInterval(waveInterval.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  // 修复录音开始：重置数据标记
  const handleRecordPressStart = useCallback((isClick = false) => {
    if (disabled || isResponding || isRecordingRef.current || isClick) return
    isLongPressTriggered.current = false
    hasRecordedData.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      isRecordingRef.current = true
      hasRecordedData.current = true
      setRecordingAnim(true)
      startWaveAnimation()

      if (voiceInputRef.current) {
        voiceInputRef.current.start()
      }
    }, LONG_PRESS_DELAY)
  }, [t, notify, disabled, isResponding, startWaveAnimation])

  // 修复录音结束：去掉无效空识别拦截逻辑错误
  const handleRecordPressEnd = useCallback(
    () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }

      const isCancel = dragY < -30
      isRecordingRef.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      const tempDrag = dragY
      setDragY(0)

      if (isCancel) {
        if (voiceInputRef.current) voiceInputRef.current.stop()
        notify({ type: 'info', message: '已取消发送' })
        focusTextarea()
        return
      }

      // 正常松开，等待识别，不再强制触发空文字
      if (voiceInputRef.current) {
        voiceInputRef.current.stop()
      }
      focusTextarea()
    },
    [dragY, notify, stopWaveAnimation, focusTextarea]
  )

  const handleRecordMove = useCallback((e: any) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    let y = 'touches' in e ? e.touches[0].clientY : e.clientY
    setDragY(window.innerHeight / 2 - y)
  }, [recordingAnim])

  // 修复语音识别回调：去掉误判为空的逻辑
  const handleVoiceConverted = useCallback((voiceText: string) => {
    if (!isLongPressTriggered.current || dragY < -30) return
    const text = voiceText?.trim() || ''

    if (text) {
      onSend?.(text, filesStore.getState().files)
      handleQueryChange('')
    } else {
      notify({ type: 'info', message: '未识别到文字' })
    }

    isRecordingRef.current = false
    setRecordingAnim(false)
    stopWaveAnimation()
    focusTextarea()
  }, [onSend, dragY, filesStore, handleQueryChange, notify, focusTextarea, stopWaveAnimation])

  const toggleVoiceMode = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    isLongPressTriggered.current = false
    hasRecordedData.current = false
    setVoiceMode(prev => {
      const newMode = !prev
      setTimeout(() => {
        if (!newMode) focusTextarea()
      }, 0)
      return newMode
    })
    setQuery('')
  }, [focusTextarea])

  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  const handleKeyDown = (e: any) => {
    if (voiceMode || recordingAnim) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      onSend?.(query, filesStore.getState().files)
      handleQueryChange('')
    }
  }

  const handleInputClick = () => {
    if (!voiceMode && !recordingAnim) focusTextarea()
  }
  const handleInputLongPressStart = () => {
    if (!voiceMode && !recordingAnim) handleRecordPressStart(false)
  }
  const handleInputLongPressEnd = () => {
    handleRecordPressEnd()
  }

  useEffect(() => {
    focusTextarea()
  }, [])

  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      voiceMode={voiceMode}
      toggleVoiceMode={toggleVoiceMode}
      onMicLongPress={handleRecordPressStart}
      onMicEnd={handleRecordPressEnd}
      onSend={() => {
        if (!isResponding && query.trim() && !voiceMode) {
          onSend?.(query, filesStore.getState().files)
          handleQueryChange('')
          focusTextarea()
        }
      }}
      theme={theme}
    />
  )

  return (
    <>
      {recordingAnim && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto"
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* 动画加速版：速度更快，扩散明显，圆弧/颜色完全不变 */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#d1f0ff] via-[#a7e6ff] to-[#73b8ff]"
            style={{
              height: '180px',
              borderRadius: '50% / 100% 100% 0 0',
              filter: 'blur(8px)',
              border: 'none',
              transform: 'scaleX(1.05)',
              // 🔥 动画速度加快：1.2s → 0.7s，更急促、跟手
              animation: 'voiceFastPulse 0.7s ease-in-out infinite alternate',
            }}
          />

          <div className="relative z-10 w-full flex flex-col items-center justify-end pb-14 h-[180px]">
            <div className="text-white text-lg font-medium mb-5">
              {dragY < -30 ? '松开取消' : '松手发送，上移取消'}
            </div>
            <div className="flex items-center justify-center gap-[3px] h-4 w-[88%]">
              {waveDots.map((h, i) => (
                <div
                  key={i}
                  className="w-[2.5px] rounded-full bg-white opacity-100 transition-all duration-150"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        className={cn(
          'relative z-10 rounded-full border border-gray-200 bg-white py-2.5 px-4 shadow-sm transition-all',
          isDragActive && 'border-dashed border-blue-400',
          disabled && 'opacity-50 pointer-events-none',
          recordingAnim && 'opacity-30',
        )}
      >
        <div className="w-full flex items-center justify-between">
          {voiceMode ? (
            <div
              className="w-full h-9 flex items-center justify-center relative cursor-pointer"
              onTouchStart={() => handleRecordPressStart(false)}
              onTouchEnd={handleRecordPressEnd}
              onMouseDown={() => handleRecordPressStart(false)}
              onMouseUp={handleRecordPressEnd}
              onMouseLeave={handleRecordPressEnd}
              onTouchMove={handleRecordMove}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="text-sm text-gray-500 font-normal">按住说话</span>
              <div className="absolute right-0 top-1/2 translate-y-[-50%] flex items-center gap-1">
                {operation}
              </div>
            </div>
          ) : (
            <div
              ref={wrapperRef}
              className="flex-1 flex items-center gap-2"
              onClick={handleInputClick}
              onTouchStart={handleInputLongPressStart}
              onTouchEnd={handleInputLongPressEnd}
              onMouseDown={handleInputLongPressStart}
              onMouseUp={handleInputLongPressEnd}
              onMouseLeave={handleInputLongPressEnd}
              onTouchMove={handleRecordMove}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div 
                className="flex-1 relative"
                onContextMenu={(e) => e.preventDefault()}
              >
                <div ref={textValueRef} className="invisible absolute left-0 right-0 whitespace-pre px-1 text-sm leading-6">
                  {query}
                </div>
                <Textarea
                  ref={ref => textareaRef.current = ref as any}
                  className="w-full resize-none bg-transparent px-1 text-sm leading-6 outline-none text-gray-800"
                  placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '和智能客服-游客 聊天')}
                  minRows={1}
                  maxRows={4}
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  onPaste={handleClipboardPasteFile}
                  onDrop={handleDropFile}
                  disabled={disabled}
                  spellCheck={false}
                  autoCorrect="off"
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>
              <div 
                className="flex items-center gap-1 flex-shrink-0" 
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {operation}
              </div>
            </div>
          )}
        </div>

        <VoiceInput
          ref={voiceInputRef}
          onConverted={handleVoiceConverted}
          onCancel={() => {
            isRecordingRef.current = false
            setRecordingAnim(false)
            stopWaveAnimation()
            focusTextarea()
          }}
          style={{ display: 'none' }}
        />
      </div>
      {showFeatureBar && <FeatureBar showFileUpload={showFileUpload} disabled={featureBarDisabled} onFeatureBarClick={onFeatureBarClick} />}

      <style jsx global>{`
        /* 🔥 加速动画：0.7s 一轮，扩散更快，更像豆包动态 */
        @keyframes voiceFastPulse {
          0% {
            opacity: 0.92;
            transform: scaleX(1.05) scaleY(1);
          }
          100% {
            opacity: 1;
            transform: scaleX(1.05) scaleY(1.22);
          }
        }
        * {
          -webkit-touch-callout: none !important;
          -webkit-user-select: none !important;
          user-select: none !important;
        }
        textarea {
          -webkit-touch-callout: none !important;
          user-select: text !important;
        }
      `}</style>
    </>
  )
}

const ChatInputAreaWrapper = (props: any) => {
  return (
    <FileContextProvider>
      <ChatInputArea {...props} />
    </FileContextProvider>
  )
}

export default ChatInputAreaWrapper