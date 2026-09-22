import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./lib/errors";
import { viewerContext } from "./lib/viewer";

const app: Express = express();

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
app.use(cors());
// Ledger and asset responses are large JSON that compresses about ten to one.
app.use(compression({ threshold: 1024 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(viewerContext);

app.use("/api", router);
app.use("/api", (req, res) => {
  res.status(404).json({ code: "not_found", message: "No such API route.", details: { method: req.method, path: req.originalUrl.split("?")[0] } });
});
app.use(errorHandler);

export default app;
