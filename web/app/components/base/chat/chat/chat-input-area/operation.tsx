import type { FC, Ref } from 'react'
import { memo, useCallback, useRef } from 'react'
import { RiMicLine, RiSendPlane2Fill } from '@remixicon/react'
import type { EnableType } from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import Button from '@/app/components/base/button'
import ActionButton from '@/app/components/base/action-button'
import { FileUploaderInChatInput } from '@/app/components/base/file-uploader'
import type { FileUpload } from '@/app/components/base/features/types'

// 适配原始props（移除多余参数，保留核心）
type OperationProps = {
  fileConfig?: FileUpload
  speechToTextConfig?: EnableType
  voiceMode: boolean
  toggleVoiceMode: () => void
  onMicLongPress: (isClick?: boolean, e?: React.MouseEvent | React.TouchEvent) => void
  onMicEnd: (e?: React.MouseEvent | React.TouchEvent) => void
  onSend: () => void // 原始发送函数
  theme?: Theme | null
  ref?: Ref<HTMLDivElement>
  isMobile?: boolean
  onButtonClick: () => void // 关闭键盘函数
  onShowVoiceInput?: () => void // 原始语音输入触发函数
}

const Operation: FC<OperationProps> = ({
  ref,
  fileConfig,
  speechToTextConfig,
  voiceMode,
  toggleVoiceMode,
  onMicLongPress,
  onMicEnd,
  onSend,
  theme,
  isMobile = false,
  onButtonClick,
  onShowVoiceInput // 原始语音输入函数
}) => {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const LONG_PRESS_DELAY = 300

  // 单击麦克风：适配原始逻辑 + 关闭键盘
  const handleMicClick = useCallback(() => {
    onButtonClick() // 点击立即关闭键盘
    if (isLongPressTriggered.current) {
      isLongPressTriggered.current = false
      return
    }
    // 优先调用原始语音输入函数
    if (onShowVoiceInput) {
      onShowVoiceInput()
    } else {
      toggleVoiceMode()
    }
  }, [toggleVoiceMode, isLongPressTriggered, onButtonClick, onShowVoiceInput])

  // 长按麦克风：保留优化逻辑
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    isLongPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      onMicLongPress(false, e)
    }, LONG_PRESS_DELAY)
  }, [onMicLongPress])

  const handleTouchEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    onMicEnd(e)
  }, [onMicEnd])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // 文件上传按钮点击：关闭键盘
  const handleFileUploadClick = useCallback(() => {
    onButtonClick() // 点击文件按钮关闭键盘
  }, [onButtonClick])

  return (
    <div 
      ref={ref} 
      className="flex items-center gap-1" 
      onContextMenu={handleContextMenu}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchCallout: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* 核心：文件上传按钮（还原原始逻辑 + 关闭键盘） */}
      {fileConfig?.enabled && (
        <FileUploaderInChatInput 
          fileConfig={fileConfig} 
          style={{ pointerEvents: 'auto' }}
          onClick={handleFileUploadClick} // 点击关闭键盘
        />
      )}

      {/* 麦克风按钮（适配原始逻辑） */}
      {speechToTextConfig?.enabled && (
        <ActionButton
          size="sm"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          onClick={handleMicClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          onContextMenu={handleContextMenu}
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
        >
          <RiMicLine className="w-4 h-4" />
        </ActionButton>
      )}

      {/* 发送按钮（还原原始逻辑 + 关闭键盘） */}
      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            onButtonClick() // 点击关闭键盘
            onSend() // 调用原始发送函数
          }}
          style={{
            backgroundColor: theme?.primaryColor || '#0071e3',
            pointerEvents: 'auto',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
        >
          <RiSendPlane2Fill className="w-4 h-4 text-white" />
        </Button>
      )}
    </div>
  )
}

Operation.displayName = 'Operation'
export default memo(Operation)