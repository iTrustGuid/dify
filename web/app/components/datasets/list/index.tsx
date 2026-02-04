'use client'

// Libraries
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useBoolean, useDebounceFn } from 'ahooks'
import './list.css' 
// Components
import ExternalAPIPanel from '../external-api/external-api-panel'
import Datasets from './datasets'
import NewDatasetCard2 from './new-dataset-card2'
import DatasetFooter from './dataset-footer'
import TagManagementModal from '@/app/components/base/tag-management'
import TagFilter from '@/app/components/base/tag-management/filter'
import Button from '@/app/components/base/button'
import Input from '@/app/components/base/input'
import { ApiConnectionMod } from '@/app/components/base/icons/src/vender/solid/development'
import CheckboxWithLabel from '@/app/components/datasets/create/website/base/checkbox-with-label'

// Hooks
import { useStore as useTagStore } from '@/app/components/base/tag-management/store'
import { useAppContext } from '@/context/app-context'
import { useExternalApiPanel } from '@/context/external-api-panel-context'
import { useGlobalPublicStore } from '@/context/global-public-context'
import useDocumentTitle from '@/hooks/use-document-title'

const List = () => {
  const { t } = useTranslation()
  const { systemFeatures } = useGlobalPublicStore()
  const router = useRouter()
  const { currentWorkspace, isCurrentWorkspaceOwner } = useAppContext()
  const showTagManagementModal = useTagStore(s => s.showTagManagementModal)
  const { showExternalApiPanel, setShowExternalApiPanel } = useExternalApiPanel()
  const [includeAll, { toggle: toggleIncludeAll }] = useBoolean(false)
  useDocumentTitle(t('dataset.knowledge'))

  const [keywords, setKeywords] = useState('')
  const [searchKeywords, setSearchKeywords] = useState('')
  const { run: handleSearch } = useDebounceFn(() => {
    setSearchKeywords(keywords)
  }, { wait: 500 })
  const handleKeywordsChange = (value: string) => {
    setKeywords(value)
    handleSearch()
  }
  const [tagFilterValue, setTagFilterValue] = useState<string[]>([])
  const [tagIDs, setTagIDs] = useState<string[]>([])
  const { run: handleTagsUpdate } = useDebounceFn(() => {
    setTagIDs(tagFilterValue)
  }, { wait: 500 })
  const handleTagsChange = (value: string[]) => {
    setTagFilterValue(value)
    handleTagsUpdate()
  }

  useEffect(() => {
    if (currentWorkspace.role === 'normal')
      return router.replace('/apps')
  }, [currentWorkspace, router])

  return (
    <div className='scroll-container relative flex grow flex-col overflow-y-auto bg-background-body'>
      <div className='sticky top-0 z-10 flex items-center justify-end gap-x-1 bg-background-body px-12  pt-4'>
        {/* sticky top-0 z-10 flex flex-wrap items-center justify-between gap-y-2  px-12  pt-7 */}
        <div style={{
    width: '1808px',
    height: '52px',
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'end',
    padding: '0 16px',
    boxSizing: 'border-box'
  }}>
        <div className='flex items-center justify-center gap-2' >
          {isCurrentWorkspaceOwner && (
            <CheckboxWithLabel
              isChecked={includeAll}
              onChange={toggleIncludeAll}
              label={t('dataset.allKnowledge')}
              labelClassName='system-md-regular font-color'
              className='mr-2 custom-checkbox-container'
              tooltip={t('dataset.allKnowledgeDescription') as string}
            />
          )}
          <TagFilter type='knowledge' value={tagFilterValue} onChange={handleTagsChange} />
          <div style={{ width: '280px'}}>
            <Input
            showLeftIcon
            showClearIcon
            value={keywords}
            onChange={e => handleKeywordsChange(e.target.value)}
            onClear={() => handleKeywordsChange('')}
            style={{ width: '280px',height: '36px',background: '#005ABC !important',
    border: '1px solid #DADBE4',
    color: '#FFFFFF',
    borderRadius: '4px 4px 4px 4px'}}
          />
          </div>

          <div className='h-4 w-[1px] bg-divider-regular' />
          <Button
            className='shadows-shadow-xs gap-0.5 btn-font-color btn-know'
            onClick={() => setShowExternalApiPanel(true)}
          >
            <ApiConnectionMod className='h-4 w-4 btn-font-color' />
            <div className='system-sm-medium flex items-center justify-center gap-1 px-0.5 btn-font-color'>{t('dataset.externalAPIPanelTitle')}</div>
          </Button>
        </div>
        </div>
      </div>
      <div className='sticky top-0 z-10 flex items-center justify-end gap-x-1 bg-background-body px-12  pt-4'>
        {/* sticky top-0 z-10 flex flex-wrap items-center justify-between gap-y-2  px-12  pt-7 */}
        <div style={{
    width: '1808px',
    height: '52px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'end'
  }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
           {<NewDatasetCard2 />}
         </div>
        </div>
      </div>
      <Datasets tags={tagIDs} keywords={searchKeywords} includeAll={includeAll} />
      {!systemFeatures.branding.enabled && <DatasetFooter />}
      {showTagManagementModal && (
        <TagManagementModal type='knowledge' show={showTagManagementModal} />
      )}

      {showExternalApiPanel && <ExternalAPIPanel onClose={() => setShowExternalApiPanel(false)} />}
    </div>
  )
}

export default List
