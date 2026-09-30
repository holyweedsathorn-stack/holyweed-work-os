/**
 * Distance between two points on the earth, in metres (haversine).
 *
 * Accurate to well under a metre at the distances that matter here, and it
 * needs no PostGIS — the comparison happens in the server action, where both
 * points are already in hand.
 */
export function distanceMetres(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371008.8; // mean earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** What the phone reported. `accuracy` is the radius of uncertainty, metres. */
export type Fix = { lat: number; lng: number; accuracy: number };

/**
 * A fix worse than this is not a location, it's a guess at a neighbourhood.
 * Rather than pretend, the clock refuses and tells the person to step outside.
 */
export const MAX_USABLE_ACCURACY_M = 500;

export type GeoVerdict =
  | { ok: true; distance: number | null }
  | { ok: false; error: string; distance: number | null; reason: "no_fix" | "too_vague" | "too_far" };

/**
 * Decide whether a clock-in at `fix` is close enough to `branch`.
 *
 * A branch with no coordinates is never checked — that is what keeps a fresh
 * deploy from locking the whole team out before the owner has stood in each
 * shop and pressed "Set location".
 *
 * The phone's own error margin is subtracted before comparing, so a reading of
 * "250m away, give or take 300m" is accepted: the person may well be at the
 * till. Precision cuts both ways and this errs toward the honest majority.
 */
export function checkFix(
  branch: { name: string; lat: number | null; lng: number | null; geofence_m: number },
  fix: Fix | null
): GeoVerdict {
  if (branch.lat == null || branch.lng == null) return { ok: true, distance: null };

  if (!fix) {
    return {
      ok: false,
      reason: "no_fix",
      distance: null,
      error:
        "Turn on location for this site and try again — clocking in only works at the shop.",
    };
  }

  const distance = distanceMetres(fix.lat, fix.lng, branch.lat, branch.lng);

  if (fix.accuracy > MAX_USABLE_ACCURACY_M) {
    return {
      ok: false,
      reason: "too_vague",
      distance,
      error: `Your phone can only place you to within ${Math.round(fix.accuracy)}m, which isn't precise enough. Step outside or next to a window and try again.`,
    };
  }

  const effective = Math.max(0, distance - fix.accuracy);
  if (effective > branch.geofence_m) {
    return {
      ok: false,
      reason: "too_far",
      distance,
      error: `You look like you're about ${fmtDistance(distance)} from ${branch.name}. Clocking in only works at the shop — ask a manager if you think this is wrong.`,
    };
  }

  return { ok: true, distance };
}

export function fmtDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}
