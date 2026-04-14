/**
 * Animated spinning circle loader.
 * Props:
 *   size — 'sm' (w-4 h-4) or 'md' (w-5 h-5, default)
 *   className — extra classes merged onto the SVG
 */
const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5' };

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <svg
      className={`animate-spin ${sizes[size] || sizes.md} text-magenta ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
