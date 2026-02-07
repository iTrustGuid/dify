import type { FC, Ref } from 'react'
import { memo, useCallback } from 'react'
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
  isMobile?: boolean // 接收H5标识
}

const Operation: FC<OperationProps> = ({
  ref,
  fileConfig,
  speechToTextConfig,
  voiceMode,
  toggleVoiceMode,
  onMicEnd,
  onSend,
  theme,
  isMobile = false,
}) => {
  // H5环境下的点击处理：避免事件阻止导致点击失效
  const handleMicClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile) {
      e.stopPropagation() // 只阻止冒泡，不阻止默认行为
    }
    toggleVoiceMode()
  }, [isMobile, toggleVoiceMode])

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isMobile) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [isMobile])

  return (
    <div ref={ref} className="flex items-center gap-1" onContextMenu={handleContextMenu}>
      {/* 文件按钮：H5兼容 - 不阻止任何事件 */}
      {fileConfig?.enabled && (
        <FileUploaderInChatInput 
          fileConfig={fileConfig} 
          style={{ pointerEvents: 'auto' }} // 确保H5下可点击
        />
      )}

      {/* 麦克风：H5兼容 - 区分点击和长按 */}
      {speechToTextConfig?.enabled && (
        <ActionButton
          size="sm"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          onClick={handleMicClick}
          onContextMenu={handleContextMenu}
          onTouchStart={(e) => {
            // H5下长按才触发录音，点击只切换模式
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            if (e.button === 0) {
              onMicEnd(e)
            }
          }}
        >
          <RiMicLine className="w-4 h-4" />
        </ActionButton>
      )}

      {/* 发送按钮：H5兼容 - 确保点击生效 */}
      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            onSend()
          }}
          onContextMenu={handleContextMenu}
          style={{ 
            backgroundColor: theme?.primaryColor || '#0071e3',
            pointerEvents: 'auto' // 强制启用点击
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