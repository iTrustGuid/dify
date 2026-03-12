import type { FC, Ref } from 'react'
import { memo, useCallback, useRef } from 'react'
import { RiMicLine, RiSendPlane2Fill } from '@remixicon/react'
import type { EnableType } from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import Button from '@/app/components/base/button'
import ActionButton from '@/app/components/base/action-button'
import { FileUploaderInChatInput } from '@/app/components/base/file-uploader'
import type { FileUpload } from '@/app/components/base/features/types'

type OperationProps = {
  fileConfig?: FileUpload
  speechToTextConfig?: EnableType
  voiceMode: boolean
  toggleVoiceMode: () => void
  onMicLongPress: (isClick?: boolean, e?: React.MouseEvent | React.TouchEvent) => void
  onMicEnd: (e?: React.MouseEvent | React.TouchEvent) => void
  onSend: () => void
  theme?: Theme | null
  isMobile?: boolean
  onButtonClick: () => void
  onShowVoiceInput?: () => void
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
  onShowVoiceInput
}) => {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const LONG_PRESS_DELAY = 300
  const micPressStartY = useRef<number>(0)

  // 单击麦克风
  const handleMicClick = useCallback((e: React.MouseEvent) => {
    // 阻止事件冒泡到父级
    e.stopPropagation()
    onButtonClick()
    if (isLongPressTriggered.current) {
      isLongPressTriggered.current = false
      return
    }
    if (onShowVoiceInput) {
      onShowVoiceInput()
    } else {
      toggleVoiceMode()
    }
  }, [toggleVoiceMode, isLongPressTriggered, onButtonClick, onShowVoiceInput])

  // 长按麦克风开始
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // 阻止事件冒泡
    e.stopPropagation()
    if ('touches' in e && e.touches.length > 0) {
      micPressStartY.current = e.touches[0].clientY
    } else if ('clientY' in e) {
      micPressStartY.current = e.clientY
    }

    isLongPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      onMicLongPress(false, e)
    }, LONG_PRESS_DELAY)
  }, [onMicLongPress])

  // 长按麦克风结束
  const handleTouchEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // 阻止事件冒泡
    e.stopPropagation()
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    
    if (e && 'relatedTarget' in e && e.relatedTarget) {
      const target = e.target as HTMLElement
      const relatedTarget = e.relatedTarget as HTMLElement
      if (target.closest('.action-button') || relatedTarget.closest('.action-button')) {
        return
      }
    }
    
    onMicEnd(e)
  }, [onMicEnd])

  // 滑动处理
  const handleTouchMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // 阻止事件冒泡
    e.stopPropagation()
    if (!isLongPressTriggered.current) return
    
    let currentY = 0
    if ('touches' in e && e.touches.length > 0) {
      currentY = e.touches[0].clientY
    } else if ('clientY' in e) {
      currentY = e.clientY
    }
    
    const offsetY = micPressStartY.current - currentY
    if (Math.abs(offsetY) > 50) {
      handleTouchEnd(e)
    }
  }, [isLongPressTriggered, handleTouchEnd])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // 文件上传按钮点击
  const handleFileUploadClick = useCallback((e: React.MouseEvent) => {
    // 阻止事件冒泡
    e.stopPropagation()
    onButtonClick()
  }, [onButtonClick])

  return (
    <div 
      ref={ref as Ref<HTMLDivElement>} 
      className="flex items-center gap-1" 
      onContextMenu={handleContextMenu}
      onClick={(e) => e.stopPropagation()} // 阻止点击冒泡
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchCallout: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* 文件上传按钮 */}
      {fileConfig?.enabled && (
        <FileUploaderInChatInput 
          fileConfig={fileConfig} 
          style={{ pointerEvents: 'auto' }}
          onClick={handleFileUploadClick}
        />
      )}

      {/* 麦克风按钮 */}
      {speechToTextConfig?.enabled && (
        <ActionButton
          size="sm"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 action-button"
          onClick={handleMicClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onTouchMove={handleTouchMove}
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

      {/* 发送按钮 */}
      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            onButtonClick()
            onSend()
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

export default memo(Operation)