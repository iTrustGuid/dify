'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  RiAddLine,
  RiFunctionAddLine,
} from '@remixicon/react'
import Option from './option'
import { ApiConnectionMod } from '@/app/components/base/icons/src/vender/solid/development'

const CreateAppCard = () => {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col rounded-xl'>
      {/* 主体区域：三个选项横向排列 */}
      <div className='flex grow items-center justify-center'>
        <div className='flex w-full  justify-between gap-x-4'>
          <Option
            href={'/datasets/create'}
            Icon={RiAddLine}
            text={t('dataset.createDataset')}
          />
          <Option
            href={'/datasets/create-from-pipeline'}
            Icon={RiFunctionAddLine}
            text={t('dataset.createFromPipeline')}
          />
          <Option
            href={'/datasets/connect'}
            Icon={ApiConnectionMod}
            text={t('dataset.connectDataset')}
          />
        </div>
      </div>
    </div>
  )
}

CreateAppCard.displayName = 'CreateAppCard'

export default CreateAppCard