import Link from 'next/link'
import React from 'react'

type OptionProps = {
  Icon: React.ComponentType<{ className?: string }>
  text: string
  href: string
}

const Option = ({
  Icon,
  text,
  href,
}: OptionProps) => {
  return (
    <Link
      type='button'
      className='flex items-center gap-x-2 rounded-lg bg-transparent px-4  text-text-tertiary shadow-shadow-shadow-3 hover:bg-background-default-dodge hover:text-text-secondary hover:shadow-xs'
      href={href}
      style={{
              borderRadius: '4px 4px 4px 4px',
              background: '#FFFFFF',
              color: '#000000',
              fontWeight: '400',
              height: '36px',
fontSize: '16px',
lineHeight: '24px',
letterSpacing: '1px'
      }}
    >
      <Icon className='h-4 w-4 shrink-0' />
      <span className='system-sm-medium grow text-left'>{text}</span>
    </Link>
  )
}

export default React.memo(Option)
