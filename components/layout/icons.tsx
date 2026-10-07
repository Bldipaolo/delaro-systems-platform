type IconProps = { size?: number };

function Icon({ children, size = 18 }: IconProps & { children: React.ReactNode }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export const OverviewIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></Icon>;
export const InitiativeIcon = (props: IconProps) => <Icon {...props}><path d="M4 6h16M4 12h11M4 18h16"/><circle cx="18" cy="12" r="2"/></Icon>;
export const PerformanceIcon = (props: IconProps) => <Icon {...props}><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/></Icon>;
export const DocumentIcon = (props: IconProps) => <Icon {...props}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></Icon>;
export const ReviewIcon = (props: IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h5"/></Icon>;
export const ArrowIcon = (props: IconProps) => <Icon {...props}><path d="M5 12h13M13 6l6 6-6 6"/></Icon>;
export const ChevronIcon = (props: IconProps) => <Icon {...props}><path d="m7 9 5 5 5-5"/></Icon>;
