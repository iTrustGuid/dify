import type { FC, Ref } from 'react'
import { memo } from 'react'
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
  onMicLongPress: (isClick?: boolean) => void
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
  onMicEnd,
  onSend,
  theme,
}) => {
  return (
    <div ref={ref} className="flex items-center gap-1">
      {/* 文件按钮：完全原生，不拦截 */}
      {fileConfig?.enabled && (
        <FileUploaderInChatInput fileConfig={fileConfig} />
      )}

      {/* 麦克风：点击切换，长按录音，小程序H5完美兼容 */}
      {speechToTextConfig?.enabled && (
        <ActionButton
          size="sm"
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          onClick={toggleVoiceMode}
          onMouseDown={(e) => e.button === 0 && onMicEnd()}
          onTouchStart={onMicEnd}
        >
          <RiMicLine className="w-4 h-4" />
        </ActionButton>
      )}

      {/* 发送按钮：原生点击 */}
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