# amherst-weather

A personal weather page for Amherst, MA. It exists to answer one question —
"what's it doing outside today, and should I know about anything before I
leave the house" — from a single glance, without opening an app or wading
through ads. Live at **[weather.paulmilliken.com](https://weather.paulmilliken.com)**.

## Stack

- TypeScript, React 19, Next.js App Router
- Tailwind CSS v4
- Deployed on Vercel (static render, revalidated on a timer — see below)
- No test runner, no charting library, no state library. Charts are
  hand-rolled inline SVG.

## Data sources & licensing

This page reads from two upstreams and shows both, on purpose — they use
different models and don't always agree, and that disagreement is part of
what makes the page worth checking.

**[Open-Meteo](https://open-meteo.com/)** — current conditions and the hourly
temperature/wind charts. No API key. The free tier is **non-commercial use
only** and requires attribution; this page is exactly that use case, and the
CC BY 4.0 credit lives in the page footer. Don't lift `lib/weather.ts` into
paid work without moving to a paid Open-Meteo plan.

**[National Weather Service](https://www.weather.gov/)** — the hourly
forecast used for the model comparison, and active alerts for the local zone.
No API key, but every request must carry a `User-Agent` identifying the app
with contact info, or NWS rejects it. There's no published rate limit; instead
the API returns 429 when it decides a client is asking too often, which this
app treats as a normal failure rather than something to retry against.

## Running it locally

```bash
git clone https://github.com/paul-milliken/amherst-weather.git
cd amherst-weather
npm install
echo "CRON_SECRET=anything-you-want" > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The page itself works
without `CRON_SECRET` — it only gates `/api/refresh` (see below), which
returns 401 rather than opening up if the variable is missing. Set it anyway
so local behavior matches production.

Other commands: `npm run build`, `npm run start`, `npm run lint`.

## Architectural decisions worth knowing before you "fix" them

A few choices here look like they could be simplified. They can't be, and
the reasons aren't visible from reading any single function in isolation.

**Fetchers return `null` on failure and never throw.** `getWeather()`,
`getNwsForecast()`, and `getNwsAlerts()` all catch everything internally and
return `null` instead — never an exception. That's what lets `app/page.tsx`
render each section from its own data independently: a dead Open-Meteo and a
healthy NWS produce a page with working alerts and charts and one visible
"unavailable" panel, not a blank screen. The page's `Promise.allSettled` call
adds a second, structural layer on top of this — so even if a fetcher someday
breaks its own contract and throws anyway, the page degrades that one source
to `null` instead of losing all three. Belt and suspenders, deliberately: the
convention should hold, and the page doesn't have to bet on it holding.

**Alerts are a three-state value, and `null` must never look like an
all-clear.** `getNwsAlerts()` returns an array of active alerts, `[]` when
there genuinely are none, or `null` when the feed couldn't be reached. Those
last two look similar in a lot of codebases and are opposite in meaning here:
"no alerts" is good news, "we don't know" is not news at all. The page renders
them with different visual treatments on purpose, and the `null` state says
outright that it is not an all-clear. Collapsing this to a boolean or a single
"no active alerts" fallback would quietly turn an outage into a false sense of
safety on a page that shows severe weather warnings.

**The cron job runs once a day, not every 15 minutes.** `vercel.json` schedules
`/api/refresh` for `0 10 * * *` — once daily, timed to land before the morning
check. This isn't the freshness mechanism; it can't be, because Vercel's Hobby
plan allows only one cron invocation per day and rejects a more frequent cron
expression at deploy time. Actual freshness comes from `revalidate = 900` on
the page and on every individual fetch, which refreshes on real traffic every
15 minutes regardless of the cron. The cron's only job is making sure the
first check of the day doesn't pay for three cold fetches.

## What I'd do differently

Three real bugs shipped to production before being caught. Recording them
here because each one reveals something about what wasn't being tested, not
just what was wrong.

**Timezone shift on every displayed Open-Meteo time.** Open-Meteo, called
with `timezone=America/New_York`, returns timestamps as offset-less
wall-clock strings like `"2026-08-23T00:00"` — it already did the timezone
conversion, so the string just *is* local time. The original code parsed
these with `new Date(...)` and formatted with `timeZone: "America/New_York"`,
which works by accident on a machine whose local clock is near UTC, and
silently double-converts everywhere else. Vercel's runtime is UTC, so every
chart hour label and the "updated" timestamp were off by 4-5 hours in
production — midnight showed as 8pm the day before. It wasn't caught earlier
because local development doesn't run in UTC, so the exact same code produced
correct output on the machine it was written on. The fix reads the hour and
minute straight out of the string instead of round-tripping through `Date`.

**No timeout on any fetch.** All three fetchers wrapped their `fetch` calls in
try/catch and assumed that was sufficient error handling — but a hang isn't
an error. A `fetch` that never resolves never throws, so the catch block
never runs, and the `await` in the server component just sits there,
producing a page that never finishes loading. This is invisible in ordinary
testing against healthy APIs, and invisible in the code itself — a stalled
promise looks identical to a slow one until you've actually waited for it.
It only becomes obvious when an upstream is degraded in exactly the wrong
way (accepting the connection, then going silent), which is rare enough that
nothing forced the question until it was asked directly. Every fetch now
carries `signal: AbortSignal.timeout(5000)`.

**Comparing temperatures across unit systems.** The model-comparison section
shows Open-Meteo's current temperature next to NWS's, with the difference
between them. Open-Meteo is pinned to Fahrenheit in the query string, but
NWS's unit is read from its response and rendered as whatever it says — and
the original diff calculation subtracted the two raw numbers regardless of
what those units were. If NWS ever returned Celsius, the result would be a
plausible-looking wrong number sitting directly next to a correctly-labeled
value, which is a worse failure than an obviously broken one: nothing about
the output looks wrong. It went unnoticed because during ordinary use the NWS
endpoint reliably returned Fahrenheit, so the mismatched-unit path never
actually executed — the bug only exists on a branch nothing exercised. The
fix computes a diff only when `temperatureUnit === "F"`, and shows an explicit
"units differ" message rather than a number on any other value.
