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
}) => {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const LONG_PRESS_DELAY = 300

  // 单击：只切换模式，不触发长按
  const handleMicClick = useCallback(() => {
    if (isLongPressTriggered.current) {
      isLongPressTriggered.current = false
      return
    }
    toggleVoiceMode()
  }, [toggleVoiceMode])

  // 长按开始：只记录，不立即触发
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    isLongPressTriggered.current = false
    // 启动长按计时器
    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true
      onMicLongPress(false, e) // 真正长按才触发弹框
    }, LONG_PRESS_DELAY)
  }, [onMicLongPress])

  // 长按结束：必须执行，不管任何条件
  const handleTouchEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // 清空计时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    // 执行结束逻辑
    onMicEnd(e)
  }, [onMicEnd])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [isMobile])

  return (
    <div ref={ref} className="flex items-center gap-1" onContextMenu={handleContextMenu}>
      {fileConfig?.enabled && (
        <FileUploaderInChatInput
          fileConfig={fileConfig}
          style={{ pointerEvents: 'auto' }}
        />
      )}

      {speechToTextConfig?.enabled && (
        <ActionButton
          size="sm"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          onClick={handleMicClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd} // 新增：触摸取消时也执行
          onTouchMove={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onMouseLeave={handleTouchEnd}
          onContextMenu={handleContextMenu}
        >
          <RiMicLine className="w-4 h-4" />
        </ActionButton>
      )}

      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            onSend()
          }}
          style={{
            backgroundColor: theme?.primaryColor || '#0071e3',
            pointerEvents: 'auto',
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