// operation.tsx
import type { FC, Ref } from 'react'
import { memo, forwardRef } from 'react' // 新增 forwardRef
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
}

// 使用 forwardRef 处理 ref 传递（关键修复）
const Operation: FC<OperationProps> = forwardRef(({
  fileConfig,
  speechToTextConfig,
  isRecording,
  onToggleVoiceInput,
  onSend,
  onFileUploadClick,
  theme,
}, ref) => { // ref 通过 forwardRef 接收
  const handleButtonClick = (e: React.MouseEvent, callback?: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    callback?.()
  }

  return (
    <div className='flex shrink-0 items-center justify-end'>
      <div className='flex items-center pl-1' ref={ref}>
        <div className='flex items-center space-x-1'>
          {fileConfig?.enabled && (
            <div onClick={(e) => handleButtonClick(e, onFileUploadClick)}>
              <FileUploaderInChatInput fileConfig={fileConfig} />
            </div>
          )}
          {speechToTextConfig?.enabled && (
            <ActionButton
              size='l'
              onClick={(e) => handleButtonClick(e, onToggleVoiceInput)}
              className={cn(
                'hover:bg-transparent hover:text-inherit focus:bg-transparent focus:text-inherit active:bg-transparent active:text-inherit',
                isRecording ? 'text-[#10B981]' : 'text-gray-500 bg-transparent',
                isRecording && '!bg-[#D1FAE5]'
              )}
              style={{
                backgroundColor: isRecording ? '#D1FAE5' : 'transparent',
                color: isRecording ? '#10B981' : '#6b7280',
                pointerEvents: 'auto',
                userSelect: 'none',
                border: 'none',
                outline: 'none',
              }}
            >
              <RiMicLine 
                className='h-5 w-5'
                style={{ color: 'inherit' }}
              />
            </ActionButton>
          )}
        </div>
        <Button
          className='ml-3 w-8 px-0'
          variant='primary'
          onClick={(e) => handleButtonClick(e, onSend)}
          style={theme ? { backgroundColor: theme.primaryColor } : {}}
        >
          <RiSendPlane2Fill className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
})

Operation.displayName = 'Operation'
export default memo(Operation) // 默认导出