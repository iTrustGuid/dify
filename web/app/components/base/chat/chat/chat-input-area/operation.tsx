import type { FC, Ref } from 'react'
import { memo } from 'react'
import { RiMicLine, RiSendPlane2Fill } from '@remixicon/react'
import type { EnableType } from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import Button from '@/app/components/base/button'
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
            // 替换为原生 button，彻底避免组件样式干扰
            <button
              onClick={onToggleVoiceInput}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border-none outline-none transition-colors',
                isRecording
                  ? 'bg-[#D1FAE5] text-[#10B981]' // 浅绿色背景 + 深绿色图标
                  : 'bg-transparent text-gray-500'    // 默认灰色
              )}
              style={{
                // 兜底样式，确保 100% 生效
                backgroundColor: isRecording ? '#D1FAE5' : 'transparent',
                color: isRecording ? '#10B981' : '#6b7280',
                border: 'none',
                outline: 'none',
              }}
            >
              <RiMicLine className='h-5 w-5' />
            </button>
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