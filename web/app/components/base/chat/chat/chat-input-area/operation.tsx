import type { FC, Ref } from 'react'
import { memo, useCallback } from 'react'
import {
  RiMicLine,
  RiSendPlane2Fill,
} from '@remixicon/react'
import type { EnableType } from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import Button from '@/app/components/base/button'
import ActionButton from '@/app/components/base/action-button'
import { FileUploaderInChatInput } from '@/app/components/base/file-uploader'
import type { FileUpload } from '@/app/components/base/features/types'
import cn from '@/utils/classnames'

type OperationProps = {
  fileConfig?: FileUpload
  speechToTextConfig?: EnableType
  voiceMode: boolean
  toggleVoiceMode: () => void
  onMicLongPress: () => void
  onMicEnd: () => void
  onSend: () => void
  theme?: Theme | null
  ref?: Ref<HTMLDivElement>
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
}) => {
  // 单击切换模式，长按只录音
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    toggleVoiceMode()
  }, [toggleVoiceMode])

  return (
    <div ref={ref} className="flex items-center gap-1">
      {/* 文件图标 */}
      {fileConfig?.enabled && <FileUploaderInChatInput fileConfig={fileConfig} />}

      {/* 麦克风按钮：始终显示 */}
      {speechToTextConfig?.enabled && (
        <ActionButton
          size="sm"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          onClick={handleClick}
          onMouseDown={onMicLongPress}
          onMouseUp={onMicEnd}
          onMouseLeave={onMicEnd}
          onTouchStart={onMicLongPress}
          onTouchEnd={onMicEnd}
          onTouchCancel={onMicEnd}
        >
          <RiMicLine className="w-4 h-4" />
        </ActionButton>
      )}

      {/* 发送按钮：仅默认模式显示，语音模式彻底隐藏 */}
      {!voiceMode && (
        <Button
          className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center p-0 border-none"
          variant="primary"
          onClick={onSend}
          style={theme ? { backgroundColor: theme.primaryColor } : {}}
        >
          <RiSendPlane2Fill className="w-4 h-4 text-white" />
        </Button>
      )}
    </div>
  )
}

Operation.displayName = 'Operation'
export default memo(Operation)