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

  // 长按触发时间（700ms，避免误触）
  const LONG_PRESS_DELAY = 700
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)

  // 录音状态：仅底部区域动画，不全屏
  const [recordingAnim, setRecordingAnim] = useState(false)
  const [dragY, setDragY] = useState(0)
  const isRecordingRef = useRef(false)
  const voiceInputRef = useRef<VoiceInputRef | null>(null)

  // 波纹配置（匹配参考图的长条形波纹）
  const [waveDots, setWaveDots] = useState<number[]>(Array(40).fill(0))
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

  // 输入框内容变化
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  // 波纹持续动画：按住一直跳动，不中断
  const startWaveAnimation = useCallback(() => {
    if (waveInterval.current) clearInterval(waveInterval.current)
    // 匹配参考图的波纹高度（3-8px）
    waveInterval.current = setInterval(() => {
      setWaveDots(prev => prev.map(() => 3 + Math.random() * 5))
    }, 120)
  }, [])

  // 仅松手停止波纹
  const stopWaveAnimation = useCallback(() => {
    if (waveInterval.current) {
      clearInterval(waveInterval.current)
      waveInterval.current = null
    }
    setWaveDots(Array(40).fill(0))
  }, [])

  // 清理定时器（避免内存泄漏）
  useEffect(() => {
    return () => {
      if (waveInterval.current) clearInterval(waveInterval.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  // 长按按下：700ms后触发动画
  const handleRecordPressStart = useCallback(() => {
    if (disabled || isResponding || isRecordingRef.current) return
    isLongPressTriggered.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      isRecordingRef.current = true
      setRecordingAnim(true)
      startWaveAnimation()

      // 获取录音权限并开始录音
      ;(Recorder as any).getPermission().then(() => {
        voiceInputRef.current?.start()
      }).catch(() => {
        notify({ type: 'error', message: t('common.voiceInput.notAllow') })
        setRecordingAnim(false)
        stopWaveAnimation()
        isRecordingRef.current = false
      })
    }, LONG_PRESS_DELAY)
  }, [t, notify, disabled, isResponding, startWaveAnimation])

  // 松开/离开：仅此时关闭动画
  const handleRecordPressEnd = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      e?.preventDefault()
      // 清除长按定时器（短按直接返回）
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      // 非长按触发，不执行任何操作
      if (!isLongPressTriggered.current || !isRecordingRef.current) return

      // 关闭动画、波纹、录音
      const cancelSend = dragY < -30
      isRecordingRef.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      setDragY(0)

      // 上滑取消
      if (cancelSend) {
        notify({ type: 'info', message: '已取消发送' })
        voiceInputRef.current?.stop()
        return
      }

      // 正常发送
      setTimeout(() => {
        voiceInputRef.current?.stop()
      }, 100)
    },
    [dragY, notify, stopWaveAnimation]
  )

  // 上滑取消拖动
  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    let y = 'touches' in e ? e.touches[0].clientY : e.clientY
    setDragY(window.innerHeight / 2 - y)
  }, [recordingAnim])

  // 语音转文字发送
  const handleVoiceConverted = useCallback((voiceText: string) => {
    if (!onSend || !isLongPressTriggered.current || dragY < -30) return
    if (!voiceText?.trim()) {
      isRecordingRef.current = false
      notify({ type: 'info', message: '未识别到文字' })
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
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, handleQueryChange, notify])

  // 单击麦克风切换语音模式
  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(prev => !prev)
    setQuery('')
  }, [])

  // 输入法组合态处理
  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  // 回车发送
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (voiceMode || recordingAnim) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      onSend?.(query, filesStore.getState().files)
      handleQueryChange('')
    }
  }

  // 操作栏（麦克风/发送/文件）
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
      {/* 参考图同款：底部输入框区域+向上渐变动画，不全屏 */}
      {recordingAnim && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center justify-end
                    bg-gradient-to-t from-blue-500 via-blue-400 to-transparent
                    animate-fade-in pointer-events-auto pb-6"
          onMouseMove={handleRecordMove}
          onTouchMove={handleRecordMove}
          onMouseUp={handleRecordPressEnd}
          onTouchEnd={handleRecordPressEnd}
          onMouseLeave={handleRecordPressEnd}
        >
          {/* 提示文字（参考图居中样式） */}
          <div className="text-white text-lg font-medium mb-4">
            {dragY < -30 ? '松开取消' : '松手发送，上移取消'}
          </div>

          {/* 长条形波纹（参考图底部样式） */}
          <div className="flex items-center justify-center gap-1 h-4 w-[80%] mb-2">
            {waveDots.map((h, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-white opacity-90 transition-all duration-120"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 原输入框：录音时半透明，不影响视觉 */}
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
            // 单击切换后的「按住说话」模式
            <div
              className="w-full h-9 flex items-center justify-center relative cursor-pointer"
              onMouseDown={handleRecordPressStart}
              onMouseUp={handleRecordPressEnd}
              onMouseLeave={handleRecordPressEnd}
              onTouchStart={handleRecordPressStart}
              onTouchEnd={handleRecordPressEnd}
            >
              <span className="text-sm text-gray-500 font-normal">按住说话</span>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {operation}
              </div>
            </div>
          ) : (
            // 默认输入模式
            <div
              ref={wrapperRef}
              className="flex-1 flex items-center gap-2"
              onMouseDown={handleRecordPressStart}
              onMouseUp={handleRecordPressEnd}
              onMouseLeave={handleRecordPressEnd}
              onTouchStart={handleRecordPressStart}
              onTouchEnd={handleRecordPressEnd}
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

        {/* 语音识别组件（隐藏） */}
        <VoiceInput
          ref={voiceInputRef}
          onConverted={handleVoiceConverted}
          onCancel={() => {
            isRecordingRef.current = false
            setRecordingAnim(false)
            stopWaveAnimation()
          }}
          style={{ display: 'none' }}
        />
      </div>

      {/* 功能栏（保留原有逻辑） */}
      {showFeatureBar && <FeatureBar showFileUpload={showFileUpload} disabled={featureBarDisabled} onFeatureBarClick={onFeatureBarClick} />}
    </>
  )
}

// 文件上下文包裹
const ChatInputAreaWrapper = (props: ChatInputAreaProps) => {
  return (
    <FileContextProvider>
      <ChatInputArea {...props} />
    </FileContextProvider>
  )
}

export default ChatInputAreaWrapper