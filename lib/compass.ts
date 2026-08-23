// The API returns wind direction in DEGREES (0-360). This is the one value on the
// page that is genuinely derived rather than read straight from the response.
//
// 16 points, each covering 22.5 degrees. Offset by half a sector so that
// 0 degrees lands in the middle of "N" rather than on its edge.

const POINTS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
] as const;

export type CompassPoint = (typeof POINTS)[number];

export function degreesToCompass(deg: number | null | undefined): CompassPoint | "—" {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return "—";
  const normalized = ((deg % 360) + 360) % 360;      // handle negatives and >360
  const index = Math.round(normalized / 22.5) % 16;  // 22.5 = 360/16
  return POINTS[index];
}

// Sanity checks, for when you rewrite this yourself:
//   0   -> "N"      90  -> "E"     180 -> "S"     270 -> "W"
//   315 -> "NW"     349 -> "N"     350 -> "N"     11  -> "N"
//   12  -> "NNE"    -45 -> "NW"    360 -> "N"
