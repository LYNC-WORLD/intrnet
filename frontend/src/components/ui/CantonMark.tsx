/**
 * CantonMark — the page's signature visual: a hatched arc echoing the
 * Canton "C" wordmark, rendered in line-art rather than a solid fill.
 * Used sparingly: brand lockup, loading state, and empty-state ornament.
 */
export function CantonMark({ size = 32, spin = false }: { size?: number; spin?: boolean }) {
  const strokes = 16;
  const radius = size / 2 - 1.5;
  const cx = size / 2;
  const cy = size / 2;
  const strokeW = Math.max(1.6, size / 14);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={spin ? 'animate-spin-slow' : ''}
    >
      {Array.from({ length: strokes }).map((_, i) => {
        const angle = (i / strokes) * 300 - 240; // ~300° arc, leaving a gap like the "C"
        const rad = (angle * Math.PI) / 180;
        const inner = radius * 0.55;
        const x1 = cx + Math.cos(rad) * inner;
        const y1 = cy + Math.sin(rad) * inner;
        const x2 = cx + Math.cos(rad) * radius;
        const y2 = cy + Math.sin(rad) * radius;
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#E4F95E"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/**
 * StackedPanes — ambient decorative motif echoing Canton's tilted,
 * overlapping-plane illustration. Pure SVG line art, no raster assets.
 * Intended as a background flourish behind auth panels / empty states.
 */
export function StackedPanes({ className = '' }: { className?: string }) {
  const planes = 8;
  return (
    <svg viewBox="0 0 480 220" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {Array.from({ length: planes }).map((_, i) => {
        const t = i / (planes - 1);
        const x = 30 + i * 38;
        const y = 110 - i * 6;
        const isLast = i === planes - 1;
        return (
          <rect
            key={i}
            x={x}
            y={y - 70}
            width="118"
            height="148"
            rx="8"
            transform={`rotate(-22 ${x + 59} ${y})`}
            stroke={isLast ? '#E4F95E' : '#9A9A9E'}
            strokeOpacity={isLast ? 0.9 : 0.16 + t * 0.3}
            strokeWidth={isLast ? 1.6 : 1}
          />
        );
      })}
    </svg>
  );
}
