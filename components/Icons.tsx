type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function GlobeIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </svg>
  );
}

export function ArrowIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2.4}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function BoltIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M13 2L4.5 13.5H11l-1 8.5 9-12h-6.5L13 2z" />
    </svg>
  );
}

export function SearchIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}

export function SparkIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    </svg>
  );
}

export function ShieldIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function CopyIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 6.5V5.8A2.8 2.8 0 0012.2 3H6.8A2.8 2.8 0 004 5.8v5.4A2.8 2.8 0 006.8 14h.7" />
    </svg>
  );
}

export function ExternalIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M19 14v4.5A1.5 1.5 0 0117.5 20h-11A1.5 1.5 0 015 18.5v-11A1.5 1.5 0 016.5 6H11" />
    </svg>
  );
}

export function GaugeIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 17a8 8 0 1116 0" />
      <path d="M12 17l4-5" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CodeIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  );
}

export function ClockIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function RefreshIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 12a8 8 0 11-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}

export function GithubIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 1.8a10.2 10.2 0 00-3.23 19.9c.51.09.7-.22.7-.49v-1.9c-2.84.62-3.44-1.2-3.44-1.2-.47-1.18-1.14-1.5-1.14-1.5-.93-.63.07-.62.07-.62 1.02.07 1.56 1.05 1.56 1.05.9 1.55 2.37 1.1 2.95.85.09-.66.36-1.1.65-1.36-2.27-.26-4.64-1.13-4.64-5.03 0-1.11.4-2.02 1.05-2.73-.11-.26-.46-1.3.1-2.7 0 0 .85-.27 2.79 1.04a9.72 9.72 0 015.08 0c1.94-1.31 2.79-1.04 2.79-1.04.56 1.4.21 2.44.1 2.7.65.71 1.05 1.62 1.05 2.73 0 3.91-2.38 4.77-4.64 5.02.36.32.68.94.68 1.9v2.82c0 .27.18.59.69.49A10.2 10.2 0 0012 1.8z" />
    </svg>
  );
}

