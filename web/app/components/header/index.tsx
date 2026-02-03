'use client'
import { useCallback } from 'react'
import Link from 'next/link'
import AccountDropdown from './account-dropdown'
import AppNav from './app-nav'
import DatasetNav from './dataset-nav'
import EnvNav from './env-nav'
import PluginsNav from './plugins-nav'
import ExploreNav from './explore-nav'
import ToolsNav from './tools-nav'
import { WorkspaceProvider } from '@/context/workspace-context'
import { useAppContext } from '@/context/app-context'
import DifyLogo from '@/app/components/base/logo/dify-logo'
import WorkplaceSelector from '@/app/components/header/account-dropdown/workplace-selector'
import useBreakpoints, { MediaType } from '@/hooks/use-breakpoints'
import { useProviderContext } from '@/context/provider-context'
import { useModalContext } from '@/context/modal-context'
import PlanBadge from './plan-badge'
import LicenseNav from './license-env'
import { Plan } from '../billing/type'
import { useGlobalPublicStore } from '@/context/global-public-context'
import { ACCOUNT_SETTING_TAB } from '@/app/components/header/account-setting/constants'

const navClassName = `
  flex items-center relative px-3 h-8 rounded-xl
  font-medium text-sm
  cursor-pointer
`

const Header = () => {
  const { isCurrentWorkspaceEditor, isCurrentWorkspaceDatasetOperator } = useAppContext()
  const media = useBreakpoints()
  const isMobile = media === MediaType.mobile
  const { enableBilling, plan } = useProviderContext()
  const { setShowPricingModal, setShowAccountSettingModal } = useModalContext()
  const systemFeatures = useGlobalPublicStore(s => s.systemFeatures)
  const isFreePlan = plan.type === Plan.sandbox
  const isBrandingEnabled = systemFeatures.branding.enabled
  const handlePlanClick = useCallback(() => {
    if (isFreePlan)
      setShowPricingModal()
    else
      setShowAccountSettingModal({ payload: ACCOUNT_SETTING_TAB.BILLING })
  }, [isFreePlan, setShowAccountSettingModal, setShowPricingModal])

  const renderLogo = () => (
    <h1>
      <Link href="/apps" className='flex h-8 shrink-0 items-center justify-center overflow-hidden whitespace-nowrap px-0.5 indent-[-9999px]'>
        {isBrandingEnabled && systemFeatures.branding.application_title ? systemFeatures.branding.application_title : '快易办'}
        {systemFeatures.branding.enabled && systemFeatures.branding.workspace_logo
          ? <img
            src={systemFeatures.branding.workspace_logo}
            className='block h-[22px] w-auto object-contain'
            alt='logo'
          />
          : <DifyLogo />}
      </Link>
    </h1>
  )

  if (isMobile) {
    return (
      <div className=''>
        <div className='flex items-center justify-between px-2'>
          <div className='flex items-center'>
            {renderLogo()}
            <div className='mx-1.5 shrink-0 font-light text-divider-deep'>/</div>
            <WorkspaceProvider>
              <WorkplaceSelector />
            </WorkspaceProvider>
            {enableBilling ? <PlanBadge allowHover sandboxAsUpgrade plan={plan.type} onClick={handlePlanClick} /> : <LicenseNav />}
          </div>
          <div className='flex items-center'>
            <div className='mr-2'>
              <PluginsNav />
            </div>
            <AccountDropdown />
          </div>
        </div>
        <div className='my-1 flex items-center justify-center space-x-1'>
          {!isCurrentWorkspaceDatasetOperator && <ExploreNav className={navClassName} />}
          {!isCurrentWorkspaceDatasetOperator && <AppNav />}
          {(isCurrentWorkspaceEditor || isCurrentWorkspaceDatasetOperator) && <DatasetNav />}
          {!isCurrentWorkspaceDatasetOperator && <ToolsNav className={navClassName} />}
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-[56px] items-center' style={{
      backgroundImage: 'url(/logo/body-header-bg@2x.png)',
      backgroundSize: '100% 100%'
    }}>
      <div className='flex min-w-0 flex-[1]  items-center pl-3 pr-2 min-[1280px]:pr-3'>
        {renderLogo()}
        {/* <div className='mx-1.5 shrink-0 font-light text-divider-deep'>/</div> */}
  <div style={{
        marginLeft: '32px'
      }}>
    <img
      src="/logo/escon.png"
      alt="壹时空科技 Logo"
      style={{
        width: '177px',
        height: '40px',
        borderRadius: '0px'
      }}
    />
  </div>

  {/* 竖线分隔符 —— 黑色，2px 宽 */}
  <div
    style={{
      width: '2px',
      height: '24px',
      backgroundColor: '#000000',
      borderRadius: '0px',
      margin: '0 12px' // 可选：左右留空，避免紧贴
    }}
  ></div>

  {/* 平台名称 —— 精确文字样式 */}
  <div
    style={{
      width: '216px',
      height: '30px',
      fontFamily: '"PingFang SC", "PingFang SC"',
      fontWeight: 500,
      fontSize: '20px',
      color: '#000000',
      lineHeight: '30px',
      letterSpacing: '1px',
      textAlign: 'right',
      fontStyle: 'normal',
      textTransform: 'none'
    }}
  >
    Escon智能体搭建平台
  </div>
        {/* <WorkspaceProvider>
          <WorkplaceSelector />
        </WorkspaceProvider>
        {enableBilling ? <PlanBadge allowHover sandboxAsUpgrade plan={plan.type} onClick={handlePlanClick} /> : <LicenseNav />} */}
      </div>
      {/* <div className='flex items-center space-x-2'> */}
      <div className='ml-auto flex items-center space-x-2'>
        {/* {!isCurrentWorkspaceDatasetOperator && <ExploreNav className={navClassName} />} */}
        {!isCurrentWorkspaceDatasetOperator && <AppNav />}
        {(isCurrentWorkspaceEditor || isCurrentWorkspaceDatasetOperator) && <DatasetNav />}
        {!isCurrentWorkspaceDatasetOperator && <ToolsNav className={navClassName} />}
      </div>
      {/* <div className='flex min-w-0 flex-[1] items-center justify-end pl-2 pr-3 min-[1280px]:pl-3'> */}
      <div className='flex min-w-0  items-center justify-end pl-2 pr-3 min-[1280px]:pl-3'>
        <EnvNav />
        <div className='mr-2'>
          <PluginsNav />
        </div>
        <AccountDropdown />
      </div>
    </div>
  )
}
export default Header
