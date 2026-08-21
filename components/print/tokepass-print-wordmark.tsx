export function TokepassPrintWordmark({
  className,
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 220 40"
      role="img"
      aria-label="TokePass"
      className={className}
    >
      <rect x="0" y="4" width="32" height="32" rx="7" fill="#000000" />
      <rect x="6" y="11" width="20" height="5.5" rx="2.75" fill="#FFFFFF" />
      <rect x="13.25" y="14" width="5.5" height="10.5" rx="2.75" fill="#FFFFFF" />
      <rect x="12.5" y="27" width="7" height="3" rx="1.5" fill="#FFFFFF" />
      <text
        x="40"
        y="28"
        fill="#000000"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="18"
        fontWeight="900"
      >
        TokePass
      </text>
    </svg>
  )
}
