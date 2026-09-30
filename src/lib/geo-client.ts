"use client";

import type { Fix } from "@/lib/geo";

/**
 * Ask the phone where it is.
 *
 * Never throws and never rejects: on a denial, a timeout, or a device with no
 * GPS it resolves to null and the caller decides what that means. The clock
 * screen sends null to the server rather than refusing locally, because a
 * branch with no location set must still let people clock in.
 */
export function getFix(timeoutMs = 12000): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (v: Fix | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    // Belt and braces: some Android browsers never call either callback.
    const timer = setTimeout(() => done(null), timeoutMs + 1000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 9999,
        });
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}
