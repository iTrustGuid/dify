import type { FC } from 'react'
import cn from '@/utils/classnames'

type Option = {
  value: string
  text: string
  icon?: React.ReactNode
}
type TabSliderProps = {
  className?: string
  value: string
  onChange: (v: string) => void
  options: Option[]
}
const TabSliderNew: FC<TabSliderProps> = ({
  className,
  value,
  onChange,
  options,
}) => {
  return (
    <div className={cn(className, 'relative flex')} style={{ backgroundColor: '#EBF1F9'}}>
      {options.map(option => {
        const isActive = value === option.value;
        return (
          <div
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'mr-1 flex h-[32px] cursor-pointer items-center rounded-lg border-[0.5px] border-transparent px-3 py-[7px] text-[13px] font-medium leading-[18px] text-text-tertiary hover:bg-state-base-hover',
              isActive && 'border-components-main-nav-nav-button-border bg-state-base-hover text-components-main-nav-nav-button-text-active shadow-xs'
            )}
            // 👇 关键：用 style 覆盖激活状态的样式
            style={{
              ...(isActive
                ? {
                    backgroundColor: '#005ABC', // 自定义激活背景色（示例）
                    color: '#FFFFFF',           // 自定义激活文字颜色
                    borderRadius:'4px 4px 4px 4px'
                  }
                : {}),
            }}
          >
            {option.icon}
            {option.text}
          </div>
        );
      })}
    </div>
  );
};

export default TabSliderNew
