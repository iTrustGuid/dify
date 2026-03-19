import type { FC, Ref } from 'react'
import { memo, forwardRef } from 'react'
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

// 使用forwardRef处理ref传递
const Operation = forwardRef(({
  fileConfig,
  speechToTextConfig,
  isRecording,
  onToggleVoiceInput,
  onSend,
  onFileUploadClick,
  theme,
}: OperationProps, ref: Ref<HTMLDivElement>) => {
  // 🔥 核心修改：用mousedown代替click，阻止默认行为避免抢焦点
  const handleMouseDown = (e: React.MouseEvent, callback?: () => void) => {
    // 阻止默认行为（关键：避免按钮抢走输入框焦点）
    e.preventDefault()
    // 阻止事件冒泡
    e.stopPropagation()
    callback?.()
  }

  return (
    <div className='flex shrink-0 items-center justify-end'>
      <div className='flex items-center pl-1' ref={ref}>
        <div className='flex items-center space-x-1'>
          {/* 文件上传按钮：仅执行回调，关闭语音但不干扰焦点 */}
          {fileConfig?.enabled && (
            <div onMouseDown={(e) => handleMouseDown(e, onFileUploadClick)}>
              <FileUploaderInChatInput fileConfig={fileConfig} />
            </div>
          )}
          
          {/* 麦克风按钮：根据isRecording状态显示不同样式 */}
          {speechToTextConfig?.enabled && (
            <ActionButton
              size='l'
              // 🔥 改用onMouseDown
              onMouseDown={(e) => handleMouseDown(e, onToggleVoiceInput)}
              className={cn(
                'hover:bg-transparent hover:text-inherit focus:bg-transparent focus:text-inherit active:bg-transparent active:text-inherit',
                isRecording ? 'text-[#10B981]' : 'text-gray-500 bg-transparent',
                isRecording && '!bg-[#D1FAE5]'
              )}
              style={{
                backgroundColor: isRecording ? '#D1FAE5' : 'transparent',
                color: isRecording ? '#10B981' : '#6b7280',
                border: 'none',
                outline: 'none',
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
              // 🔥 禁止按钮获得焦点，避免干扰输入框
              tabIndex={-1}
              // 禁用原生焦点样式
              style={{
                ...(theme?.primaryColor ? { '--primary-color': theme.primaryColor } : {}),
                outline: 'none',
                boxShadow: 'none',
              }}
            >
              <RiMicLine className='h-5 w-5' style={{ color: 'inherit' }} />
            </ActionButton>
          )}
        </div>
        
        {/* 发送按钮：仅执行回调（内部处理失焦） */}
        <Button
          className='ml-3 w-8 px-0'
          variant='primary'
          // 🔥 改用onMouseDown
          onMouseDown={(e) => handleMouseDown(e, onSend)}
          style={theme ? { 
            backgroundColor: theme.primaryColor,
            outline: 'none',
            boxShadow: 'none'
          } : {}}
          // 🔥 禁止按钮获得焦点
          tabIndex={-1}
        >
          <RiSendPlane2Fill className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
})

Operation.displayName = 'Operation'
export default memo(Operation)