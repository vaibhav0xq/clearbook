/**
 * Runtime configuration. Every key is optional: when a key is missing the
 * matching source reports itself as unavailable and the app keeps working
 * with the remaining sources or the demo ledger.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/**
 * Loads the nearest .env file above the working directory. Values already
 * present in the environment win, so hosted deployments are unaffected.
 */
function loadDotenv(): void {
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch {
        // A malformed file should not stop the server. Missing keys are reported per source.
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

loadDotenv();

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function publicRpcUrl(): string {
  const configured = read("PUBLIC_SOLANA_RPC_URL");
  if (!configured) return DEFAULT_RPC;
  try {
    const url = new URL(configured);
    // Providers put keys in query strings and in paths, so only a bare https origin is accepted.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return DEFAULT_RPC;
    return url.toString();
  } catch {
    return DEFAULT_RPC;
  }
}

export const env = {
  get heliusApiKey(): string | undefined {
    return read("HELIUS_API_KEY");
  },
  /** RPC used by the server for indexing and account reads. */
  get rpcUrl(): string {
    const explicit = read("SOLANA_RPC_URL");
    if (explicit) return explicit;
    const helius = read("HELIUS_API_KEY");
    if (helius) return `https://mainnet.helius-rpc.com/?api-key=${helius}`;
    return DEFAULT_RPC;
  },
  /** True when the RPC is a configured provider rather than the public endpoint. */
  get rpcConfigured(): boolean {
    return !!(read("SOLANA_RPC_URL") || read("HELIUS_API_KEY"));
  },
  /**
   * Requests per second sent to a configured provider, counting every row of a batch. The Helius
   * free plan advertises 10 per second but in measurement sustains 5 rows per second without a
   * 429, allows bursts of about 20 and rejects any batch above that outright. Raise this on a
   * paid plan.
   */
  get rpcRequestsPerSecond(): number {
    const v = Number(read("RPC_REQUESTS_PER_SECOND"));
    return Number.isFinite(v) && v > 0 ? v : 5;
  },
  /** RPC the browser may use to send signed transactions. Never contains server keys. */
  get rpcUrlPublic(): string {
    return publicRpcUrl();
  },
  get pythApiKey(): string | undefined {
    return read("PYTH_API_KEY");
  },
  get pythBaseUrl(): string {
    return read("PYTH_LAZER_URL") ?? "https://pyth-lazer.dourolabs.app";
  },
  /** Public origin of the app. Hosts that publish their own domain in the environment are read as fallbacks. */
  get appUrl(): string {
    const explicit = read("APP_URL");
    if (explicit) return explicit;
    const vercel = read("VERCEL_PROJECT_PRODUCTION_URL");
    if (vercel) return `https://${vercel}`;
    const published = read("REPLIT_DOMAINS")?.split(",")[0]?.trim();
    if (published) return `https://${published}`;
    const dev = read("REPLIT_DEV_DOMAIN");
    return dev ? `https://${dev}` : "http://localhost:5173";
  },
  get cluster(): string {
    return read("SOLANA_CLUSTER") ?? "mainnet-beta";
  },
  get maxSignatures(): number {
    return Number(read("INDEXER_MAX_SIGNATURES") ?? 400);
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
