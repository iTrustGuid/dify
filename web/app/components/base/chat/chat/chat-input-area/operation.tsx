import type { FC, Ref } from 'react'
import { memo } from 'react'
import { RiMicLine, RiSendPlane2Fill } from '@remixicon/react'
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
  isRecording: boolean
  onToggleVoiceInput?: () => void
  onSend: () => void
  onFileUploadClick?: () => void
  theme?: Theme | null
  ref?: Ref<HTMLDivElement>
}

const Operation: FC<OperationProps> = ({
  ref,
  fileConfig,
  speechToTextConfig,
  isRecording,
  onToggleVoiceInput,
  onSend,
  onFileUploadClick,
  theme,
}) => {
  return (
    <div className='flex shrink-0 items-center justify-end'>
      <div className='flex items-center pl-1' ref={ref}>
        <div className='flex items-center space-x-1'>
          {fileConfig?.enabled && (
            <div onClick={onFileUploadClick}>
              <FileUploaderInChatInput fileConfig={fileConfig} />
            </div>
          )}
          {speechToTextConfig?.enabled && (
            <ActionButton
              size='l'
              onClick={onToggleVoiceInput}
              // 重构样式类名，使用更兼容的写法并禁用悬浮效果
              className={cn(
                'hover:bg-transparent hover:text-inherit focus:bg-transparent focus:text-inherit active:bg-transparent active:text-inherit',
                isRecording
                  ? 'text-[#10B981]'
                  : 'text-gray-500 bg-transparent',
                // 强制设置背景色，提高优先级
                isRecording && '!bg-[#D1FAE5]'
              )}
              // 内联样式兜底，确保小程序环境生效
              style={{
                backgroundColor: isRecording ? '#D1FAE5' : 'transparent',
                color: isRecording ? '#10B981' : '#6b7280',
                // 禁用所有交互样式
                pointerEvents: 'auto',
                userSelect: 'none',
                // 强制覆盖默认样式
                border: 'none',
                outline: 'none',
              }}
            >
              <RiMicLine 
                className='h-5 w-5'
                style={{
                  // 确保图标颜色继承
                  color: 'inherit'
                }}
              />
            </ActionButton>
          )}
        </div>
        <Button
          className='ml-3 w-8 px-0'
          variant='primary'
          onClick={onSend}
          style={theme ? { backgroundColor: theme.primaryColor } : {}}
        >
          <RiSendPlane2Fill className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
}

Operation.displayName = 'Operation'
export default memo(Operation)