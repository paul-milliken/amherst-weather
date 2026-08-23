import { getWeather } from "@/lib/weather";
import { describeCode } from "@/lib/wmo";
import { degreesToCompass } from "@/lib/compass";
import HourlyChart from "@/components/HourlyChart";

// Re-fetch at most every 15 minutes. Vercel serves the cached render in between.
export const revalidate = 900;

export default async function Page() {
  const data = await getWeather();

  // The unhappy path. Renders when the API is down, slow, rate-limited,
  // or returns a body we don't recognise. Never a crash, never a blank screen.
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Amherst, MA</h1>
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium">Weather data is unavailable right now.</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            The forecast service didn&apos;t respond correctly. This page retries automatically — reload in a few minutes.
          </p>
        </div>
      </main>
    );
  }

  const { current, hourly } = data;
  const sky = describeCode(current.weather_code);
  const wind = degreesToCompass(current.wind_direction_10m);
  const updated = new Date(current.time).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Amherst, MA</h1>
        <p className="text-sm text-neutral-500">Today · updated {updated}</p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Temperature" value={`${Math.round(current.temperature_2m)}°F`} />
        <Stat label="Conditions" value={sky.label} />
        <Stat
          label="Wind"
          value={`${wind} ${Math.round(current.wind_speed_10m)} mph`}
        />
      </div>

      {sky.precip || current.precipitation > 0 ? (
        <div className="mb-8 rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <p className="font-medium">
            {sky.intensity ? `${sky.intensity} ${sky.type.toLowerCase()}` : sky.type}
            {current.precipitation > 0 && ` · ${current.precipitation.toFixed(2)} in/hr`}
          </p>
        </div>
      ) : null}

      <div className="space-y-6">
        <HourlyChart
          label="Temperature through the day"
          times={hourly.time}
          values={hourly.temperature_2m}
          unit="°F"
          accent="#e07a3f"
        />
        <HourlyChart
          label="Wind speed through the day"
          times={hourly.time}
          values={hourly.wind_speed_10m}
          unit=" mph"
          accent="#3f7ae0"
        />
      </div>

      <footer className="mt-10 text-xs text-neutral-500">
        Weather data by <a className="underline" href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0).
      </footer>
    </main>
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
