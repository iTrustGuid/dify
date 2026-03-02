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
  ref?: Ref<HTMLDivElement>
  isMobile?: boolean
  onButtonClick: (e?: React.MouseEvent | React.TouchEvent) => void
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

  // 修复：只阻止冒泡，不阻止默认行为
  const handleMicClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation() // 只阻止冒泡
    onButtonClick(e)
    
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

  // 修复：长按只阻止冒泡
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation()
    onButtonClick(e)
    
    isLongPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      onMicLongPress(false, e)
    }, LONG_PRESS_DELAY)
  }, [onMicLongPress, onButtonClick])

  const handleTouchEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation()
    
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

  // 修复：文件上传只阻止冒泡
  const handleFileUploadClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onButtonClick(e)
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
      {fileConfig?.enabled && (
        <FileUploaderInChatInput 
          fileConfig={fileConfig} 
          style={{ pointerEvents: 'auto' }}
          onClick={handleFileUploadClick}
        />
      )}

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

      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation() // 只阻止冒泡
            onButtonClick(e)
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

Operation.displayName = 'Operation'
export default memo(Operation)