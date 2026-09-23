import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./lib/errors";
import { viewerContext } from "./lib/viewer";
import { env } from "./lib/env";

const app: Express = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// The site and the API share one host on every deployment (production, preview and local), so
// a browser origin is trusted when it names the host that received the request or the configured
// app URL. Nothing else may read the API from a page or send it a write.
const trustedOrigins = new Set([new URL(env.appUrl).origin, "http://localhost:5173", "http://localhost:3000"]);
function originTrusted(req: express.Request, origin: string | undefined): boolean {
  if (!origin) return true; // same origin navigations, server calls and command line clients
  if (trustedOrigins.has(origin)) return true;
  // Behind a proxy the public host arrives in X-Forwarded-Host; the Host header names the process.
  const hosts = [req.get("x-forwarded-host"), req.get("host")].filter((h): h is string => !!h);
  return hosts.some((host) => origin === `https://${host}` || origin === `http://${host}`);
}
app.use(
  cors((req, callback) =>
    callback(null, {
      origin: originTrusted(req, req.header("origin")),
      methods: ["GET", "HEAD", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Clearbook-Viewer"],
      maxAge: 600,
    }),
  ),
);
// Cross site request forgery guard: a write must come from a trusted origin. Reads from other
// origins get no CORS headers above, so a foreign page cannot see their answers either.
app.use("/api", (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || originTrusted(req, req.header("origin"))) return next();
  res.status(403).json({ code: "forbidden", message: "This origin is not allowed." });
});
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 50 }));
app.use(viewerContext);

const writeWindows = new Map<string, { start: number; count: number }>();
app.use("/api", (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const now = Date.now();
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const current = writeWindows.get(key);
  const window = !current || now - current.start >= 60_000 ? { start: now, count: 0 } : current;
  window.count += 1;
  writeWindows.set(key, window);
  if (window.count > 30) {
    res.setHeader("Retry-After", String(Math.ceil((window.start + 60_000 - now) / 1000)));
    res.status(429).json({ code: "rate_limited", message: "Too many write requests. Try again shortly." });
    return;
  }
  next();
});

app.use("/api", router);
app.use("/api", (req, res) => {
  res.status(404).json({ code: "not_found", message: "No such API route.", details: { method: req.method, path: req.originalUrl.split("?")[0] } });
});
app.use(errorHandler);

export default app;
