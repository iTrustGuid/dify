import { useCallback, useEffect, useRef, useState } from 'react'
import Textarea from 'react-textarea-autosize'
import { useTranslation } from 'react-i18next'
import { decode } from 'html-entities'
import type { EnableType, OnSend } from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import type { InputForm } from '../type'
import { useCheckInputsForms } from '../check-input-forms-hooks'
import { useTextAreaHeight } from './hooks'
import Operation from './operation'
import cn from '@/utils/classnames'
import { FileListInChatInput } from '@/app/components/base/file-uploader'
import { useFile } from '@/app/components/base/file-uploader/hooks'
import { FileContextProvider, useFileStore } from '@/app/components/base/file-uploader/store'
import { useToastContext } from '@/app/components/base/toast'
import FeatureBar from '@/app/components/base/features/new-feature-panel/feature-bar'
import type { FileUpload } from '@/app/components/base/features/types'
import { TransferMethod } from '@/types/app'

// WebView兼容：提前挂载SpeechRecognition到window
const setupSpeechRecognition = () => {
  if (typeof window !== 'undefined') {
    const webkitSpeechRecognition = (window as any).webkitSpeechRecognition;
    const SpeechRecognition = window.SpeechRecognition || webkitSpeechRecognition;
    (window as any).SpeechRecognition = SpeechRecognition;
    return SpeechRecognition;
  }
  return null;
};

const SpeechRecognition = setupSpeechRecognition();

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
  const historyRef = useRef([''])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const isComposingRef = useRef(false)

  // 语音识别相关状态
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastResultTimeRef = useRef<number>(Date.now())
  const retryCountRef = useRef(0) // 重试计数器
  const MAX_RETRY = 2; // 最大重试次数

  // ========== 第一步：声明所有基础函数（按依赖顺序，先声明被依赖的） ==========
  // 1. 最基础的handleQueryChange（无外部依赖，仅依赖handleTextareaResize）
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      setTimeout(handleTextareaResize, 0)
    },
    [handleTextareaResize],
  )

  // 2. 网络/权限检查函数
  const checkNetworkStatus = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      notify({ 
        type: 'warning', 
        message: t('common.voiceInput.networkOff', { 
          defaultValue: '当前网络已断开，请连接网络后使用语音输入' 
        }) 
      });
      return false;
    }
    return true;
  }, [t, notify]);

  const checkMicPermission = useCallback(async () => {
    try {
      if (!navigator.permissions) {
        console.warn('当前环境不支持权限查询，跳过检查');
        return true;
      }
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permission.state === 'denied') {
        notify({ 
          type: 'error', 
          message: t('common.voiceInput.micDenied', { 
            defaultValue: '麦克风权限被拒绝，请在系统设置中开启' 
          }) 
        });
        return false;
      }
      return true;
    } catch (err) {
      console.warn('检查麦克风权限失败:', err);
      return true;
    }
  }, [t, notify]);

  // 3. 核心控制函数（无外部依赖）
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (err) {
        console.warn('停止语音识别失败:', err);
      }
      recognitionRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    retryCountRef.current = 0;
    setIsListening(false)
  }, [])

  // 4. 计时器函数（依赖已声明的stopListening）
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      if (Date.now() - lastResultTimeRef.current >= 5000) {
        stopListening()
      }
    }, 5000)
  }, [stopListening])

  // 5. 重试函数（依赖已声明的stopListening）
  const restartListening = useCallback(() => {
    if (retryCountRef.current < MAX_RETRY) {
      retryCountRef.current += 1;
      console.log(`语音识别重试 ${retryCountRef.current}/${MAX_RETRY}`);
      setTimeout(() => {
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch (err) {
            console.error('重试启动识别失败:', err);
            stopListening();
            notify({ 
              type: 'error', 
              message: t('common.voiceInput.networkRetryFailed', { 
                defaultValue: '多次尝试连接语音服务失败，请稍后再试' 
              }) 
            });
          }
        }
      }, 1000 * retryCountRef.current);
    } else {
      stopListening();
      notify({ 
        type: 'error', 
        message: t('common.voiceInput.networkRetryFailed', { 
          defaultValue: '多次尝试连接语音服务失败，请稍后再试' 
        }) 
      });
    }
  }, [isListening, stopListening, notify, t]);

  // 6. 启动函数（依赖前面所有已声明的函数）
  const startListening = useCallback(async () => {
    if (!checkNetworkStatus()) return;
    if (!(await checkMicPermission())) return;

    if (!SpeechRecognition) {
      notify({ 
        type: 'error', 
        message: t('common.voiceInput.notSupport', { 
          defaultValue: '当前浏览器/设备不支持语音识别，请更换环境重试' 
        }) 
      });
      return;
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'zh-CN'
      recognition.maxAlternatives = 1;

      // 实时识别结果处理
      recognition.onresult = (event) => {
        lastResultTimeRef.current = Date.now()
        resetSilenceTimer()
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('')
        handleQueryChange(transcript) // handleQueryChange已声明
      }

      // 增强错误处理
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        
        const errorMessages = {
          'network': t('common.voiceInput.networkError', { 
            defaultValue: '网络异常，无法连接语音识别服务' 
          }),
          'not-allowed': t('common.voiceInput.micDenied', { 
            defaultValue: '麦克风权限被拒绝，请开启权限后重试' 
          }),
          'no-speech': '',
          'aborted': '',
          'audio-capture': t('common.voiceInput.micError', { 
            defaultValue: '无法访问麦克风，请检查设备连接' 
          }),
          'default': t('common.voiceInput.error', { 
            defaultValue: '语音识别出错，请重试' 
          })
        };

        const errorMsg = errorMessages[event.error as keyof typeof errorMessages] || errorMessages.default;
        
        if (event.error === 'network') {
          restartListening(); // restartListening已声明
        } else if (errorMsg) {
          notify({ type: 'error', message: errorMsg });
          stopListening(); // stopListening已声明
        }
      }

      recognition.onend = () => {
        if (isListening) {
          recognition.start();
        }
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
      lastResultTimeRef.current = Date.now()
      resetSilenceTimer()
    } catch (err) {
      console.error('启动语音识别失败:', err)
      notify({ 
        type: 'error', 
        message: t('common.voiceInput.startFailed', { 
          defaultValue: '无法启动语音识别，请检查麦克风权限或网络' 
        }) 
      });
      stopListening();
    }
  }, [checkNetworkStatus, checkMicPermission, t, notify, handleQueryChange, resetSilenceTimer, isListening, stopListening, restartListening])

  // ========== 第二步：声明其他业务函数 ==========
  const handleOnMessage = (event: any) => {
    console.log('event.data.message', event.data.message)
    if (event.data.type === 'dify-chatbot-append-message') {
      const message = event.data.message as string
      setQuery(message)
      historyRef.current.push(message)
      setCurrentIndex(historyRef.current.length)
      if (onSend) {
        onSend(message)
        setQuery('')
      }
    }
  }

  const configChangeHandler = (event: MessageEvent) => {
    const windowAny = window as any;
    if (event.data && event.data.type === 'dify-chatbot-config-change') {
      console.log('configChangeHandler', event)
      const newConfig = event.data.difyChatbotConfig;
      windowAny.difyChatbotConfig = newConfig;
    }
  }

  useEffect(() => {
    const windowAny = window as any;
    windowAny.removeEventListener('message', handleOnMessage)
    windowAny.addEventListener('message', handleOnMessage)

    windowAny.removeEventListener('message', configChangeHandler);
    windowAny.addEventListener('message', configChangeHandler);
  }, [])

  const handleSend = () => {
    if (isResponding) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForResponse') })
      return
    }

    if (onSend) {
      const { files, setFiles } = filesStore.getState()
      if (files.find(item => item.transferMethod === TransferMethod.local_file && !item.uploadedId)) {
        notify({ type: 'info', message: t('appDebug.errorMessage.waitForFileUpload') })
        return
      }
      if (!query || !query.trim()) {
        notify({ type: 'info', message: t('appAnnotation.errorMessage.queryRequired') })
        return
      }
      if (checkInputsForm(inputs, inputsForm)) {
        onSend(query, files)
        handleQueryChange('')
        setFiles([])
      }
    }
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isComposingRef.current = false
    }, 50)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (isComposingRef.current) return
      e.preventDefault()
      setQuery(query.replace(/\n$/, ''))
      historyRef.current.push(query)
      setCurrentIndex(historyRef.current.length)
      handleSend()
    }
    else if (e.key === 'ArrowUp' && !e.shiftKey && !e.nativeEvent.isComposing && e.metaKey) {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
        handleQueryChange(historyRef.current[currentIndex - 1])
      }
    }
    else if (e.key === 'ArrowDown' && !e.shiftKey && !e.nativeEvent.isComposing && e.metaKey) {
      if (currentIndex < historyRef.current.length - 1) {
        setCurrentIndex(currentIndex + 1)
        handleQueryChange(historyRef.current[currentIndex + 1])
      }
      else if (currentIndex === historyRef.current.length - 1) {
        setCurrentIndex(historyRef.current.length)
        handleQueryChange('')
      }
    }
  }

  // 切换语音识别状态
  const toggleListening = useCallback(async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopListening()
    }
  }, [stopListening])

  // ========== 渲染部分 ==========
  const operation = (
    <Operation
      ref={holdSpaceRef}
      fileConfig={visionConfig}
      speechToTextConfig={speechToTextConfig}
      onToggleListening={toggleListening}
      isListening={isListening}
      onSend={handleSend}
      theme={theme}
    />
  )

  return (
    <>
      <div
        className={cn(
          'relative z-10 overflow-hidden rounded-xl border border-components-chat-input-border bg-components-panel-bg-blur pb-[9px] shadow-md',
          isDragActive && 'border border-dashed border-components-option-card-option-selected-border',
          disabled && 'pointer-events-none border-components-panel-border opacity-50 shadow-none',
        )}
      >
        <div className='relative max-h-[158px] overflow-y-auto overflow-x-hidden px-[9px] pt-[9px]'>
          <FileListInChatInput fileConfig={visionConfig!} />
          <div ref={wrapperRef} className='flex items-center justify-between'>
            <div className='relative flex w-full grow items-center'>
              <div
                ref={textValueRef}
                className='body-lg-regular pointer-events-none invisible absolute h-auto w-auto whitespace-pre p-1 leading-6'
              >
                {query}
              </div>
              <Textarea
                ref={ref => textareaRef.current = ref as any}
                className={cn('body-lg-regular w-full resize-none bg-transparent p-1 leading-6 text-text-primary outline-none')}
                placeholder={decode(t('common.chat.inputPlaceholder', { botName }) || '')}
                autoFocus
                minRows={1}
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
              />
            </div>
            {!isMultipleLine && operation}
          </div>
        </div>
        {isMultipleLine && <div className='px-[9px]'>{operation}</div>}
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