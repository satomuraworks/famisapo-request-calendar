export const ANALYTICS_CONSENT_STORAGE_KEY = "famisapo-request-calendar.analytics-consent.v1";

const MEASUREMENT_ID = "G-T3CTY70GKZ";
let analyticsIsInitialized = false;

export function getAnalyticsConsent(storage = window.localStorage) {
  try {
    const consent = storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return consent === "granted" || consent === "denied" ? consent : null;
  } catch {
    return null;
  }
}

export function saveAnalyticsConsent(consent, storage = window.localStorage) {
  if (consent !== "granted" && consent !== "denied") return false;
  try {
    storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
    return true;
  } catch {
    return false;
  }
}

export function initializeAnalytics() {
  if (getAnalyticsConsent() !== "granted") return;

  if (analyticsIsInitialized) {
    window.gtag("consent", "update", { analytics_storage: "granted" });
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.append(script);
  analyticsIsInitialized = true;
}

export function disableAnalytics() {
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", { analytics_storage: "denied" });
  }
  document.cookie.split(";").forEach((cookie) => {
    const name = cookie.trim().split("=")[0];
    if (name.startsWith("_ga")) document.cookie = `${name}=; Max-Age=0; path=/`;
  });
}

export function trackAnalyticsEvent(name) {
  if (getAnalyticsConsent() !== "granted") return;
  initializeAnalytics();
  if (typeof window.gtag === "function") window.gtag("event", name);
}
