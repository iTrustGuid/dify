import type { FC, Ref } from 'react'
import { memo } from 'react'
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
              className={cn(
                // 统一样式：只有录音中/默认两种状态
                isRecording 
                  ? 'text-[#10B981] bg-green-100 hover:bg-green-200' 
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <RiMicLine className='h-5 w-5' />
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