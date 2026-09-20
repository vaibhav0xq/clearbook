import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { badRequest } from "./errors";

/**
 * The viewer is the browser session making the request. Simulated sales and generated statements
 * are private to it, so two people opening the same wallet address do not see each other's
 * simulations. The id is random, chosen by the client and sent on every request. It identifies a
 * browser, not a person. It grants nothing beyond seeing what that browser recorded.
 */
export const VIEWER_HEADER = "x-clearbook-viewer";

const VIEWER_ID = /^[A-Za-z0-9_-]{8,64}$/;

const storage = new AsyncLocalStorage<{ viewer: string | null }>();

/** Reads the viewer header and makes it available to the request through currentViewer(). */
export function viewerContext(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.header(VIEWER_HEADER);
  const viewer = raw && VIEWER_ID.test(raw) ? raw : null;
  storage.run({ viewer }, next);
}

/** The viewer of the current request. Null outside a request or when the client sent none. */
export function currentViewer(): string | null {
  return storage.getStore()?.viewer ?? null;
}

/** The viewer of the current request, for writes that must belong to one. */
export function requireViewer(): string {
  const viewer = currentViewer();
  if (!viewer) throw badRequest("This action needs a browser session. Reload the page and try again.");
  return viewer;
}
