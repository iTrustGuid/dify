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
  onButtonClick: () => void // 新增：接收关闭键盘函数
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
  onButtonClick // 新增
}) => {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPressTriggered = useRef(false)
  const LONG_PRESS_DELAY = 300

  // 单击麦克风：关闭键盘 + 切换模式
  const handleMicClick = useCallback(() => {
    onButtonClick() // 关闭键盘
    if (isLongPressTriggered.current) {
      isLongPressTriggered.current = false
      return
    }
    toggleVoiceMode()
  }, [toggleVoiceMode, isLongPressTriggered, onButtonClick])

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
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // 新增：文件上传按钮点击关闭键盘
  const handleFileUploadClick = useCallback(() => {
    onButtonClick()
  }, [onButtonClick])

  return (
    <div 
      ref={ref} 
      className="flex items-center gap-1" 
      onContextMenu={handleContextMenu}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none', // 修复属性名
        touchCallout: 'none',
        WebkitTouchCallout: 'none' // 修复属性名
      }}
    >
      {/* 文件按钮：点击关闭键盘 */}
      {fileConfig?.enabled && (
        <FileUploaderInChatInput 
          fileConfig={fileConfig} 
          style={{ pointerEvents: 'auto' }}
          onClick={handleFileUploadClick} // 关闭键盘
        />
      )}

      {/* 麦克风：点击关闭键盘 */}
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
            WebkitUserSelect: 'none' // 修复属性名
          }}
        >
          <RiMicLine className="w-4 h-4" />
        </ActionButton>
      )}

      {/* 发送按钮：点击关闭键盘（已在父组件处理，这里兜底） */}
      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            onButtonClick() // 兜底关闭键盘
            onSend()
          }}
          style={{
            backgroundColor: theme?.primaryColor || '#0071e3',
            pointerEvents: 'auto',
            userSelect: 'none',
            WebkitUserSelect: 'none' // 修复属性名
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