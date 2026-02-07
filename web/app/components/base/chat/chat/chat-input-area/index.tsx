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
import FeatureBar from '@/app/components/base/features/new-feature-panel/feature-bar'
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

  const LONG_PRESS_DELAY = 700
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const isInputLongPress = useRef(false)

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

  const handleQueryChange = useCallback(
    (value: string) => {
      if (isInputLongPress.current) return
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  const startWaveAnimation = useCallback(() => {
    if (waveInterval.current) clearInterval(waveInterval.current)
    waveInterval.current = setInterval(() => {
      setWaveDots(prev => prev.map(() => 2 + Math.random() * 6))
    }, 120)
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

  const handleRecordPressStart = useCallback((isClick = false, isInput = false, isHoldBtn = false) => {
    if (disabled || isResponding || isRecordingRef.current || isClick) return
    if (isInput || isHoldBtn) isInputLongPress.current = true
    isLongPressTriggered.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      isRecordingRef.current = true
      setRecordingAnim(true)
      startWaveAnimation()

      ;(Recorder as any).getPermission().then(() => {
        voiceInputRef.current?.start()
      }).catch(() => {
        notify({ type: 'error', message: t('common.voiceInput.notAllow') })
        setRecordingAnim(false)
        stopWaveAnimation()
        isInputLongPress.current = false
      })
    }, LONG_PRESS_DELAY)
  }, [t, notify, disabled, isResponding, startWaveAnimation])

  const handleRecordPressEnd = useCallback(
    (e?: React.MouseEvent | React.TouchEvent, isInput = false, isHoldBtn = false) => {
      e?.preventDefault()
      if (isInput || isHoldBtn) isInputLongPress.current = false

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      if (!isLongPressTriggered.current || !isRecordingRef.current) return

      const cancelSend = dragY < -30
      isRecordingRef.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      setDragY(0)

      if (cancelSend) {
        notify({ type: 'info', message: '已取消发送' })
        voiceInputRef.current?.stop()
        return
      }

      setTimeout(() => {
        voiceInputRef.current?.stop()
      }, 100)
    },
    [dragY, notify, stopWaveAnimation]
  )

  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    let y = 'touches' in e ? e.touches[0].clientY : e.clientY
    setDragY(window.innerHeight / 2 - y)
  }, [recordingAnim])

  const handleVoiceConverted = useCallback((voiceText: string) => {
    if (!onSend || !isLongPressTriggered.current || dragY < -30) return
    if (!voiceText?.trim()) {
      isRecordingRef.current = false
      isInputLongPress.current = false
      notify({ type: 'info', message: '未识别到文字' })
      return
    }
    const { files, setFiles } = filesStore.getState()
    if (isResponding) return
    if (files.find(f => f.transferMethod === TransferMethod.LOCAL && !f.uploadedId)) return
    if (!checkInputsForm(inputs, inputsForm)) return

    onSend(voiceText, files)
    handleQueryChange('')
    setFiles([])
    isRecordingRef.current = false
    isInputLongPress.current = false
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, handleQueryChange, notify])

  const toggleVoiceMode = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    isLongPressTriggered.current = false
    isInputLongPress.current = false
    setVoiceMode(prev => !prev)
    setQuery('')
  }, [])

  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (voiceMode || recordingAnim || isInputLongPress.current) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      onSend?.(query, filesStore.getState().files)
      handleQueryChange('')
    }
  }

  const handleInputMouseDown = useCallback((e: React.MouseEvent) => {
    if (voiceMode || disabled || isResponding) return
    e.stopPropagation()
    handleRecordPressStart(false, true)
  }, [voiceMode, disabled, isResponding, handleRecordPressStart])

  const handleInputMouseUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, true)
  }, [handleRecordPressEnd])

  const handleInputMouseLeave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, true)
  }, [handleRecordPressEnd])

  const handleInputTouchStart = useCallback((e: TouchEvent) => {
    if (voiceMode || disabled || isResponding) return
    e.stopPropagation()
    handleRecordPressStart(false, true)
  }, [voiceMode, disabled, isResponding, handleRecordPressStart])

  const handleInputTouchEnd = useCallback((e: TouchEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, true)
  }, [handleRecordPressEnd])

  const handleInputTouchCancel = useCallback((e: TouchEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, true)
    isInputLongPress.current = false
  }, [handleRecordPressEnd])

  const handleHoldBtnMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || isResponding) return
    e.stopPropagation()
    handleRecordPressStart(false, false, true)
  }, [disabled, isResponding, handleRecordPressStart])

  const handleHoldBtnMouseUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, false, true)
  }, [handleRecordPressEnd])

  const handleHoldBtnMouseLeave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, false, true)
  }, [handleRecordPressEnd])

  const handleHoldBtnTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isResponding) return
    e.stopPropagation()
    handleRecordPressStart(false, false, true)
  }, [disabled, isResponding, handleRecordPressStart])

  const handleHoldBtnTouchEnd = useCallback((e: TouchEvent) => {
    e.stopPropagation()
    handleRecordPressEnd(e, false, true)
  }, [handleRecordPressEnd])

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
        if (!isResponding && query.trim() && !voiceMode && !isInputLongPress.current) {
          onSend?.(query, filesStore.getState().files)
          handleQueryChange('')
        }
      }}
      theme={theme}
    />
  )

  return (
    <>
      {/* ✅ 最终版：超大模糊范围 + 中间色最深 + 多层次渐变 + 180px高 + 底部半圆 + 无边框 */}
      {recordingAnim && (
        <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto">
          {/* 核心背景：超大模糊 + 中间深两侧渐浅 + 多层次渐变 + 半圆 + 无边框 */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-700 via-blue-600 to-blue-500/70"
            style={{
              height: '180px',
              borderRadius: '50% / 100% 100% 0 0',
              filter: 'blur(8px)', // 大幅加大模糊范围，匹配参考图
              border: 'none',
              transform: 'scaleX(1.05)', // 轻微横向拉伸，让模糊边缘更自然覆盖两侧
            }}
          />

          {/* 文字 + 波纹 容器：适配180px高度，居中无错位 */}
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
              onMouseDown={handleHoldBtnMouseDown}
              onMouseUp={handleHoldBtnMouseUp}
              onMouseLeave={handleHoldBtnMouseLeave}
              onTouchStart={handleHoldBtnTouchStart}
              onTouchEnd={handleHoldBtnTouchEnd}
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
              onMouseDown={handleInputMouseDown}
              onMouseUp={handleInputMouseUp}
              onMouseLeave={handleInputMouseLeave}
              onTouchStart={handleInputTouchStart}
              onTouchEnd={handleInputTouchEnd}
              onTouchCancel={handleInputTouchCancel}
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
                  placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '和 Bot 聊天')}
                  autoFocus
                  minRows={1}
                  maxRows={4}
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  onPaste={handleClipboardPasteFile}
                  onDragEnter={handleDragFileEnter}
                  onDragLeave={handleDragFileLeave}
                  onDragOver={handleDragFileOver}
                  onDrop={handleDropFile}
                  disabled={disabled}
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
          onCancel={() => {
            isRecordingRef.current = false
            isInputLongPress.current = false
            setRecordingAnim(false)
            stopWaveAnimation()
          }}
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