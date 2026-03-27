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
  onExpandClick?: () => void
}

const FeatureButtonBar: FC<FeatureButtonBarProps> = ({ buttons, className, onExpandClick }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return
    const scrollAmount = 150
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }

  return (
    <div className={cn('relative flex items-center mb-2', className)}>
      {/* 左箭头 */}
      <button
        onClick={() => handleScroll('left')}
        className="absolute left-0 z-10 flex items-center justify-center w-7 h-7 bg-white/90 rounded-full shadow hover:bg-white"
      >
        <ChevronDown className="h-4 w-4 rotate-90 text-gray-500" />
      </button>

      {/* 横向滚动按钮列表 + 内置隐藏滚动条 */}
      <div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-auto px-7 w-full"
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
            key={btn.id}
            onClick={() => index === 0 && btn.isExpandable ? onExpandClick?.() : btn.onClick?.()}
            className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            {btn.icon}
            {btn.label}
            {index === 0 && btn.isExpandable && (
              <ChevronDown className="h-3 w-3 -rotate-90 text-gray-400" />
            )}
          </button>
        ))}
      </div>

      {/* 右箭头 */}
      <button
        onClick={() => handleScroll('right')}
        className="absolute right-0 z-10 flex items-center justify-center w-7 h-7 bg-white/90 rounded-full shadow hover:bg-white"
      >
        <ChevronDown className="h-4 w-4 -rotate-90 text-gray-500" />
      </button>
    </div>
  )
}

export default FeatureButtonBar