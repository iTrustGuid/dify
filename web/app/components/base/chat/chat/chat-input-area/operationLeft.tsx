import type { Ref } from 'react'
import { memo, forwardRef, useCallback } from 'react'
import {
  RiMicLine,
  RiSendPlane2Fill,
  RiAttachmentLine,
} from '@remixicon/react'
import type { EnableType } from '../../types'
import type { Theme } from '../../embedded-chatbot/theme/theme-context'
import ActionButton from '@/app/components/base/action-button'
import FileInput from '@/app/components/base/file-uploader/file-input'
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

const OperationLeft = forwardRef(({
  fileConfig,
  speechToTextConfig,
  isRecording,
  onToggleVoiceInput,
  onSend,
  onFileUploadClick,
  theme,
}: OperationProps, ref: Ref<HTMLDivElement>) => {

  // 🔥 核心：保留 mousedown 防止丢焦点
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return (
    <div className='flex shrink-0 items-center justify-end'>
      <div className='flex items-center pl-1' ref={ref}>
        <div className='flex items-center space-x-1'>
          {fileConfig?.enabled && (
            <div
              className='relative cursor-pointer'
              onMouseDown={handleMouseDown}
            >
              <ActionButton size='l'>
                <RiAttachmentLine className='h-5 w-5' />
              </ActionButton>

              {/* 🔥 最关键：把 FileInput 盖在按钮上层，透明可点 */}
              <div className='absolute inset-0 opacity-0'>
                <FileInput fileConfig={fileConfig} />
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
})

OperationLeft.displayName = 'OperationLeft'

export default memo(OperationLeft)