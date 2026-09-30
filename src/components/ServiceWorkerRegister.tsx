"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js app-wide. Mounted once from the root layout.
 *
 * Silent by design: registration failing (unsupported browser, private
 * mode blocking it, etc.) should never surface as an error to the person —
 * the app works the same either way, it just won't get push notifications.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Swallowed on purpose — see comment above.
    });
  }, []);

  return null;
}
