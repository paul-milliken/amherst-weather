// National Weather Service API — hourly gridpoint forecast and active zone alerts.
//
// Same posture as lib/weather.ts: no API key, both fetchers return null on ANY
// failure, nothing throws. See that file for the reasoning.
//
// NWS requires a User-Agent identifying the app with contact info; requests
// without one are rejected. There is no published rate limit — instead the API
// returns 429 when it decides you're being greedy and asks you to back off for
// ~5 seconds. We don't retry: with revalidate=900 the next render picks up
// fresh data anyway, and hammering a throttled endpoint is how you get blocked.
//
// Gridpoint BOX/22,93 and zone MAZ010 are Amherst, MA (42.3732, -72.5199),
// resolved once from https://api.weather.gov/points/42.3732,-72.5199. The
// gridpoint is stable but not eternal — if NWS re-grids the BOX office these
// URLs start 404ing and need looking up again.

const USER_AGENT = "amherst-weather (paulmilliken.com, paulmilliken08@gmail.com)";

// See lib/weather.ts for why every fetch carries a deadline.
const TIMEOUT_MS = 5000;

// `units=us` is passed explicitly rather than relying on the default: the
// endpoint honours it (units=si comes back in C and km/h, and a bogus value
// 400s with an enumeration error, so the parameter is genuinely read). Pinning
// it means a change to the server-side default can't silently turn every
// temperature on the page into Celsius while still typechecking.
const FORECAST_ENDPOINT =
  "https://api.weather.gov/gridpoints/BOX/22,93/forecast/hourly?units=us";
const ALERTS_ENDPOINT = "https://api.weather.gov/alerts/active/zone/MAZ010";

// One hour of the hourly forecast. Temperatures come back in F for this office
// (`temperatureUnit` says which); `windSpeed` is a human string like "6 mph",
// not a number, so treat it as a label rather than something to do math on.
export type NwsPeriod = {
  number: number;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation: { unitCode: string; value: number | null };
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
};

export type NwsForecast = {
  properties: {
    generatedAt: string;
    updateTime: string;
    periods: NwsPeriod[];
  };
};

// `headline` is genuinely null for some alert types — don't tighten it.
// `severity` is an NWS enum ("Extreme" | "Severe" | "Moderate" | "Minor" |
// "Unknown") but is typed loosely here so an unfamiliar value renders instead
// of failing the shape check.
export type NwsAlertProperties = {
  event: string;
  headline: string | null;
  severity: string;
  effective: string;
  expires: string;
};

export type NwsAlertFeature = { properties: NwsAlertProperties };

// Returns null on ANY failure — network error, timeout, 429, other non-200,
// malformed body. Callers render their own unhappy path.
export async function getNwsForecast(): Promise<NwsForecast | null> {
  try {
    const res = await fetch(FORECAST_ENDPOINT, {
      next: { revalidate: 900 }, // 15 minutes, matching lib/weather.ts
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
    });

    if (res.status === 429) {
      console.error("NWS forecast rate-limited (429) — backing off, not retrying");
      return null;
    }

    if (!res.ok) {
      console.error(`NWS forecast returned ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as Partial<NwsForecast>;

    // Shape check on the fields we actually read. A 200 with the wrong body is
    // a real failure mode.
    const periods = data?.properties?.periods;
    if (
      !Array.isArray(periods) ||
      periods.length === 0 ||
      typeof periods[0]?.temperature !== "number" ||
      typeof periods[0]?.startTime !== "string"
    ) {
      console.error("NWS forecast returned an unexpected shape", data);
      return null;
    }

    return data as NwsForecast;
  } catch (err) {
    console.error("NWS forecast fetch failed", err);
    return null;
  }
}

// Returns null on failure, and an EMPTY ARRAY when there are simply no active
// alerts — which is the normal case most days. Callers must distinguish the
// two: [] means "nothing to warn about", null means "we don't know". Rendering
// "no alerts" on a null would be a lie about a safety-relevant feed.
export async function getNwsAlerts(): Promise<NwsAlertFeature[] | null> {
  try {
    const res = await fetch(ALERTS_ENDPOINT, {
      // 15 minutes of staleness on a safety feed is a deliberate accepted
      // tradeoff, not an oversight. This is a personal page checked once or
      // twice a day; the real safety channel for severe weather is NWS Wireless
      // Emergency Alerts on the phone, which push in seconds and don't depend
      // on anyone loading this URL. This section is context, not the thing you
      // rely on to take shelter.
      //
      // Lowering it wouldn't be free either: the page-level revalidate governs
      // the whole render, so freshening alerts alone would refetch all three
      // sources every time.
      //
      // The mitigation is honesty about age rather than fetching more often —
      // app/page.tsx renders each alert's effective/expires window and a
      // "checked at" timestamp, so a stale read is visible as stale.
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
    });

    if (res.status === 429) {
      console.error("NWS alerts rate-limited (429) — backing off, not retrying");
      return null;
    }

    if (!res.ok) {
      console.error(`NWS alerts returned ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as { features?: unknown };

    // The envelope must be right or we don't know anything.
    if (!Array.isArray(data?.features)) {
      console.error("NWS alerts returned an unexpected shape", data);
      return null;
    }

    // Individual features are checked and skipped rather than failing the whole
    // call: dropping a valid severe-weather warning because some sibling alert
    // came back malformed is the worse of the two failures.
    const features: NwsAlertFeature[] = [];
    for (const feature of data.features) {
      const p = (feature as Partial<NwsAlertFeature>)?.properties;
      if (
        typeof p?.event !== "string" ||
        typeof p?.severity !== "string" ||
        typeof p?.effective !== "string" ||
        typeof p?.expires !== "string"
      ) {
        console.error("NWS alert feature had an unexpected shape, skipping", feature);
        continue;
      }
      features.push({
        properties: {
          event: p.event,
          headline: typeof p.headline === "string" ? p.headline : null,
          severity: p.severity,
          effective: p.effective,
          expires: p.expires,
        },
      });
    }

    return features;
  } catch (err) {
    console.error("NWS alerts fetch failed", err);
    return null;
  }
}
