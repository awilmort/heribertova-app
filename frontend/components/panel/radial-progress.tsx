const SIZE = 140;
const STROKE_WIDTH = 12;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** LOE's radial progress coloring: red under 30%, amber under 70%, green at or past it. */
function toneClassFor(ratio: number): string {
  if (ratio >= 0.7) return 'text-success';
  if (ratio >= 0.3) return 'text-warning';
  return 'text-destructive';
}

/** A circular progress gauge (plan 6.2's `/panel`): `value` out of `goal`, colored red/amber/green.
 * Hand-rolled SVG rather than a charting library — ECharts (plan 8.1) earns its place once the
 * dashboards need several real chart types, not for one ring. */
export function RadialProgress({
  value,
  goal,
  label,
}: {
  value: number;
  goal: number;
  label: string;
}) {
  const ratio = goal > 0 ? Math.min(1, value / goal) : 0;
  const offset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="img"
      aria-label={`${label}: ${value} de ${goal}`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className={toneClassFor(ratio)}
          stroke="currentColor"
        />
        <text
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground text-xl font-semibold"
        >
          {value}/{goal}
        </text>
      </svg>
      <p className="text-center text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
