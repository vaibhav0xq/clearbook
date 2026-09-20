import { viewerHeader } from "@/lib/viewer";

/** Absolute path of an API route under the app's base path. */
export function apiUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

/**
 * Downloads a file from the API with this browser's session id, so rows that are private to this
 * browser, such as simulated sales, are included. A plain link would not carry the id.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(apiUrl(path), { headers: viewerHeader() });
  if (!response.ok) {
    let message = `Download failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // The error body was not JSON. The status message above stands.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
