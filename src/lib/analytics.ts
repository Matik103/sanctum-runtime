type CtaEvent = {
  location: string;
  cta: string;
  destination: string;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** GA4 helper for CTA attribution without breaking when gtag is unavailable. */
export function trackCta(event: CtaEvent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "cta_click", event);
}
