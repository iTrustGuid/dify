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
  const isLongPressing = useRef(false) // 标记是否正在长按
  const isClosingRecording = useRef(false) // 新增：防止重复关闭导致递归

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

  // ========== 基础工具函数 ==========
  // 失去输入框焦点
  const blurTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.blur()
      // H5下强制隐藏键盘
      if (isMobile() && document.activeElement === textareaRef.current) {
        document.activeElement.blur()
      }
    }
  }, [])

  // 聚焦输入框
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

  // 波形动画相关函数
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

  // ========== 强制关闭录音（核心修复：防止递归） ==========
  const forceCloseRecording = useCallback(() => {
    // 已经在关闭中，直接返回（防止递归）
    if (isClosingRecording.current) return
    
    // 标记正在关闭，防止重复调用
    isClosingRecording.current = true

    try {
      // 清空计时器
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      
      // 重置所有录音状态
      isRecordingRef.current = false
      isLongPressTriggered.current = false
      isLongPressing.current = false
      isTouching.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      setDragY(0)
      blurTextarea()
      
      // 停止录音实例（仅当正在录音时调用，避免触发onCancel）
      if (voiceInputRef.current?.isRecording) {
        voiceInputRef.current.stop()
      }
      
      // 微信环境下额外通知
      if (isWeChat()) {
        notify({ type: 'info', message: t('common.voiceInput.recordCanceled') || '录音已取消' })
      }
    } finally {
      // 重置标记
      setTimeout(() => {
        isClosingRecording.current = false
      }, 100)
    }
  }, [stopWaveAnimation, blurTextarea, notify, t])

  // ========== 处理VoiceInput的onCancel（仅重置状态，不调用forceCloseRecording） ==========
  const handleVoiceInputCancel = useCallback(() => {
    // 仅重置父组件状态，不调用forceCloseRecording，打破递归链
    isRecordingRef.current = false
    isLongPressTriggered.current = false
    isLongPressing.current = false
    isTouching.current = false
    setRecordingAnim(false)
    stopWaveAnimation()
    setDragY(0)
    blurTextarea()
  }, [stopWaveAnimation, blurTextarea])

  // ========== 其他业务函数 ==========
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (waveInterval.current) clearInterval(waveInterval.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      isRecordingRef.current = false
      isLongPressTriggered.current = false
      isTouching.current = false
      isLongPressing.current = false
      setRecordingAnim(false)
      setDragY(0)
      blurTextarea()
    }
  }, [blurTextarea])

  // 录音开始【微信授权后强制重置状态】
  const handleRecordPressStart = useCallback((isClick = false, e?: React.MouseEvent | React.TouchEvent) => {
    if (isClick || disabled || isResponding || isRecordingRef.current) return
    
    // 标记长按开始，立即失去输入框焦点
    isLongPressing.current = true
    blurTextarea()

    if (e && 'touches' in e) {
      isTouching.current = true
      e.preventDefault()
    }

    isLongPressTriggered.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      isRecordingRef.current = true
      setRecordingAnim(true)
      startWaveAnimation()

      // 微信授权后强制重置状态
      const startRecording = () => {
        voiceInputRef.current?.start()
        // 授权成功后，监听录音开始
        setTimeout(() => {
          if (isRecordingRef.current && !voiceInputRef.current?.isRecording) {
            forceCloseRecording()
          }
        }, 1000)
      }

      // 申请麦克风权限
      ;(Recorder as any).getPermission().then(() => {
        startRecording()
      }).catch((err: any) => {
        notify({ type: 'error', message: t('common.voiceInput.notAllow') || '麦克风权限申请失败' })
        forceCloseRecording() // 授权失败也强制关闭
      })

      // 微信环境下额外的超时保护
      if (isWeChat()) {
        setTimeout(() => {
          if (isRecordingRef.current && !voiceInputRef.current?.isRecording) {
            forceCloseRecording()
          }
        }, 3000)
      }
    }, LONG_PRESS_DELAY)
  }, [t, notify, disabled, isResponding, startWaveAnimation, blurTextarea, forceCloseRecording])

  // 录音结束【确保状态重置】
  const handleRecordPressEnd = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      
      // 重置触摸/长按标记
      isTouching.current = false
      isLongPressing.current = false

      // 非长按：短暂延迟后恢复聚焦
      if (!isLongPressTriggered.current) {
        setTimeout(() => focusTextarea(), 100)
        return
      }

      // 长按松开：强制失去焦点
      blurTextarea()

      const cancelSend = dragY < -30
      // 强制重置所有录音状态
      isLongPressTriggered.current = false
      isRecordingRef.current = false
      setRecordingAnim(false)
      stopWaveAnimation()
      setDragY(0)

      if (cancelSend) {
        notify({ type: 'info', message: '已取消发送' })
        // 取消发送时仅停止录音，不触发onCancel
        if (voiceInputRef.current?.isRecording) {
          voiceInputRef.current.stop()
        }
        return
      }

      // 正常发送：仅当正在录音时调用stop
      if (voiceInputRef.current?.isRecording) {
        voiceInputRef.current.stop()
      }
    },
    [dragY, notify, stopWaveAnimation, focusTextarea, blurTextarea]
  )

  // 录音滑动：保持失去焦点
  const handleRecordMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!recordingAnim || !isLongPressTriggered.current) return
    
    if ('touches' in e) {
      e.preventDefault()
    }
    
    let y = 0
    if ('touches' in e && e.touches.length > 0) {
      y = e.touches[0].clientY
    } else if ('clientY' in e) {
      y = e.clientY
    }
    
    setDragY(window.innerHeight / 2 - y)
    blurTextarea()
  }, [recordingAnim, blurTextarea])

  // 语音转换完成：不自动聚焦
  const handleVoiceConverted = useCallback((voiceText: string) => {
    if (!onSend || dragY < -30) return
    if (!voiceText?.trim()) {
      notify({ type: 'info', message: '未识别到文字' })
      blurTextarea()
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
    }, 50)
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, handleQueryChange, notify, blurTextarea])

  // 模式切换：切换后根据模式处理焦点
  const toggleVoiceMode = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    isLongPressTriggered.current = false
    isLongPressing.current = false
    isTouching.current = false
    
    setVoiceMode(prev => {
      const newMode = !prev
      setTimeout(() => {
        // 语音模式：失去焦点；文字模式：聚焦
        if (newMode) {
          blurTextarea()
        } else {
          focusTextarea()
        }
      }, 0)
      return newMode
    })
    setQuery('')
  }, [focusTextarea, blurTextarea])

  // 阻止上下文菜单
  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile()) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  // 输入框点击：仅非长按状态聚焦
  const handleInputClick = useCallback(() => {
    if (isTouching.current || isLongPressing.current) return
    if (!voiceMode && !recordingAnim) focusTextarea()
  }, [voiceMode, recordingAnim, focusTextarea])

  // 输入框长按开始：标记状态+失去焦点
  const handleInputLongPressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return
    if (!voiceMode && !recordingAnim) {
      blurTextarea()
      handleRecordPressStart(false, e)
    }
  }, [voiceMode, recordingAnim, handleRecordPressStart, blurTextarea])

  // 输入框长按结束：处理逻辑
  const handleInputLongPressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    handleRecordPressEnd(e)
  }, [handleRecordPressEnd])

  // 其他原有方法保持不变
  const handleCompositionStart = () => { isComposingRef.current = true }
  const handleCompositionEnd = () => { setTimeout(() => { isComposingRef.current = false }, 50) }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (voiceMode || recordingAnim) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      setQuery(q => q.replace(/\n$/, ''))
      onSend?.(query, filesStore.getState().files)
      handleQueryChange('')
      blurTextarea()
    }
  }

  // 初始加载：仅文字模式聚焦
  useEffect(() => {
    if (!voiceMode) {
      focusTextarea()
    }
  }, [voiceMode, focusTextarea])

  // 监听录音状态：录音中强制失去焦点
  useEffect(() => {
    if (recordingAnim) {
      blurTextarea()
    }
  }, [recordingAnim, blurTextarea])

  // 操作栏渲染
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
          blurTextarea()
        }
      }}
      theme={theme}
      isMobile={isMobile()}
    />
  )

  return (
    <>
      {/* 录音弹框：新增点击空白关闭 + 微信环境特殊处理 */}
      {recordingAnim && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto"
          onContextMenu={handleContextMenu}
          // 点击弹框任意位置（除了内部元素）强制关闭
          onClick={(e) => {
            e.stopPropagation()
            forceCloseRecording()
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
            // 阻止内部元素点击触发关闭
            onClick={(e) => e.stopPropagation()}
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
            {/* 微信环境下显示手动关闭提示 */}
            {isWeChat() && (
              <div className="text-white text-xs mt-4 opacity-80">
                点击空白处可手动关闭
              </div>
            )}
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
        // 点击输入框容器也能关闭录音弹框
        onClick={() => {
          if (recordingAnim) {
            forceCloseRecording()
          }
        }}
      >
        <div className="w-full flex items-center justify-between">
          {voiceMode ? (
            // 语音模式：保持原有逻辑
            <div
              className="w-full h-9 flex items-center justify-center"
              onContextMenu={handleContextMenu}
              onTouchStart={(e) => {
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
            // 文字模式：核心修改 - 长按立即失焦
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
                  // H5下阻止自动弹出键盘
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
              <div className="flex-shrink-0">
                {operation}
              </div>
            </div>
          )}
        </div>

        {/* 关键修改：onCancel改为handleVoiceInputCancel，打破递归 */}
        <VoiceInput
          ref={voiceInputRef}
          onConverted={handleVoiceConverted}
          onCancel={handleVoiceInputCancel}
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