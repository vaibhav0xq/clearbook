/**
 * Runtime configuration. Every key is optional: when a key is missing the
 * matching source reports itself as unavailable and the app keeps working
 * with the remaining sources or the demo ledger.
 */
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
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
  /** RPC the browser may use to send signed transactions. Never contains server keys. */
  get rpcUrlPublic(): string {
    return read("PUBLIC_SOLANA_RPC_URL") ?? read("VITE_SOLANA_RPC_URL") ?? DEFAULT_RPC;
  },
  get pythApiKey(): string | undefined {
    return read("PYTH_API_KEY");
  },
  get pythBaseUrl(): string {
    return read("PYTH_LAZER_URL") ?? "https://pyth-lazer.dourolabs.app";
  },
  get appUrl(): string {
    return read("APP_URL") ?? (read("REPLIT_DEV_DOMAIN") ? `https://${read("REPLIT_DEV_DOMAIN")}` : "http://localhost:5173");
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
