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
import { FileListInChatInput } from '@/app/components/base/file-uploader' // 仅新增：文件回显组件
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

// 判断是否为移动端/H5环境
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// 判断是否为微信环境
const isWeChat = () => {
  return /MicroMessenger/i.test(navigator.userAgent)
}

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

  const LONG_PRESS_DELAY = isMobile() ? 300 : 500
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const isTouching = useRef(false)
  const isLongPressing = useRef(false)

  // 核心状态：只控制弹框显隐
  const [recordingAnim, setRecordingAnim] = useState(false)
  const [dragY, setDragY] = useState(0)
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

  // ========== 新增：禁用长按默认行为 + 关闭键盘核心函数 ==========
  const disableTextSelection = useCallback(() => {
    document.body.style.userSelect = 'none'
    document.body.style.WebkitUserSelect = 'none' 
    document.body.style.touchCallout = 'none'
    document.body.style.WebkitTouchCallout = 'none'

    const handleContextMenu = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('contextmenu', handleContextMenu)
    
    return () => {
      document.body.style.userSelect = ''
      document.body.style.WebkitUserSelect = ''
      document.body.style.touchCallout = ''
      document.body.style.WebkitTouchCallout = ''
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  // 关闭键盘 + 输入框失焦
  const closeKeyboardAndBlur = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.blur()
    }
    if (isMobile() && document.activeElement) {
      ;(document.activeElement as HTMLElement).blur()
    }
    if (isWeChat()) {
      setTimeout(() => {
        document.activeElement?.blur()
      }, 50)
    }
  }, [])

  // ========== 基础工具函数 ==========
  const blurTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.blur()
      if (isMobile() && document.activeElement === textareaRef.current) {
        document.activeElement.blur()
      }
    }
  }, [])

  const focusTextarea = useCallback(() => {
    if (
      textareaRef.current && 
      !voiceMode && 
      !recordingAnim && 
      !disabled &&
      !isLongPressing.current
    ) {
      textareaRef.current.focus()
    }
  }, [voiceMode, recordingAnim, disabled])

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

  // ========== 核心修复：强制关闭弹框 ==========
  const forceCloseRecording = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (waveInterval.current) {
      clearInterval(waveInterval.current)
      waveInterval.current = null
    }
    
    isLongPressTriggered.current = false
    isLongPressing.current = false
    isTouching.current = false
    setRecordingAnim(false)
    stopWaveAnimation()
    setDragY(0)
    blurTextarea()

    if (isWeChat()) {
      setRecordingAnim(false)
      stopWaveAnimation()
    }
  }, [stopWaveAnimation, blurTextarea])

  // ========== 长按开始 ==========
  const handleRecordPressStart = useCallback((isClick = false, e?: React.MouseEvent | React.TouchEvent) => {
    if (isClick || disabled || isResponding || recordingAnim || isLongPressing.current) return
    
    isLongPressing.current = true
    isTouching.current = e?.type === 'touchstart' || false
    blurTextarea()

    isLongPressTriggered.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      setRecordingAnim(true)
      startWaveAnimation()
      try {
        voiceInputRef.current?.start()
      } catch (err) {
        console.error('录音启动失败:', err)
      }
    }, LONG_PRESS_DELAY)
  }, [disabled, isResponding, recordingAnim, startWaveAnimation, blurTextarea])

  // ========== 长按结束 ==========
  const handleRecordPressEnd = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    
    isTouching.current = false
    isLongPressing.current = false

    if (!isLongPressTriggered.current) {
      setTimeout(() => focusTextarea(), 100)
      return
    }

    forceCloseRecording()

    const cancelSend = dragY < -30
    if (cancelSend) {
      notify({ type: 'info', message: '已取消发送' })
      try {
        voiceInputRef.current?.stop()
      } catch (err) {}
      return
    }

    setTimeout(() => {
      try {
        voiceInputRef.current?.stop()
      } catch (err) {
        console.error('录音停止失败:', err)
      }
    }, 50)
  }, [dragY, notify, focusTextarea, forceCloseRecording])

  // ========== 滑动处理 ==========
  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    
    let y = 0
    if ('touches' in e && e.touches.length > 0) {
      y = e.touches[0].clientY
    } else if ('clientY' in e) {
      y = e.clientY
    }
    
    setDragY(window.innerHeight / 2 - y)
    blurTextarea()
  }, [recordingAnim, blurTextarea])

  // ========== 语音转换完成 ==========
  const handleVoiceConverted = useCallback((voiceText: string) => {
    forceCloseRecording()
    
    if (!onSend || dragY < -30) return
    if (!voiceText?.trim()) {
      notify({ 
        type: 'info', 
        message: '未识别到文字',
        className: 'ml-4' // 保留样式：提示框左侧间距
      })
      return
    }
    
    const { files, setFiles } = filesStore.getState()
    if (isResponding) return
    // 修复：文件上传状态判断（还原原始逻辑）
    if (files.find(f => f.transferMethod === TransferMethod.LOCAL && !f.uploadedId)) return
    if (!checkInputsForm(inputs, inputsForm)) return

    setTimeout(() => {
      onSend(voiceText, files)
      handleQueryChange('')
      setFiles([])
      blurTextarea()
    }, 50)
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, notify, blurTextarea, forceCloseRecording])

  // ========== VoiceInput取消回调 ==========
  const handleVoiceCancel = useCallback(() => {
    forceCloseRecording()
  }, [forceCloseRecording])

  // ========== 其他逻辑 ==========
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  // ========== 全局兜底 ==========
  useEffect(() => {
    const cleanup = disableTextSelection()
    
    return () => {
      forceCloseRecording()
      cleanup()
    }
  }, [forceCloseRecording, disableTextSelection])

  // ========== 全局监听ESC键 ==========
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && recordingAnim) {
        forceCloseRecording()
      }
    }
    window.addEventListener('keydown', handleEscKey)
    return () => {
      window.removeEventListener('keydown', handleEscKey)
    }
  }, [recordingAnim, forceCloseRecording])

  // ========== 处理按钮点击时关闭键盘 ==========
  const handleButtonClick = useCallback(() => {
    closeKeyboardAndBlur()
  }, [closeKeyboardAndBlur])

  const toggleVoiceMode = useCallback(() => {
    forceCloseRecording()
    handleButtonClick()
    setVoiceMode(prev => {
      const newMode = !prev
      setTimeout(() => {
        if (newMode) {
          blurTextarea()
        } else {
          focusTextarea()
        }
      }, 0)
      return newMode
    })
    setQuery('')
  }, [focusTextarea, blurTextarea, forceCloseRecording, handleButtonClick])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleInputClick = useCallback(() => {
    if (isTouching.current || isLongPressing.current) return
    if (!voiceMode && !recordingAnim) focusTextarea()
  }, [voiceMode, recordingAnim, focusTextarea])

  const handleInputLongPressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return
    if (!voiceMode && !recordingAnim) {
      blurTextarea()
      handleRecordPressStart(false, e)
    }
  }, [voiceMode, recordingAnim, handleRecordPressStart, blurTextarea])

  const handleInputLongPressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    handleRecordPressEnd(e)
  }, [handleRecordPressEnd])

  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (voiceMode || recordingAnim) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      // 修复：发送时获取文件列表（还原原始逻辑）
      const { files, setFiles } = filesStore.getState()
      onSend?.(query, files)
      handleQueryChange('')
      setFiles([]) // 发送后清空文件
      blurTextarea()
    }
  }

  useEffect(() => {
    if (!voiceMode) {
      focusTextarea()
    }
  }, [voiceMode, focusTextarea])

  useEffect(() => {
    if (recordingAnim) {
      blurTextarea()
    }
  }, [recordingAnim, blurTextarea])

  // ========== 操作栏 ==========
  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      voiceMode={voiceMode}
      toggleVoiceMode={toggleVoiceMode}
      onMicLongPress={() => handleRecordPressStart(false)}
      onMicEnd={handleRecordPressEnd}
      onSend={() => {
        handleButtonClick()
        if (!isResponding && query.trim() && !voiceMode) {
          // 修复：发送时校验文件上传状态（还原原始逻辑）
          const { files, setFiles } = filesStore.getState()
          if (files.find(f => f.transferMethod === TransferMethod.LOCAL && !f.uploadedId)) {
            notify({ type: 'info', message: '请等待文件上传完成' })
            return
          }
          onSend?.(query, files)
          handleQueryChange('')
          setFiles([]) // 发送后清空文件
          blurTextarea()
        }
      }}
      theme={theme}
      isMobile={isMobile()}
      onButtonClick={handleButtonClick}
    />
  )

  // ========== 渲染部分（核心：仅新增文件回显组件，保留所有样式） ==========
  return (
    <>
      {/* 录音弹框（保留所有样式） */}
      {recordingAnim && (
        <div 
          className="fixed inset-0 z-50 pointer-events-auto flex items-end justify-center"
          onClick={() => forceCloseRecording()}
          onContextMenu={handleContextMenu}
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchCallout: 'none',
            WebkitTouchCallout: 'none'
          }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-700 via-blue-600 to-blue-500/70"
            style={{
              height: '180px',
              borderRadius: '50% / 100% 100% 0 0',
              filter: 'blur(8px)',
              border: 'none',
              transform: 'scaleX(1.05)',
            }}
          />
          <div 
            className="relative z-10 w-full flex flex-col items-center justify-end pb-14 h-[180px]"
          >
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
            {isWeChat() && (
              <div className="text-white text-xs mt-4 opacity-80">
                点击空白处可手动关闭
              </div>
            )}
          </div>
        </div>
      )}

      {/* 输入框容器（保留所有样式，仅新增文件拖拽事件） */}
      <div
        className={cn(
          'relative z-10 rounded-full border border-gray-200 bg-white py-2.5 px-4 shadow-sm transition-all',
          isDragActive && 'border-dashed border-blue-400',
          disabled && 'opacity-50 pointer-events-none',
          recordingAnim && 'opacity-30',
        )}
        style={{ 
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchCallout: 'none',
          WebkitTouchCallout: 'none'
        }}
        onContextMenu={handleContextMenu}
        onClick={() => {
          if (recordingAnim) forceCloseRecording()
        }}
        // 仅新增：文件拖拽事件（文件上传核心）
        onDragEnter={handleDragFileEnter}
        onDragLeave={handleDragFileLeave}
        onDragOver={handleDragFileOver}
        onDrop={handleDropFile}
      >
        {/* 核心新增：文件列表回显组件（仅这一行是新增，保留原有样式结构） */}
        <FileListInChatInput fileConfig={visionConfig!} className="mr-2" />
        
        <div className="w-full flex items-center justify-between">
          {voiceMode ? (
            <div
              className="w-full h-9 flex items-center justify-center"
              onContextMenu={handleContextMenu}
              onTouchStart={(e) => handleRecordPressStart(false, e)}
              onTouchEnd={(e) => handleRecordPressEnd(e)}
              onTouchMove={(e) => handleRecordMove(e)}
              onMouseDown={(e) => handleRecordPressStart(false, e)}
              onMouseUp={(e) => handleRecordPressEnd(e)}
              onMouseLeave={(e) => handleRecordPressEnd(e)}
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
            >
              <span className="text-sm text-gray-500">按住说话</span>
              {/* 保留样式：操作栏右外边距10px */}
              <div className="absolute right-0 top-1/2 translate-y-[-50%]" style={{ marginRight: '10px' }}>
                {operation}
              </div>
            </div>
          ) : (
            <div
              ref={wrapperRef}
              className="flex-1 flex items-center gap-2"
              onClick={handleInputClick}
              onContextMenu={handleContextMenu}
              onTouchStart={(e) => handleInputLongPressStart(e)}
              onTouchEnd={(e) => handleInputLongPressEnd(e)}
              onTouchMove={(e) => handleRecordMove(e)}
              onMouseDown={(e) => handleInputLongPressStart(e)}
              onMouseUp={(e) => handleInputLongPressEnd(e)}
              onMouseLeave={(e) => handleInputLongPressEnd(e)}
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
            >
              <div className="flex-1 relative">
                <div ref={textValueRef} className="invisible absolute whitespace-pre px-1 text-sm">
                  {query}
                </div>
                <Textarea
                  ref={ref => textareaRef.current = ref as any}
                  className="w-full resize-none bg-transparent px-1 text-sm outline-none text-gray-800"
                  placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '聊天')}
                  minRows={1} maxRows={4}
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  // 仅新增：粘贴文件事件
                  onPaste={handleClipboardPasteFile}
                  onDrop={handleDropFile}
                  onContextMenu={handleContextMenu}
                  disabled={disabled}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
                  }}
                />
              </div>
              <div className="flex-shrink-0">
                {operation}
              </div>
            </div>
          )}
        </div>

        <VoiceInput
          ref={voiceInputRef}
          onConverted={handleVoiceConverted}
          onCancel={handleVoiceCancel}
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