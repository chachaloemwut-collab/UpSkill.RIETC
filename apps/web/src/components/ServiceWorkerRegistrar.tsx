"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds (installable app + offline notice). Never in development: it would cache dev assets. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* unsupported or blocked (private mode, in-app browsers): the site works the same without it */
    });
  }, []);
  return null;
}
