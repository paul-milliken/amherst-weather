import { getWeather, formatOpenMeteoClock, type Weather } from "@/lib/weather";
import { getNwsForecast, getNwsAlerts, type NwsAlertFeature, type NwsForecast } from "@/lib/nws";
import { describeCode } from "@/lib/wmo";
import { degreesToCompass } from "@/lib/compass";
import HourlyChart from "@/components/HourlyChart";

// Re-fetch at most every 15 minutes. Vercel serves the cached render in between.
export const revalidate = 900;

export default async function Page() {
  // Parallel, not sequential — three round trips at once instead of stacked.
  // Promise.all is safe here only because of the house rule that fetchers
  // return null and never throw: a rejection would take down all three. Any new
  // source added to this array must keep that contract.
  const [weather, forecast, alerts] = await Promise.all([
    getWeather(),
    getNwsForecast(),
    getNwsAlerts(),
  ]);

  // When this render actually happened. The route is statically prerendered and
  // revalidated every 15 minutes, so this is stamped once per revalidation, not
  // per visitor — which is exactly the number worth showing: it dates the data
  // on the page, not the moment someone opened it. See the note on the alerts
  // fetch in lib/nws.ts for why that staleness is accepted and surfaced here.
  const checkedAt = new Date();

  // Every section below reads its own source and renders its own failure. There
  // is deliberately no early return: one dead upstream must not blank the page.
  // formatOpenMeteoClock, not `new Date(...).toLocaleTimeString(...)` — see the
  // comment on it in lib/weather.ts for why that round-trip through Date is
  // the bug, not a style choice.
  const updated = weather ? formatOpenMeteoClock(weather.current.time) : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Amherst, MA</h1>
        <p className="text-sm text-neutral-500">
          Today{updated ? ` · updated ${updated}` : ""}
        </p>
      </header>

      <Alerts alerts={alerts} checkedAt={checkedAt} />
      <Conditions weather={weather} />
      <Comparison weather={weather} forecast={forecast} />

      {weather ? (
        <div className="space-y-6">
          <HourlyChart
            label="Temperature through the day"
            times={weather.hourly.time}
            values={weather.hourly.temperature_2m}
            unit="°F"
            accent="#e07a3f"
          />
          <HourlyChart
            label="Wind speed through the day"
            times={weather.hourly.time}
            values={weather.hourly.wind_speed_10m}
            unit=" mph"
            accent="#3f7ae0"
          />
        </div>
      ) : null}

      <footer className="mt-10 text-xs text-neutral-500">
        Weather data by <a className="underline" href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0).
        Alerts and hourly forecast from the{" "}
        <a className="underline" href="https://www.weather.gov/">US National Weather Service</a>.
      </footer>
    </main>
  );
}

// Alert timestamps are ISO strings straight from NWS. They're validated as
// strings in lib/nws.ts but nothing guarantees they parse, so fall back to the
// raw value rather than rendering "Invalid Date" at someone in a storm.
function easternTime(iso: string, withDay = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    ...(withDay ? { weekday: "short" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

// Three states, three visually distinct treatments. The one that matters is
// null: "we couldn't reach the alert feed" must never be mistaken for "there
// are no alerts". A false all-clear on a severe-weather feed is the single
// worst thing this page could do, so it gets a warning treatment, not a quiet
// grey line, and it says outright to go check elsewhere.
function Alerts({ alerts, checkedAt }: { alerts: NwsAlertFeature[] | null; checkedAt: Date }) {
  // Rendered under all three states, not just the happy one. It matters most
  // under the quiet ones: "no active alerts" and "unavailable" are both claims
  // about a moment in the past, and this says which moment.
  const checked = (
    <p className="mt-2 text-xs text-neutral-500">
      Alert feed checked at {easternTime(checkedAt.toISOString(), false)} · rechecked at most every 15 minutes
    </p>
  );

  if (alerts === null) {
    return (
      <section className="mb-8">
        <div className="rounded-xl border-2 border-dashed border-amber-500 bg-amber-50 p-4 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Alert status unavailable</p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            The National Weather Service alert feed didn&apos;t respond. This is{" "}
            <strong>not</strong> an all-clear — there may or may not be active alerts. Check{" "}
            <a className="underline" href="https://www.weather.gov/box/">weather.gov</a> before relying on this.
          </p>
        </div>
        {checked}
      </section>
    );
  }

  if (alerts.length === 0) {
    return (
      <section className="mb-8">
        <p className="text-sm text-neutral-500">No active alerts for this area.</p>
        {checked}
      </section>
    );
  }

  return (
    <section className="mb-8 space-y-3">
      {alerts.map((alert, i) => {
        const { event, headline, severity, effective, expires } = alert.properties;
        return (
          <div
            key={`${event}-${expires}-${i}`}
            className="rounded-xl border-2 border-red-500 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950/50"
            role="alert"
          >
            <p className="font-semibold text-red-900 dark:text-red-200">
              {event}
              <span className="ml-2 text-xs font-normal uppercase tracking-wide text-red-700 dark:text-red-400">
                {severity}
              </span>
            </p>
            {headline ? (
              <p className="mt-1 text-sm text-red-800 dark:text-red-300">{headline}</p>
            ) : null}
            {/* The window this alert covers, both ends, in local time — an alert
                that ended an hour ago and one that runs through tomorrow read
                very differently, and "Until 6 AM" alone hides which is which. */}
            <p className="mt-2 text-xs text-red-700 dark:text-red-400">
              In effect {easternTime(effective)} &rarr; {easternTime(expires)} ET
            </p>
          </div>
        );
      })}
      {checked}
    </section>
  );
}

function Conditions({ weather }: { weather: Weather | null }) {
  if (!weather) {
    return (
      <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="font-medium">Current conditions are unavailable.</p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Open-Meteo didn&apos;t respond correctly. This page retries automatically — reload in a few minutes.
        </p>
      </div>
    );
  }

  const { current } = weather;
  const sky = describeCode(current.weather_code);
  const wind = degreesToCompass(current.wind_direction_10m);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Temperature" value={`${Math.round(current.temperature_2m)}°F`} />
        <Stat label="Conditions" value={sky.label} />
        <Stat label="Wind" value={`${wind} ${Math.round(current.wind_speed_10m)} mph`} />
      </div>

      {sky.precip || current.precipitation > 0 ? (
        <div className="mb-8 rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <p className="font-medium">
            {sky.intensity ? `${sky.intensity} ${sky.type.toLowerCase()}` : sky.type}
            {current.precipitation > 0 && ` · ${current.precipitation.toFixed(2)} in/hr`}
          </p>
        </div>
      ) : null}
    </>
  );
}

// Two models, two answers. They disagree by a degree or three most of the time
// and that disagreement is the interesting part, so it's shown rather than
// averaged away. NWS period 1 is the current hour, which is the nearest thing
// it has to Open-Meteo's "current".
function Comparison({ weather, forecast }: { weather: Weather | null; forecast: NwsForecast | null }) {
  // Nothing to compare and nothing to show — stay silent rather than render an
  // empty box. The two sections above have already reported their failures.
  if (!weather && !forecast) return null;

  const om = weather ? weather.current.temperature_2m : null;
  const period = forecast ? forecast.properties.periods[0] : null;
  // Unit comes from the response, not from an assumption about `units=us`.
  const nwsUnit = period ? `°${period.temperatureUnit}` : "°F";
  const diff = om !== null && period ? om - period.temperature : null;

  return (
    <section className="mb-8 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 text-sm font-medium text-neutral-500">Two models, right now</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Open-Meteo</p>
          <p className="mt-1 text-xl font-semibold">
            {om !== null ? `${om.toFixed(1)}°F` : <span className="text-neutral-400">unavailable</span>}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">NWS · this hour</p>
          <p className="mt-1 text-xl font-semibold">
            {period ? `${period.temperature}${nwsUnit}` : <span className="text-neutral-400">unavailable</span>}
          </p>
        </div>
      </div>

      {diff !== null ? (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          {Math.abs(diff) < 0.05
            ? "They agree."
            : `Open-Meteo reads ${Math.abs(diff).toFixed(1)}°F ${diff > 0 ? "warmer" : "cooler"}.`}
        </p>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          Only one source reported — no comparison to draw.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
