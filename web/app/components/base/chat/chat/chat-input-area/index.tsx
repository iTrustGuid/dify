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
import type { Theme } from '../../embedded-chatbot/theme-context'
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
  const isLongPressing = useRef(false)

  // 核心状态：只控制弹框显隐，样式完全保留
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

  // ========== 新增：微信授权状态检测定时器（先定义ref） ==========
  const authCheckTimer = useRef<NodeJS.Timeout | null>(null)

  // ========== 基础工具函数（提前定义，解决依赖顺序问题） ==========
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

  // ========== 核心修复：强制关闭弹框（提前定义，解决顺序问题） ==========
  const forceCloseRecording = useCallback(() => {
    // 清空计时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    
    // 清空授权检测定时器
    if (authCheckTimer.current) {
      clearTimeout(authCheckTimer.current)
      authCheckTimer.current = null
    }
    
    // 重置状态（只改值，不改样式）
    isLongPressTriggered.current = false
    isLongPressing.current = false
    isTouching.current = false
    setRecordingAnim(false)
    stopWaveAnimation()
    setDragY(0)
    blurTextarea()

    // 微信环境授权后强制关闭弹框
    if (isWeChat()) {
      setTimeout(() => {
        setRecordingAnim(false)
        stopWaveAnimation()
      }, 100)
    }
  }, [stopWaveAnimation, blurTextarea])

  // ========== 微信授权状态检测（现在forceCloseRecording已定义） ==========
  const checkWeChatAuthStatus = useCallback(() => {
    if (!isWeChat() || !recordingAnim) return
    
    // 清除之前的定时器
    if (authCheckTimer.current) {
      clearTimeout(authCheckTimer.current)
    }
    
    // 每200ms检测一次授权状态
    authCheckTimer.current = setTimeout(() => {
      // 检测是否获得麦克风权限
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then(permissionStatus => {
          // 如果权限被拒绝，强制关闭弹框
          if (permissionStatus.state === 'denied') {
            notify({ 
              type: 'error', 
              message: t('common.chat.microphoneDenied') || '麦克风权限被拒绝，请在设置中开启' 
            })
            forceCloseRecording()
          }
          // 如果权限已授予，但录音未开始（授权弹框已关闭），也关闭录制弹框
          else if (permissionStatus.state === 'granted' && recordingAnim) {
            // 这里延迟一点确保授权流程完成
            setTimeout(() => {
              forceCloseRecording()
            }, 300)
          }
          
          // 监听权限变化
          permissionStatus.onchange = () => {
            if (permissionStatus.state === 'denied') {
              forceCloseRecording()
            }
          }
        })
        .catch(() => {
          // 兼容处理：如果无法检测权限，授权后默认关闭弹框
          setTimeout(() => {
            forceCloseRecording()
          }, 500)
        })
    }, 200)
  }, [isWeChat, recordingAnim, notify, t, forceCloseRecording])

  // ========== 长按开始（恢复弹框触发） ==========
  const handleRecordPressStart = useCallback((isClick = false, e?: React.MouseEvent | React.TouchEvent) => {
    if (isClick || disabled || isResponding || recordingAnim) return
    
    isLongPressing.current = true
    blurTextarea()

    if (e && 'touches' in e) {
      isTouching.current = true
      e.preventDefault()
    }

    isLongPressTriggered.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      setRecordingAnim(true) // 弹框显示（样式不变）
      startWaveAnimation()

      // 开始录音（触发微信授权）
      voiceInputRef.current?.start()
      
      // 新增：微信环境下启动授权检测
      if (isWeChat()) {
        checkWeChatAuthStatus()
      }
    }, LONG_PRESS_DELAY)
  }, [disabled, isResponding, recordingAnim, startWaveAnimation, blurTextarea, isWeChat, checkWeChatAuthStatus])

  // ========== 长按结束（恢复弹框关闭） ==========
  const handleRecordPressEnd = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      
      // 清空授权检测定时器
      if (authCheckTimer.current) {
        clearTimeout(authCheckTimer.current)
        authCheckTimer.current = null
      }
      
      isTouching.current = false
      isLongPressing.current = false

      if (!isLongPressTriggered.current) {
        setTimeout(() => focusTextarea(), 100)
        return
      }

      blurTextarea()
      const cancelSend = dragY < -30
      
      // 强制关闭弹框
      forceCloseRecording()

      if (cancelSend) {
        notify({ type: 'info', message: '已取消发送' })
        return
      }

      // 正常停止录音
      setTimeout(() => {
        voiceInputRef.current?.stop()
      }, 100)
    },
    [dragY, notify, focusTextarea, blurTextarea, forceCloseRecording]
  )

  // ========== 滑动处理（样式不变） ==========
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

  // ========== 语音转换完成 ==========
  const handleVoiceConverted = useCallback((voiceText: string) => {
    forceCloseRecording() // 转换完成关闭弹框
    if (!onSend || dragY < -30) return
    if (!voiceText?.trim()) {
      notify({ type: 'info', message: '未识别到文字' })
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
  }, [onSend, dragY, isResponding, filesStore, checkInputsForm, inputs, inputsForm, notify, blurTextarea, forceCloseRecording])

  // ========== VoiceInput取消回调（只关弹框） ==========
  const handleVoiceCancel = useCallback(() => {
    forceCloseRecording()
  }, [forceCloseRecording])

  // ========== 其他逻辑（完全保留） ==========
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  useEffect(() => {
    return () => {
      if (waveInterval.current) clearInterval(waveInterval.current)
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      if (authCheckTimer.current) clearTimeout(authCheckTimer.current) // 新增
      forceCloseRecording()
    }
  }, [forceCloseRecording])

  const toggleVoiceMode = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // 新增：清空授权检测定时器
    if (authCheckTimer.current) {
      clearTimeout(authCheckTimer.current)
      authCheckTimer.current = null
    }
    
    isLongPressTriggered.current = false
    isLongPressing.current = false
    isTouching.current = false
    
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
  }, [focusTextarea, blurTextarea])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile()) {
      e.preventDefault()
      e.stopPropagation()
    }
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
      onSend?.(query, filesStore.getState().files)
      handleQueryChange('')
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

  // ========== 操作栏（仅修复麦克风长按事件绑定） ==========
  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      voiceMode={voiceMode}
      toggleVoiceMode={toggleVoiceMode}
      // 👇 核心修复：麦克风长按事件强制传isClick=false
      onMicLongPress={() => handleRecordPressStart(false)}
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

  // ========== 渲染部分（样式100%还原，只加点击关闭逻辑） ==========
  return (
    <>
      {/* 录音弹框：样式完全保留，只加点击关闭逻辑 */}
      {recordingAnim && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto"
          onContextMenu={handleContextMenu}
          onClick={(e) => {
            e.stopPropagation()
            forceCloseRecording() // 点击弹框任意位置关闭
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
            {isWeChat() && (
              <div className="text-white text-xs mt-4 opacity-80">
                点击空白处可手动关闭
              </div>
            )}
          </div>
        </div>
      )}

      {/* 输入框容器：样式不变，加点击关闭弹框 */}
      <div
        className={cn(
          'relative z-10 rounded-full border border-gray-200 bg-white py-2.5 px-4 shadow-sm transition-all',
          isDragActive && 'border-dashed border-blue-400',
          disabled && 'opacity-50 pointer-events-none',
          recordingAnim && 'opacity-30',
        )}
        onContextMenu={handleContextMenu}
        onClick={() => {
          if (recordingAnim) {
            forceCloseRecording() // 点击输入框关闭弹框
          }
        }}
      >
        <div className="w-full flex items-center justify-between">
          {voiceMode ? (
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

        <VoiceInput
          ref={voiceInputRef}
          onConverted={handleVoiceConverted}
          onCancel={handleVoiceCancel} // 绑定取消回调
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