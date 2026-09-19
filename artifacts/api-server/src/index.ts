import app from "./app";
import { logger } from "./lib/logger";
import { warmPricing } from "./services/pricing";
import { warmDemoLedgers } from "./services/portfolio";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Both warm ups are independent. Upstream requests for the same mint are shared, so running
  // them together does not repeat work.
  void Promise.all([warmPricing(), warmDemoLedgers()]);
});
