import { formatOpenMeteoHour } from "@/lib/weather";

// Hand-rolled SVG line chart. No charting library, no dependency, no bundle cost.
// 24 points across the local day.
//
// How it works: map each value into an (x, y) inside a fixed viewBox, join them
// with a <polyline>, and let the browser scale the whole thing to its container.

type Props = {
  times: string[];                 // ISO strings from the API
  values: (number | null)[];
  unit: string;                    // "°F", "mph"
  label: string;
  accent: string;                  // any CSS color
};

const W = 720;
const H = 220;
const PAD = { top: 24, right: 16, bottom: 28, left: 40 };

export default function HourlyChart({ times, values, unit, label, accent }: Props) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => typeof p.v === "number");

  if (points.length < 2) {
    return (
      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">{label}</h2>
        <p className="py-8 text-center text-sm text-neutral-500">Not enough data to draw this today.</p>
      </section>
    );
  }

  const nums = points.map((p) => p.v);
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) { min -= 1; max += 1; }        // flat line would divide by zero
  const span = max - min;
  min -= span * 0.1;                               // 10% headroom so the line isn't glued to the edges
  max += span * 0.1;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const lastIndex = Math.max(values.length - 1, 1);

  const x = (i: number) => PAD.left + (i / lastIndex) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;

  const path = points.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${x(points[0].i).toFixed(1)},${(PAD.top + plotH).toFixed(1)} ${path} ${x(points[points.length - 1].i).toFixed(1)},${(PAD.top + plotH).toFixed(1)}`;

  const hourLabels = [0, 6, 12, 18, 23].filter((i) => i < times.length);
  const gridValues = [max, (max + min) / 2, min];

  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-sm font-medium text-neutral-500">{label}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {gridValues.map((g, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity="0.12" />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.5">
              {Math.round(g)}
            </text>
          </g>
        ))}

        <polygon points={area} fill={accent} fillOpacity="0.10" />
        <polyline points={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {hourLabels.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.5">
            {/* formatOpenMeteoHour, not `new Date(...)` — these are Open-Meteo
                wall-clock strings with no UTC offset; see lib/weather.ts. */}
            {formatOpenMeteoHour(times[i])}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-right text-xs text-neutral-500">
        {Math.round(Math.min(...nums))}{unit} – {Math.round(Math.max(...nums))}{unit} today
      </p>
    </section>
  );
}
