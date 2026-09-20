import { setDefaultHeadersGetter } from "@workspace/api-client-react";

/**
 * Simulated sales and generated statements are private to this browser. The API tells browsers
 * apart by a random id that is created once and kept in local storage. It names a browser, not
 * a person. It grants nothing beyond seeing what this browser recorded.
 */
const STORAGE_KEY = "clearbook.viewer";
const HEADER = "x-clearbook-viewer";

let cached: string | null = null;

function randomId(): string {
  // randomUUID needs a secure context. Older browsers and plain http previews still have getRandomValues.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The id of this browser, created on first use. Falls back to a per-page id when storage is unavailable. */
export function viewerId(): string {
  if (cached) return cached;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) {
      cached = stored;
      return stored;
    }
    cached = randomId();
    window.localStorage.setItem(STORAGE_KEY, cached);
  } catch {
    cached = randomId();
  }
  return cached;
}

/** Sends the id with every API request. Called once at startup. */
export function installViewerHeader(): void {
  setDefaultHeadersGetter(() => ({ [HEADER]: viewerId() }));
}
