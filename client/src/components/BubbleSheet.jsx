// Decorative optical answer sheet: the one memorable motif of the product.
const FILLED = [[0,1],[1,3],[2,0],[3,2],[4,4],[5,1],[6,3],[7,0],[8,2]];

export default function BubbleSheet({ rows = 9, className = '' }) {
  const cols = 5, gap = 44;
  const filled = new Set(FILLED.map(([r, c]) => `${r}-${c}`));
  return (
    <svg viewBox={`0 0 ${cols * gap + 56} ${rows * gap + 16}`} className={className} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <g key={r}>
          <text x="8" y={r * gap + 28} fontSize="13" fill="currentColor" opacity=".45">{r + 1}</text>
          {Array.from({ length: cols }).map((__, c) => (
            <circle key={c} cx={56 + c * gap} cy={r * gap + 24} r="13" fill={filled.has(`${r}-${c}`) ? 'currentColor' : 'none'}
              stroke="currentColor" strokeWidth="1.5" opacity={filled.has(`${r}-${c}`) ? 0.95 : 0.4} />
          ))}
        </g>
      ))}
    </svg>
  );
}
