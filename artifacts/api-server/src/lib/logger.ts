import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Removes anything that could be a credential from free text before it reaches a log line or a
 * response: query strings on URLs (provider keys travel there), key=value pairs whose name looks
 * like a secret and userinfo inside URLs.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/gi, "$1?[redacted]")
    .replace(/\b((?:api[-_]?)?key|token|secret|password|authorization|auth)=[^&\s"']+/gi, "$1=[redacted]");
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  serializers: {
    err(error: unknown) {
      if (!(error instanceof Error)) return { type: typeof error, message: scrubSecrets(String(error)) };
      return {
        type: error.name,
        message: scrubSecrets(error.message),
        ...(error.stack && !isProduction ? { stack: scrubSecrets(error.stack) } : {}),
      };
    },
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
