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

  const LONG_PRESS_DELAY = isMobile() ? 300 : 500 // H5缩短长按触发时间
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const isTouching = useRef(false) // 标记是否处于触摸状态

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

  // 【小程序H5专用】极简焦点，不强制、不派发、不冲突
  const focusTextarea = useCallback(() => {
    if (textareaRef.current && !voiceMode && !recordingAnim && !disabled) {
      textareaRef.current.focus()
    }
  }, [voiceMode, recordingAnim, disabled])

  const handleQueryChange = useCallback(
    (value: string) => {
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

  // 组件卸载时强制清理所有状态
  useEffect(() => {
    return () => {
      if (waveInterval.current) clearInterval(waveInterval.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      // 强制重置录音状态
      isRecordingRef.current = false
      isLongPressTriggered.current = false
      isTouching.current = false
      setRecordingAnim(false)
      setDragY(0)
    }
  }, [])

  // 监听recordingAnim状态，确保弹框及时消失
  useEffect(() => {
    if (!recordingAnim) {
      stopWaveAnimation()
      isRecordingRef.current = false
      isLongPressTriggered.current = false
      isTouching.current = false
      setDragY(0)
    }
  }, [recordingAnim, stopWaveAnimation])

  // 录音开始【H5兼容：区分触摸/鼠标事件，不阻止点击事件】
  const handleRecordPressStart = useCallback((isClick = false, e?: React.MouseEvent | React.TouchEvent) => {
    // H5环境下，点击事件不触发录音（避免和点击冲突）
    if (isClick || disabled || isResponding || isRecordingRef.current) return
    
    // 标记触摸状态
    if (e && 'touches' in e) {
      isTouching.current = true
    }

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
        // 捕获异常时立即重置所有状态
        isRecordingRef.current = false
        isLongPressTriggered.current = false
        isTouching.current = false
        setRecordingAnim(false)
        stopWaveAnimation()
        setDragY(0)
      })
    }, LONG_PRESS_DELAY)
  }, [t, notify, disabled, isResponding, startWaveAnimation, stopWaveAnimation])

  // 录音结束【H5兼容：确保触摸/鼠标事件都能触发】
  const handleRecordPressEnd = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      // 清除计时器
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      
      // 重置触摸状态
      isTouching.current = false
      
      // 未触发长按：直接返回（保留点击功能）
      if (!isLongPressTriggered.current) {
        return
      }

      // 强制重置所有录音状态
      const cancelSend = dragY < -30
      isLongPressTriggered.current = false
      isRecordingRef.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      setDragY(0)

      if (cancelSend) {
        notify({ type: 'info', message: '已取消发送' })
        voiceInputRef.current?.stop()
        focusTextarea()
        return
      }

      // H5兼容：延迟停止，确保录音数据完整
      setTimeout(() => {
        voiceInputRef.current?.stop()
      }, 100)
    },
    [dragY, notify, stopWaveAnimation, focusTextarea]
  )

  // 录音滑动【H5兼容：正确解析触摸坐标】
  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    
    // H5环境下阻止触摸滑动的默认行为（如页面滚动）
    if ('touches' in e) {
      e.preventDefault()
    }
    
    let y = 0
    if ('touches' in e && e.touches.length > 0) {
      y = e.touches[0].clientY // 触摸事件取第一个触点
    } else if ('clientY' in e) {
      y = e.clientY // 鼠标事件
    }
    
    setDragY(window.innerHeight / 2 - y)
  }, [recordingAnim])

  // 语音转换完成处理【确保H5下能正常发送】
  const handleVoiceConverted = useCallback((voiceText: string) => {
    if (!onSend || dragY < -30) return
    if (!voiceText?.trim()) {
      notify({ type: 'info', message: '未识别到文字' })
      focusTextarea()
      return
    }
    
    const { files, setFiles } = filesStore.getState()
    if (isResponding) return
    if (files.find(f => f.transferMethod === TransferMethod.LOCAL && !f.uploadedId)) return
    if (!checkInputsForm(inputs, inputsForm)) return

    // H5下确保状态重置后再发送
    setTimeout(() => {
      onSend(voiceText, files)
      handleQueryChange('')
      setFiles([])
      focusTextarea()
    }, 50)
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, handleQueryChange, notify, focusTextarea])

  // 模式切换【H5兼容：确保点击生效】
  const toggleVoiceMode = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    isLongPressTriggered.current = false
    isTouching.current = false
    setVoiceMode(prev => {
      const newMode = !prev
      setTimeout(() => {
        if (!newMode) focusTextarea()
      }, 0)
      return newMode
    })
    setQuery('')
  }, [focusTextarea])

  // 阻止上下文菜单（仅H5环境）
  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile()) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  // 输入框事件处理【H5兼容：区分点击和长按】
  const handleInputClick = useCallback(() => {
    // 触摸状态下不触发点击（避免长按后误触发）
    if (isTouching.current) return
    if (!voiceMode && !recordingAnim) focusTextarea()
  }, [voiceMode, recordingAnim])

  const handleInputLongPressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 鼠标左键才触发
    if ('button' in e && e.button !== 0) return
    if (!voiceMode && !recordingAnim) handleRecordPressStart(false, e)
  }, [voiceMode, recordingAnim, handleRecordPressStart])

  const handleInputLongPressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    handleRecordPressEnd(e)
  }, [handleRecordPressEnd])

  // 其他原有方法保持不变...
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

  useEffect(() => {
    focusTextarea()
  }, [focusTextarea])

  // 操作栏渲染【传递H5兼容的事件】
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
      isMobile={isMobile()} // 传递H5标识
    />
  )

  return (
    <>
      {recordingAnim && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto"
          onContextMenu={handleContextMenu}
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
        onContextMenu={handleContextMenu}
      >
        <div className="w-full flex items-center justify-between">
          {voiceMode ? (
            // 语音模式：H5兼容的触摸/鼠标事件
            <div
              className="w-full h-9 flex items-center justify-center"
              onContextMenu={handleContextMenu}
              onTouchStart={(e) => {
                // 不阻止触摸开始事件，确保长按能触发
                handleRecordPressStart(false, e)
              }}
              onTouchEnd={(e) => {
                handleRecordPressEnd(e)
              }}
              onTouchMove={(e) => {
                handleRecordMove(e)
              }}
              onMouseDown={(e) => {
                handleRecordPressStart(false, e)
              }}
              onMouseUp={(e) => {
                handleRecordPressEnd(e)
              }}
              onMouseLeave={(e) => {
                handleRecordPressEnd(e)
              }}
            >
              <span className="text-sm text-gray-500">按住说话</span>
              <div className="absolute right-0 top-1/2 translate-y-[-50%]">
                {operation}
              </div>
            </div>
          ) : (
            // 文字模式：H5兼容的事件处理
            <div
              ref={wrapperRef}
              className="flex-1 flex items-center gap-2"
              onClick={handleInputClick}
              onContextMenu={handleContextMenu}
              onTouchStart={(e) => {
                handleInputLongPressStart(e)
              }}
              onTouchEnd={(e) => {
                handleInputLongPressEnd(e)
              }}
              onTouchMove={(e) => {
                handleRecordMove(e)
              }}
              onMouseDown={(e) => {
                handleInputLongPressStart(e)
              }}
              onMouseUp={(e) => {
                handleInputLongPressEnd(e)
              }}
              onMouseLeave={(e) => {
                handleInputLongPressEnd(e)
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
                  onPaste={handleClipboardPasteFile}
                  onDrop={handleDropFile}
                  onContextMenu={handleContextMenu}
                  disabled={disabled}
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
          onCancel={() => {
            isRecordingRef.current = false
            isLongPressTriggered.current = false
            isTouching.current = false
            setRecordingAnim(false)
            stopWaveAnimation()
            setDragY(0)
            focusTextarea()
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