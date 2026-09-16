import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export function IconGrid(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </Svg>
  )
}

export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.4v2.1M12 18.5v2.1M3.4 12h2.1M18.5 12h2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5" />
    </Svg>
  )
}

export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </Svg>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 16V7" />
      <path d="M8 10l4-4 4 4" />
      <path d="M5 19h14" />
    </Svg>
  )
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Svg>
  )
}

export function IconSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l1.4 5.2L18 9.5l-4.6 1.3L12 16l-1.4-5.2L6 9.5l4.6-1.3z" />
    </Svg>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  )
}

export function IconPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </Svg>
  )
}

export function IconWallet(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconIndustry(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V9l6 3V9l6 3V4h4v16z" />
    </Svg>
  )
}

export function IconRows(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  )
}

export function IconRank(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16h4v4H4zM10 10h4v10h-4zM16 6h4v14h-4z" />
    </Svg>
  )
}

export function IconNews(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5h12v14H4z" />
      <path d="M16 8h4v11a2 2 0 0 1-2 2H6" />
      <path d="M7 9h6M7 12h6M7 15h3" />
    </Svg>
  )
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H10" />
    </Svg>
  )
}

export function IconKanban(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="5" height="16" rx="1.1" />
      <rect x="10" y="4" width="5" height="10" rx="1.1" />
      <rect x="17" y="4" width="5" height="13" rx="1.1" />
    </Svg>
  )
}

export function IconCrm(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 21v-2a3.6 3.6 0 0 0-3-3.45" />
      <path d="M16 3.13a3.2 3.2 0 0 1 0 6.24" />
    </Svg>
  )
}
