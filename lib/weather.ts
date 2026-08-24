// Single source of truth for the Open-Meteo call.
//
// Open-Meteo needs no API key. Free tier: 10,000 calls/day.
// NOTE: the free tier is NON-COMMERCIAL ONLY. Do not carry this dependency
// into paid client work without moving to a paid plan.
//
// With `timezone` set, `forecast_days=1` returns the LOCAL calendar day,
// midnight to midnight, which is what the spec asks for.

const PARAMS = new URLSearchParams({
  latitude: "42.3732",
  longitude: "-72.5199",
  current: "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
  hourly: "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
  temperature_unit: "fahrenheit",
  wind_speed_unit: "mph",
  timezone: "America/New_York",
  forecast_days: "1",
});

const ENDPOINT = `https://api.open-meteo.com/v1/forecast?${PARAMS}`;

// Identifies the app and gives the upstream someone to contact if this page
// ever misbehaves. Open-Meteo doesn't require it; NWS does (see lib/nws.ts).
const USER_AGENT = "amherst-weather (paulmilliken.com, paulmilliken08@gmail.com)";

// A hang is a failure mode too, and the worst-behaved one: without a deadline
// the try/catch below never fires, the awaiting server component never
// resolves, and the page hangs for as long as the upstream stays silent.
// AbortSignal.timeout makes fetch reject with a TimeoutError, which lands in
// the catch and returns null like any other failure.
const TIMEOUT_MS = 5000;

export type Current = {
  time: string;
  temperature_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
};

export type Hourly = {
  time: string[];
  temperature_2m: (number | null)[];
  precipitation: (number | null)[];
  weather_code: (number | null)[];
  wind_speed_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
};

export type Weather = { current: Current; hourly: Hourly };

// Open-Meteo, called with `timezone=America/New_York`, returns every timestamp
// as a WALL-CLOCK string with no UTC offset — "2026-08-23T00:00", not
// "...T00:00-05:00". The API already did the timezone conversion; the string
// IS the local time in Amherst.
//
// That makes `new Date(iso)` the wrong tool: `Date` treats an offset-less ISO
// string as UTC, so downstream `toLocaleTimeString(..., { timeZone:
// "America/New_York" })` calls apply a SECOND timezone conversion on top of
// the one the API already applied. Locally this can go unnoticed if your
// machine happens to be near UTC-0, but Vercel's runtime is UTC, so every
// displayed hour silently shifts back by the ET offset (4-5 hours) — midnight
// renders as 8 PM the day before. Nothing throws; it just quietly lies.
//
// The fix is to never round-trip these strings through `Date` — read the hour
// and minute straight out of the string instead. Don't "simplify" these back
// into `new Date(...).toLocaleTimeString(...)`; that's the bug.
//
// NWS timestamps are the opposite case (see lib/nws.ts): they carry a real
// offset, e.g. "2026-08-23T20:38:00-04:00", so `new Date` parses them
// correctly regardless of the server's local timezone, and re-formatting with
// `timeZone: "America/New_York"` there is the right thing to do. The two
// sources need different handling because they hand back different string
// shapes, not because one function is better than the other.

// "2026-08-23T20:45" -> "8:45 PM". Matches the hour/minute formatting
// `toLocaleTimeString` would produce, without parsing the string as a Date.
export function formatOpenMeteoClock(wallClock: string): string {
  const hour = Number(wallClock.slice(11, 13));
  const minute = wallClock.slice(14, 16);
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

// "2026-08-23T00:00" -> "12 AM". Used for the hourly chart's axis labels,
// which only need the hour.
export function formatOpenMeteoHour(wallClock: string): string {
  const hour = Number(wallClock.slice(11, 13));
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

// Returns null on ANY failure — network error, timeout, non-200, malformed body.
// The page is responsible for rendering something sensible when it gets null.
// Never throw from here: an unhandled throw becomes a 500 and the user sees nothing.
export async function getWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: 900 }, // 15 minutes
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });

    if (!res.ok) {
      console.error(`Open-Meteo returned ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as Partial<Weather>;

    // Shape check. A 200 with the wrong body is a real failure mode —
    // APIs return error objects with 200 status more often than you'd think.
    if (
      !data?.current ||
      typeof data.current.temperature_2m !== "number" ||
      !Array.isArray(data?.hourly?.time) ||
      data.hourly.time.length === 0
    ) {
      console.error("Open-Meteo returned an unexpected shape", data);
      return null;
    }

    return data as Weather;
  } catch (err) {
    console.error("Open-Meteo fetch failed", err);
    return null;
  }
}
