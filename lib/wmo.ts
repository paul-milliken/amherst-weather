// WMO weather interpretation codes -> human-readable type + intensity.
// The API gives us this code directly, so type and intensity are READ, not computed.
// Only codes that actually occur in western Massachusetts are listed.

export type Sky = {
  label: string;      // full description, e.g. "Moderate snow"
  type: string;       // "Clear" | "Cloudy" | "Fog" | "Drizzle" | "Rain" | "Snow" | "Showers" | "Thunderstorm"
  intensity: string;  // "" | "Light" | "Moderate" | "Heavy"
  precip: boolean;
};

const TABLE: Record<number, Sky> = {
  0:  { label: "Clear sky",            type: "Clear",        intensity: "",         precip: false },
  1:  { label: "Mainly clear",         type: "Clear",        intensity: "",         precip: false },
  2:  { label: "Partly cloudy",        type: "Cloudy",       intensity: "",         precip: false },
  3:  { label: "Overcast",             type: "Cloudy",       intensity: "",         precip: false },
  45: { label: "Fog",                  type: "Fog",          intensity: "",         precip: false },
  48: { label: "Freezing fog",         type: "Fog",          intensity: "",         precip: false },
  51: { label: "Light drizzle",        type: "Drizzle",      intensity: "Light",    precip: true },
  53: { label: "Moderate drizzle",     type: "Drizzle",      intensity: "Moderate", precip: true },
  55: { label: "Heavy drizzle",        type: "Drizzle",      intensity: "Heavy",    precip: true },
  56: { label: "Light freezing drizzle", type: "Drizzle",    intensity: "Light",    precip: true },
  57: { label: "Heavy freezing drizzle", type: "Drizzle",    intensity: "Heavy",    precip: true },
  61: { label: "Light rain",           type: "Rain",         intensity: "Light",    precip: true },
  63: { label: "Moderate rain",        type: "Rain",         intensity: "Moderate", precip: true },
  65: { label: "Heavy rain",           type: "Rain",         intensity: "Heavy",    precip: true },
  66: { label: "Light freezing rain",  type: "Rain",         intensity: "Light",    precip: true },
  67: { label: "Heavy freezing rain",  type: "Rain",         intensity: "Heavy",    precip: true },
  71: { label: "Light snow",           type: "Snow",         intensity: "Light",    precip: true },
  73: { label: "Moderate snow",        type: "Snow",         intensity: "Moderate", precip: true },
  75: { label: "Heavy snow",           type: "Snow",         intensity: "Heavy",    precip: true },
  77: { label: "Snow grains",          type: "Snow",         intensity: "Light",    precip: true },
  80: { label: "Light rain showers",   type: "Showers",      intensity: "Light",    precip: true },
  81: { label: "Moderate rain showers",type: "Showers",      intensity: "Moderate", precip: true },
  82: { label: "Violent rain showers", type: "Showers",      intensity: "Heavy",    precip: true },
  85: { label: "Light snow showers",   type: "Showers",      intensity: "Light",    precip: true },
  86: { label: "Heavy snow showers",   type: "Showers",      intensity: "Heavy",    precip: true },
  95: { label: "Thunderstorm",         type: "Thunderstorm", intensity: "Moderate", precip: true },
  96: { label: "Thunderstorm with hail", type: "Thunderstorm", intensity: "Heavy",  precip: true },
  99: { label: "Thunderstorm with heavy hail", type: "Thunderstorm", intensity: "Heavy", precip: true },
};

const UNKNOWN: Sky = { label: "Unknown", type: "Unknown", intensity: "", precip: false };

export function describeCode(code: number | null | undefined): Sky {
  if (code === null || code === undefined) return UNKNOWN;
  return TABLE[code] ?? UNKNOWN;
}
