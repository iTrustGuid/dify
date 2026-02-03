'use client'

import React, { useMemo, useState } from 'react'
import {
  useRouter,
  useSearchParams,
} from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { CreateFromDSLModalTab } from '@/app/components/app/create-from-dsl-modal'
import { useProviderContext } from '@/context/provider-context'
import { FileArrow01, FilePlus01, FilePlus02 } from '@/app/components/base/icons/src/vender/line/files'
import cn from '@/utils/classnames'
import dynamic from 'next/dynamic'

const CreateAppModal = dynamic(() => import('@/app/components/app/create-app-modal'), {
  ssr: false,
})
const CreateAppTemplateDialog = dynamic(() => import('@/app/components/app/create-app-dialog'), {
  ssr: false,
})
const CreateFromDSLModal = dynamic(() => import('@/app/components/app/create-from-dsl-modal'), {
  ssr: false,
})

export type CreateAppCardProps = {
  className?: string
  onSuccess?: () => void
  ref: React.RefObject<HTMLDivElement | null>
  selectedAppType?: string
}

const CreateAppCard = ({
  ref,
  className,
  onSuccess,
  selectedAppType,
}: CreateAppCardProps) => {
  const { t } = useTranslation()
  const { onPlanInfoChanged } = useProviderContext()
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const dslUrl = searchParams.get('remoteInstallUrl') || undefined

  const [showNewAppTemplateDialog, setShowNewAppTemplateDialog] = useState(false)
  const [showNewAppModal, setShowNewAppModal] = useState(false)
  const [showCreateFromDSLModal, setShowCreateFromDSLModal] = useState(!!dslUrl)

  const activeTab = useMemo(() => {
    if (dslUrl)
      return CreateFromDSLModalTab.FROM_URL

    return undefined
  }, [dslUrl])

  return (
    <div
      ref={ref}
      className={cn('relative col-span-1 inline-flex flex-col justify-between rounded-xl', className)}
    >
      <div className='grow'>
        {/* 使用 Flexbox 实现水平布局 */}
        <div className='flex space-x-2 items-center'>
          <button 
            type="button" 
            className='flex cursor-pointer items-center rounded-lg px-4 py-[7px] text-[13px] font-medium leading-[18px] text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary' 
            onClick={() => setShowNewAppModal(true)}
            style={{
              borderRadius: '4px 4px 4px 4px',
              background: '#FFFFFF',
              color: '#000000'
            }}
          >
            <FilePlus01 className='mr-2 h-4 w-4 shrink-0' />
            {t('app.newApp.startFromBlank')}
          </button>
          <button 
            type="button" 
            className='flex cursor-pointer items-center rounded-lg px-4 py-[7px] text-[13px] font-medium leading-[18px] text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary' 
            onClick={() => setShowNewAppTemplateDialog(true)}
            style={{
              borderRadius: '4px 4px 4px 4px',
              background: '#FFFFFF',
              color: '#000000'
            }}
          >
            <FilePlus02 className='mr-2 h-4 w-4 shrink-0' />
            {t('app.newApp.startFromTemplate')}
          </button>
          <button 
            type="button" 
            onClick={() => setShowCreateFromDSLModal(true)}
            className='flex cursor-pointer items-center rounded-lg px-4 py-[7px] text-[13px] font-medium leading-[18px] text-text-tertiary hover:bg-state-base-hover hover:text-text-secondary'
            style={{
              borderRadius: '4px 4px 4px 4px',
              background: '#FFFFFF',
              color: '#000000'
            }}
          >
            <FileArrow01 className='mr-2 h-4 w-4 shrink-0' />
            {t('app.importDSL')}
          </button>
        </div>
      </div>

      {showNewAppModal && (
        <CreateAppModal
          show={showNewAppModal}
          onClose={() => setShowNewAppModal(false)}
          onSuccess={() => {
            onPlanInfoChanged()
            if (onSuccess)
              onSuccess()
          }}
          onCreateFromTemplate={() => {
            setShowNewAppTemplateDialog(true)
            setShowNewAppModal(false)
          }}
          defaultAppMode={selectedAppType !== 'all' ? selectedAppType as any : undefined}
        />
      )}
      {showNewAppTemplateDialog && (
        <CreateAppTemplateDialog
          show={showNewAppTemplateDialog}
          onClose={() => setShowNewAppTemplateDialog(false)}
          onSuccess={() => {
            onPlanInfoChanged()
            if (onSuccess)
              onSuccess()
          }}
          onCreateFromBlank={() => {
            setShowNewAppModal(true)
            setShowNewAppTemplateDialog(false)
          }}
        />
      )}
      {showCreateFromDSLModal && (
        <CreateFromDSLModal
          show={showCreateFromDSLModal}
          onClose={() => {
            setShowCreateFromDSLModal(false)

            if (dslUrl)
              replace('/')
          }}
          activeTab={activeTab}
          dslUrl={dslUrl}
          onSuccess={() => {
            onPlanInfoChanged()
            if (onSuccess)
              onSuccess()
          }}
        />
      )}
    </div>
  )
}

CreateAppCard.displayName = 'CreateAppCard'

export default React.memo(CreateAppCard)