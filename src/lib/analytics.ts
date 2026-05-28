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

const ATTRIBUTION_KEY = "sanctum_marketing_attribution";

type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
};

function readAttributionFromUrl(): Attribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    utm_content: params.get("utm_content") || undefined,
    utm_term: params.get("utm_term") || undefined,
    referrer: document.referrer || undefined,
  };
}

function readStoredAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Attribution;
  } catch {
    return {};
  }
}

function persistAttribution(data: Attribution) {
  if (typeof window === "undefined") return;
  const hasUtm = data.utm_source || data.utm_medium || data.utm_campaign || data.utm_content || data.utm_term;
  if (!hasUtm) return;
  try {
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(data));
  } catch {
    // best-effort only
  }
}

function getAttribution(): Attribution {
  const fromUrl = readAttributionFromUrl();
  persistAttribution(fromUrl);
  const stored = readStoredAttribution();
  return {
    ...stored,
    ...fromUrl,
  };
}

/** GA4 helper for CTA attribution without breaking when gtag is unavailable. */
export function trackCta(event: CtaEvent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const attribution = getAttribution();
  window.gtag("event", "cta_click", {
    ...event,
    page_path: window.location.pathname,
    ...attribution,
  });
}
