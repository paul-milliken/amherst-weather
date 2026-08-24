import { getWeather } from "@/lib/weather";
import { getNwsForecast, getNwsAlerts } from "@/lib/nws";

// Cache-warming endpoint, invoked by the Vercel Cron Job declared in
// vercel.json (0 10 * * *, i.e. 10:00 UTC daily).
//
// This is NOT how the page stays fresh — that's `revalidate = 900` on the page
// and on each fetch, giving 15-minute freshness on every real request
// regardless of this route. Vercel's Hobby plan allows only one cron
// invocation per day and rejects a more frequent cron expression at deploy
// time, so a cron job could never deliver 15-minute freshness on its own even
// if that were the goal here. What this job buys is narrower: hitting all
// three upstreams once before the morning check means that check lands on a
// warm cache instead of paying for three cold fetches.
//
// 10:00 UTC is 6:00 AM Eastern during EDT (UTC-4, roughly March-November) and
// 5:00 AM during EST (UTC-5) — the schedule doesn't shift for the clock
// change, the local time it lands at does. Hobby also doesn't guarantee the
// exact minute: cron jobs on that plan may fire any time within the scheduled
// hour, so treat "10:00 UTC" as "sometime in the 10:00-10:59 UTC hour."

// Every fetcher here already returns null instead of throwing (see
// lib/weather.ts, lib/nws.ts), so Promise.allSettled is redundant defense
// rather than the primary guard — but this route promises never to 500 on a
// failed upstream, and allSettled makes that true even if a fetcher ever
// breaks its own contract, instead of relying on every fetcher getting it
// right forever.
type SourceResult = { ok: true } | { ok: false; reason: "threw" | "returned null" };

function summarize<T>(settled: PromiseSettledResult<T | null>, label: string): SourceResult {
  if (settled.status === "rejected") {
    console.error(`${label} rejected unexpectedly during refresh (fetchers should never throw)`, settled.reason);
    return { ok: false, reason: "threw" };
  }
  if (settled.value === null) {
    return { ok: false, reason: "returned null" };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically on
  // cron-triggered invocations of this route, so this also rejects anyone who
  // finds the URL and requests it directly. An unset secret fails closed
  // rather than accepting every request — a misconfigured env var should
  // disable the endpoint, not open it.
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [weather, forecast, alerts] = await Promise.allSettled([
    getWeather(),
    getNwsForecast(),
    getNwsAlerts(),
  ]);

  const results = {
    weather: summarize(weather, "getWeather"),
    nwsForecast: summarize(forecast, "getNwsForecast"),
    nwsAlerts: summarize(alerts, "getNwsAlerts"),
  };

  return Response.json({
    checkedAt: new Date().toISOString(),
    results,
  });
}
