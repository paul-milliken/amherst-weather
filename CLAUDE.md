@AGENTS.md

# amherst-weather

A personal weather page for Amherst, MA (42.3732, -72.5199). One route, one
screen: current conditions plus two hourly charts for the local calendar day.
Not a product — a page the author looks at.

## Stack

- TypeScript (strict), React 19, Next.js 16 App Router
- Tailwind CSS v4 (`@import "tailwindcss"` in `app/globals.css`, no `tailwind.config`)
- Deployed on Vercel
- Data: Open-Meteo forecast API, no API key
- No test runner, no charting library, no state library. Runtime deps are
  `next`, `react`, `react-dom` and nothing else — keep it that way.

```
app/page.tsx              the only page; server component, fetches and renders
app/layout.tsx            root layout, Geist fonts
lib/weather.ts            the single Open-Meteo call + response types
lib/wmo.ts                WMO weather code -> label / type / intensity table
lib/compass.ts            wind degrees -> 16-point compass
components/HourlyChart.tsx  hand-rolled SVG line chart
```

`@/*` maps to the repo root. Lint with `npm run lint`; dev with `npm run dev`.

## Conventions

These are load-bearing. Follow them in new code rather than reaching for a
more conventional pattern.

**Fetchers return `null` on failure and never throw.** `getWeather()` wraps
everything in try/catch and returns `null` for network errors, non-200s, and
malformed bodies alike. An unhandled throw in a server component becomes a 500
and the reader sees nothing; a `null` lets the page render its own unhappy
path. Any new fetcher gets the same signature: `Promise<T | null>`.

**Shape-validate before returning.** A 200 with the wrong body is a real
failure mode — check the fields you actually read (`typeof … === "number"`,
`Array.isArray(…)`, non-empty) and return `null` if they aren't there. Cast to
the type only after the check passes. `console.error` the reason first.

**Callers handle `null` explicitly.** `app/page.tsx` renders a visible "data is
unavailable" panel, never a blank screen or a crash. `HourlyChart` has the same
posture for thin data: fewer than 2 numeric points renders a message, not an
empty chart.

**`revalidate = 900`** (15 minutes) in two places that must stay in sync: the
route segment export in `app/page.tsx` and `next: { revalidate: 900 }` on the
fetch in `lib/weather.ts`. Vercel serves the cached render in between. Don't
lower it casually — it's the rate-limit budget.

**Charts are hand-rolled SVG.** `components/HourlyChart.tsx` maps values into a
fixed `viewBox` and joins them with a `<polyline>`; the browser scales it. Do
not add a charting library to extend it — extend the component. Existing
guards worth preserving: flat series widen `min`/`max` so the scale can't
divide by zero, and there's 10% headroom top and bottom.

**Time is `America/New_York`, everywhere.** The API is called with
`timezone=America/New_York` and `forecast_days=1` so the response is the local
midnight-to-midnight day, and every `toLocaleTimeString` passes the timezone
explicitly. Never format a time with the server's local zone.

**Read from the API, don't recompute.** Weather type and intensity come from
the WMO code via `lib/wmo.ts`. The one genuinely derived value on the page is
the compass point in `lib/compass.ts`.

## Deploy

Push to `main` and Vercel auto-deploys — there is no separate deploy step and no
staging environment. `origin` is
`github.com/paul-milliken/amherst-weather`. A broken build on `main` is a broken
site, so run `npm run build` before pushing anything non-trivial.

## Open-Meteo licensing

The free tier needs no key and allows 10,000 calls/day, but it is
**non-commercial use only**. This page qualifies; a client project would not.
Don't copy `lib/weather.ts` into paid work without moving to a paid plan. The
attribution link in the page footer (Open-Meteo, CC BY 4.0) is required — leave
it there.
