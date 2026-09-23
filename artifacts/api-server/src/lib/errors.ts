import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger, scrubSecrets } from "./logger";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class UpstreamStatusError extends Error {
  public readonly host: string;
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    const host = new URL(url).host;
    super(`Upstream ${host} returned ${status}`);
    this.host = host;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(400, "bad_request", message, details);
export const notFound = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(404, "not_found", message, details);
export const forbidden = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(403, "forbidden", message, details);
export const conflict = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(409, "conflict", message, details);
export const upstream = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(502, "upstream_error", message, details);
export const unauthorizedUpstream = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(502, "upstream_unauthorized", message, details);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    // Messages on our own errors are authored for the reader. Anything interpolated from a
    // provider is scrubbed so a credential can never ride along.
    if (err.status >= 500) logger.error({ err, code: err.code, path: req.path }, "Request failed");
    res.status(err.status).json({ code: err.code, message: scrubSecrets(err.message), details: err.details });
    return;
  }
  if (err instanceof UpstreamStatusError) {
    logger.warn({ path: req.path, upstream: err.host, status: err.status }, "Upstream request failed");
    res.status(502).json({ code: "upstream_error", message: err.message, details: { upstream: err.host, status: err.status } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ code: "validation_error", message: "Request failed validation.", details: { issues: err.issues } });
    return;
  }
  // Unexpected failures stay inside the log. The reader gets a generic answer, never a stack,
  // a path or a database message.
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ code: "internal_error", message: "The request could not be completed." });
}
