interface Props {
  checked?: boolean;
  size?: number; // px, default 16
  className?: string;
  strokeWidth?: number;
}

export function AnimatedCheckmark({
  checked = true,
  size = 16,
  className = 'text-emerald-500',
  strokeWidth = 2.5,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block transition-transform duration-200 ${checked ? 'scale-100' : 'scale-90 opacity-40'} ${className}`}
      aria-hidden="true"
    >
      <path
        d="M20 6L9 17l-5-5"
        className={`transition-all duration-300 ease-out ${
          checked
            ? '[stroke-dasharray:30] [stroke-dashoffset:0]'
            : '[stroke-dasharray:30] [stroke-dashoffset:30]'
        }`}
      />
    </svg>
  );
}
