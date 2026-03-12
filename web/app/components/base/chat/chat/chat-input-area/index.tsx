import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import Textarea from 'react-textarea-autosize'
import { useTranslation } from 'react-i18next'
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

// 判断是否为移动端/H5环境
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// 判断是否为微信环境
const isWeChat = () => {
  return /MicroMessenger/i.test(navigator.userAgent)
}

// 判断是否为iOS设备
const isIOS = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream
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
  
  // 记录长按起始位置
  const pressStartY = useRef<number>(0)
  // 取消阈值（调大一点，避免轻微滑动就触发）
  const CANCEL_THRESHOLD = -50

  // 核心状态：只控制弹框显隐
  const [recordingAnim, setRecordingAnim] = useState(false)
  const [dragY, setDragY] = useState(0)
  // 判断是否超出边界
  const [isOutOfBoundary, setIsOutOfBoundary] = useState(false)
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

  // ========== 通用关闭键盘函数 ==========
  const closeKeyboard = useCallback(() => {
    // 1. 输入框失焦
    if (textareaRef.current) {
      textareaRef.current.blur()
    }
    
    // 2. 移动端主动失焦当前激活元素
    if (isMobile() && document.activeElement) {
      ;(document.activeElement as HTMLElement).blur()
    }
    
    // 3. 微信环境特殊处理
    if (isWeChat()) {
      setTimeout(() => {
        document.activeElement?.blur()
      }, 50)
    }
    
    // 4. 强制隐藏键盘（兼容Android/iOS）
    if (isMobile()) {
      document.body.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [])

  // ========== 禁用长按默认行为 ==========
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
    closeKeyboard()
  }, [closeKeyboard])

  // ========== 基础工具函数 ==========
  const blurTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.blur()
      if (isMobile() && document.activeElement === textareaRef.current) {
        document.activeElement.blur()
      }
    }
  }, [])

  // 修复iOS焦点问题：增加主动聚焦逻辑
  const focusTextarea = useCallback(() => {
    if (
      textareaRef.current && 
      !voiceMode && 
      !recordingAnim && 
      !disabled &&
      !isLongPressing.current
    ) {
      // iOS特殊处理：先触发点击再聚焦
      if (isIOS()) {
        textareaRef.current.click()
        setTimeout(() => {
          textareaRef.current?.focus({ preventScroll: true })
        }, 0)
      } else {
        textareaRef.current.focus({ preventScroll: true })
      }
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

  // ========== 核心修复：只关UI，不调用stop，彻底避免循环 ==========
  const forceCloseRecording = useCallback(() => {
    // 1. 清除定时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (waveInterval.current) {
      clearInterval(waveInterval.current)
      waveInterval.current = null
    }

    // 2. 只更新UI状态，不调用stop（停止录音在其他地方单独处理）
    isLongPressTriggered.current = false
    isLongPressing.current = false
    isTouching.current = false
    setRecordingAnim(false)
    stopWaveAnimation()
    setDragY(0)
    setIsOutOfBoundary(false)
    pressStartY.current = 0

    // 3. 关闭键盘和失焦
    blurTextarea()
    closeKeyboard()

    // 4. 微信环境额外处理
    if (isWeChat()) {
      setTimeout(() => {
        setRecordingAnim(false)
        stopWaveAnimation()
        closeKeyboard()
      }, 100)
    }
  }, [stopWaveAnimation, blurTextarea, closeKeyboard])

  // ========== 单独的停止录音函数（避免循环） ==========
  const stopVoiceRecording = useCallback(() => {
    if (voiceInputRef.current) {
      try {
        voiceInputRef.current.stop()
      } catch (err) {
        console.warn('停止录音失败:', err)
      }
    }
  }, [])

  // ========== 长按开始 ==========
  const handleRecordPressStart = useCallback((isClick = false, e?: React.MouseEvent | React.TouchEvent) => {
    if (isClick || disabled || isResponding || recordingAnim || isLongPressing.current) return
    
    // 记录长按起始Y坐标
    if (e) {
      if ('touches' in e && e.touches.length > 0) {
        pressStartY.current = e.touches[0].clientY
      } else if ('clientY' in e) {
        pressStartY.current = e.clientY
      }
    }

    isLongPressing.current = true
    isTouching.current = e?.type === 'touchstart' || false
    blurTextarea()
    closeKeyboard()

    isLongPressTriggered.current = false

    longPressTimer.current = setTimeout(async () => {
      isLongPressTriggered.current = true
      setRecordingAnim(true)
      startWaveAnimation()
      try {
        // 启动录音
        const startSuccess = await voiceInputRef.current?.start()
        if (!startSuccess) {
          throw new Error('录音启动失败')
        }
      } catch (err) {
        console.error('录音启动失败:', err)
        forceCloseRecording()
        notify({ 
          type: 'error', 
          message: t('common.chat.voicePermissionDenied') || '录音权限被拒绝，请开启麦克风权限后重试' 
        })
      }
    }, LONG_PRESS_DELAY)
  }, [disabled, isResponding, recordingAnim, startWaveAnimation, blurTextarea, closeKeyboard, notify, t, forceCloseRecording])

  // ========== 长按结束（停止录音+关闭UI） ==========
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

    // 1. 先停止录音
    stopVoiceRecording()
    
    // 2. 再关闭UI
    forceCloseRecording()

    // 判断是否取消发送
    const cancelSend = dragY < CANCEL_THRESHOLD || isOutOfBoundary
    if (cancelSend) {
      notify({ type: 'info', message: '已取消发送' })
      closeKeyboard()
      return
    }
  }, [focusTextarea, dragY, isOutOfBoundary, notify, closeKeyboard, stopVoiceRecording, forceCloseRecording, CANCEL_THRESHOLD])

  // ========== 滑动处理 ==========
  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    
    let currentY = 0
    if ('touches' in e && e.touches.length > 0) {
      currentY = e.touches[0].clientY
    } else if ('clientY' in e) {
      currentY = e.clientY
    }
    
    // 基于起始位置计算偏移
    const offsetY = pressStartY.current - currentY
    if (Math.abs(offsetY) > 10) {
      setDragY(offsetY)
    }

    // 计算是否超出边界
    const popupBoundaryTop = window.innerHeight - 180 - 20
    setIsOutOfBoundary(currentY < popupBoundaryTop)

    blurTextarea()
    closeKeyboard()
  }, [recordingAnim, blurTextarea, closeKeyboard])

  // ========== 语音转换完成 ==========
  const handleVoiceConverted = useCallback((voiceText: string) => {
    forceCloseRecording()
    closeKeyboard()
    
    if (!onSend || dragY < CANCEL_THRESHOLD || isOutOfBoundary) return
    if (!voiceText?.trim()) {
      notify({ 
        type: 'info', 
        message: '未识别到文字',
        className: 'ml-4'
      })
      closeKeyboard()
      return
    }
    
    const { files, setFiles } = filesStore.getState()
    if (isResponding) return
    if (files.find(f => f.transferMethod === TransferMethod.LOCAL && !f.uploadedId)) return
    if (!checkInputsForm(inputs, inputsForm)) return

    setTimeout(() => {
      onSend(voiceText, files)
      handleQueryChange('')
      setFiles([])
      blurTextarea()
      closeKeyboard()
    }, 50)
  }, [onSend, dragY, isOutOfBoundary, isResponding, filesStore, checkInputsForm, inputs, inputsForm, notify, blurTextarea, forceCloseRecording, closeKeyboard, CANCEL_THRESHOLD])

  // ========== VoiceInput取消回调（只关UI） ==========
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
      closeKeyboard()
      cleanup()
    }
  }, [forceCloseRecording, disableTextSelection, closeKeyboard])

  // ========== 全局监听ESC键 ==========
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && recordingAnim) {
        stopVoiceRecording() // 先停录音
        forceCloseRecording() // 再关UI
      }
    }
    window.addEventListener('keydown', handleEscKey)
    return () => {
      window.removeEventListener('keydown', handleEscKey)
    }
  }, [recordingAnim, stopVoiceRecording, forceCloseRecording])

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
          closeKeyboard()
        } else {
          focusTextarea()
        }
      }, 0)
      return newMode
    })
    setQuery('')
  }, [focusTextarea, blurTextarea, forceCloseRecording, handleButtonClick, closeKeyboard])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // ========== 核心修复：限制输入框点击作用域 ==========
  const handleInputClick = useCallback((e: React.MouseEvent) => {
    // 只允许输入框区域触发聚焦
    const target = e.target as HTMLElement
    if (target.closest('textarea') || target.closest('.text-input-area')) {
      if (isTouching.current || isLongPressing.current) return
      if (!voiceMode && !recordingAnim) focusTextarea()
    }
  }, [voiceMode, recordingAnim, focusTextarea])

  // ========== 限制长按作用域到输入框区域 ==========
  const handleInputLongPressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 只在输入框区域触发长按录音
    const target = e.target as HTMLElement
    if (target.closest('textarea') || target.closest('.text-input-area')) {
      if ('button' in e && e.button !== 0) return
      if (!voiceMode && !recordingAnim) {
        blurTextarea()
        closeKeyboard()
        handleRecordPressStart(false, e)
      }
    }
  }, [voiceMode, recordingAnim, handleRecordPressStart, blurTextarea, closeKeyboard])

  const handleInputLongPressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (e && 'relatedTarget' in e && e.relatedTarget) {
      const target = e.target as HTMLElement
      const relatedTarget = e.relatedTarget as HTMLElement
      if (target.closest('.chat-input-area') || relatedTarget.closest('.chat-input-area')) {
        return
      }
    }
    handleRecordPressEnd(e)
  }, [handleRecordPressEnd])

  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  // ========== 修复发送逻辑：确保发送后键盘关闭 ==========
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (voiceMode || recordingAnim) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      const { files, setFiles } = filesStore.getState()
      onSend?.(query, files)
      handleQueryChange('')
      setFiles([])
      blurTextarea()
      closeKeyboard()
      
      // 额外确保键盘关闭
      setTimeout(() => {
        closeKeyboard()
      }, 100)
    }
  }

  // ========== 修复iOS新对话焦点问题 ==========
  useEffect(() => {
    if (!voiceMode) {
      // iOS延迟聚焦，确保DOM已渲染完成
      const timer = setTimeout(() => {
        focusTextarea()
      }, isIOS() ? 100 : 0)
      
      return () => clearTimeout(timer)
    }
  }, [voiceMode, focusTextarea])

  useEffect(() => {
    if (recordingAnim) {
      blurTextarea()
      closeKeyboard()
    }
  }, [recordingAnim, blurTextarea, closeKeyboard])

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
          const { files, setFiles } = filesStore.getState()
          if (files.find(f => f.transferMethod === TransferMethod.LOCAL && !f.uploadedId)) {
            notify({ type: 'info', message: '请等待文件上传完成' })
            return
          }
          onSend?.(query, files)
          handleQueryChange('')
          setFiles([])
          blurTextarea()
          closeKeyboard()
          
          // 发送后强制关闭键盘（修复安卓问题）
          setTimeout(() => {
            closeKeyboard()
          }, 100)
        }
      }}
      theme={theme}
      isMobile={isMobile()}
      onButtonClick={handleButtonClick}
    />
  )

  // ========== 渲染 ==========
  return (
    <>
      {/* 录音弹框 */}
      {recordingAnim && (
        <div 
          className="fixed inset-0 z-50 pointer-events-auto flex items-end justify-center chat-input-area"
          onClick={() => {
            stopVoiceRecording()
            forceCloseRecording()
          }}
          onContextMenu={handleContextMenu}
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchCallout: 'none',
            WebkitTouchCallout: 'none'
          }}
        >
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: '180px',
              borderRadius: '50% / 100% 100% 0 0',
              filter: 'blur(8px)',
              border: 'none',
              transform: 'scaleX(1.05)',
              background: isOutOfBoundary 
                ? 'linear-gradient(to top, #f86b6b, #faa0a0, rgba(255, 200, 200, 0.4))' 
                : 'linear-gradient(to top, #1976d2, #2196f3, rgba(100, 181, 246, 0.7))',
            }}
          />
          <div 
            className="relative z-10 w-full flex flex-col items-center justify-end pb-14 h-[180px]"
          >
            <div 
              className="text-lg font-medium mb-5"
              style={{
                color: isOutOfBoundary ? '#e63946' : 'white',
                textShadow: isOutOfBoundary ? '0 0 1px rgba(0,0,0,0.15)' : '0 0 2px rgba(0,0,0,0.2)',
                fontWeight: 500
              }}
            >
              {isOutOfBoundary ? '松开取消' : '松手发送，上移取消'}
            </div>
            <div className="flex items-center justify-center gap-[3px] h-4 w-[88%]">
              {waveDots.map((h, i) => (
                <div
                  key={i}
                  className="w-[2.5px] rounded-full opacity-100 transition-all duration-150"
                  style={{ 
                    height: `${h}px`,
                    backgroundColor: isOutOfBoundary ? '#e63946' : 'white',
                    opacity: 0.9
                  }}
                />
              ))}
            </div>
            {isWeChat() && (
              <div 
                className="text-xs mt-4 opacity-80"
                style={{ color: isOutOfBoundary ? '#e63946' : 'white' }}
              >
                点击空白处可手动关闭
              </div>
            )}
          </div>
        </div>
      )}

      {/* 输入框容器 */}
      <div
        className={cn(
          'relative z-10 rounded-full border border-gray-200 bg-white py-2.5 px-4 shadow-sm transition-all chat-input-area',
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
        onClick={(e) => {
          // 容器点击不触发任何操作，只让输入框区域响应
          if (recordingAnim) {
            stopVoiceRecording()
            forceCloseRecording()
          }
        }}
        onDragEnter={handleDragFileEnter}
        onDragLeave={handleDragFileLeave}
        onDragOver={handleDragFileOver}
        onDrop={handleDropFile}
      >
        <FileListInChatInput fileConfig={visionConfig!} className="mr-2" />
        
        <div className="w-full flex items-center justify-between">
          {voiceMode ? (
            <div
              className="w-full h-9 flex items-center justify-center chat-input-area"
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
              <div className="absolute right-0 top-1/2 translate-y-[-50%]" style={{ marginRight: '10px' }}>
                {operation}
              </div>
            </div>
          ) : (
            <div
              ref={wrapperRef}
              className="flex-1 flex items-center gap-2 chat-input-area"
              onContextMenu={handleContextMenu}
              style={{
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
            >
              {/* ========== 核心修改：限制交互作用域 ========== */}
              <div 
                className="flex-1 text-input-area"
                onClick={handleInputClick}
                onTouchStart={handleInputLongPressStart}
                onTouchEnd={handleInputLongPressEnd}
                onTouchMove={handleRecordMove}
                onMouseDown={handleInputLongPressStart}
                onMouseUp={handleInputLongPressEnd}
                onMouseLeave={handleInputLongPressEnd}
              >
                <div className="flex-1 relative">
                  <div ref={textValueRef} className="invisible absolute whitespace-pre px-1 text-sm">
                    {query}
                  </div>
                  <Textarea
                    ref={ref => textareaRef.current = ref as any}
                    className="w-full resize-none bg-transparent px-1 text-sm outline-none text-gray-800"
                    placeholder={decode(t('common.chat.inputPlaceholder') || '发消息或按住说话...')}
                    minRows={1} maxRows={4}
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onPaste={handleClipboardPasteFile}
                    onDrop={handleDropFile}
                    onContextMenu={handleContextMenu}
                    disabled={disabled}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    style={{
                      userSelect: 'text', // 恢复文本选择
                      WebkitUserSelect: 'text'
                    }}
                  />
                </div>
              </div>
              {/* 操作按钮区域：不再响应输入框相关事件 */}
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