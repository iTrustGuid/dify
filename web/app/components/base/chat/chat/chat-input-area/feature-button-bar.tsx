import { FC, useRef } from 'react'
import { ChevronDown } from '@/app/components/base/icons/src/vender/solid/arrows'
import cn from '@/utils/classnames'

export type FeatureButton = {
  id: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  isExpandable?: boolean
}

type FeatureButtonBarProps = {
  buttons: FeatureButton[]
  className?: string
  onExpandClick?: (id: string) => void
}

const FeatureButtonBar: FC<FeatureButtonBarProps> = ({ buttons, className, onExpandClick }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  return (
    <div className={cn('relative mb-2', className)}>
      <div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-auto px-1 w-full"
        style={{
          scrollBehavior: 'smooth',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        }}
        css={{
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        }}
      >
        {buttons.map((btn, index) => (
          <button
            key={`${btn.id}-${index}`}
            onClick={() => btn.isExpandable ? onExpandClick?.(btn.id) : btn.onClick?.()}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            type="button"
          >
            {btn.icon}
            {btn.label}
            {btn.isExpandable && (
              // ✅ 向右箭头
              <ChevronDown className="h-3 w-3 -rotate-90 text-gray-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default FeatureButtonBar