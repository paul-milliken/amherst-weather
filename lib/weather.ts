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
