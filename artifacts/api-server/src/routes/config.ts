import { Router, type IRouter } from "express";
import { GetAppConfigResponse, ListAssetsResponse, ListIssuersResponse } from "@workspace/api-zod";
import { ISSUERS, listAssets, listDemoWallets } from "@workspace/ledger";
import { env } from "../lib/env";
import { probeSources, pythState, sourceHealth, type SourceHealth } from "../services/pricing";

const router: IRouter = Router();

/** Probe budget for `?probe=true`. Long enough for one round trip to each source on a cold instance. */
const PROBE_BUDGET_MS = 3_500;

/**
 * Status of a keyless source from what this instance has observed. A failure newer than the last
 * good answer reports unavailable; nothing observed yet says so instead of guessing.
 */
function keylessSource(id: string, label: string, role: string, health: SourceHealth) {
  // A good answer clears the error, so a present error is the latest observation.
  if (health.lastError !== null) {
    return { id, label, mode: "unavailable", detail: `${role} The latest request failed. Cached prices serve until it answers again.` };
  }
  if (health.lastOkAt === null) {
    return { id, label, mode: "unknown", detail: `${role} No answer from this instance yet.` };
  }
  return { id, label, mode: "live", detail: role };
}

router.get("/config", async (req, res) => {
  // A status page asks for observed state; other callers get the cheap answer.
  if (String(req.query.probe) === "true") await probeSources(PROBE_BUDGET_MS);
  const pyth = pythState();
  const health = sourceHealth();
  const sources = [
    {
      id: "solana_rpc",
      label: "Solana RPC",
      mode: env.rpcConfigured ? "live" : "fallback",
      detail: env.rpcConfigured ? "Configured RPC provider." : "Public mainnet endpoint. Rate limited and shallow history.",
    },
    {
      id: "pyth",
      label: "Pyth",
      // The last error clears on a good answer, so a present error is the latest observation,
      // whether or not the key was accepted before.
      mode: !pyth.configured || pyth.authorized === false || pyth.lastError ? "unavailable" : pyth.authorized ? "live" : "unknown",
      detail: !pyth.configured
        ? "This source is not configured. Marks fall back to Jupiter and PreStocks."
        : pyth.authorized === false
          ? "Key rejected by Pyth."
          : pyth.lastError
            ? "The latest request failed. Marks fall back to Jupiter and PreStocks until it answers again."
            : pyth.authorized
              ? pyth.deniedFeeds > 0
                ? `Pyth Pro key active. The plan covers ${pyth.coveredFeeds} of the ${pyth.coveredFeeds + pyth.deniedFeeds} feeds requested so far; the rest fall back to Jupiter and PreStocks.`
                : "Pyth Pro feeds for wrapper tokens and reference equities."
              : "Key present. No answer from this instance yet.",
    },
    keylessSource("jupiter", "Jupiter", "Keyless price and swap API. Second pricing source after Pyth, also read for multipliers and sell routes.", health.jupiter),
    keylessSource("prestocks", "PreStocks", "Keyless mark and token prices for pre IPO tokens. Third pricing source, used for PreStocks mints.", health.prestocks),
    {
      id: "notary",
      label: "Notarization",
      mode: "live",
      detail: "Your wallet signs a memo transaction with the statement hash. No server key is held.",
    },
  ];
  const demoWallets = listDemoWallets().map((w) => ({
    id: w.id,
    label: w.label,
    description: w.description,
    holdingsPreview: w.holdingsPreview,
  }));
  res.json(
    GetAppConfigResponse.parse({
      appName: "Clearbook",
      cluster: env.cluster,
      appUrl: env.appUrl,
      rpcUrlPublic: env.rpcUrlPublic,
      sources,
      demoWallets,
      defaultMethod: "fifo",
      walletConnectEnabled: true,
    }),
  );
});

router.get("/issuers", (_req, res) => {
  const assets = listAssets();
  const items = ISSUERS.map((issuer) => ({
    ...issuer,
    assetCount: assets.filter((a) => a.issuer === issuer.id).length,
  }));
  res.json(ListIssuersResponse.parse(items));
});

router.get("/assets", (_req, res) => {
  res.json(ListAssetsResponse.parse(listAssets().filter((a) => a.verified)));
});

export default router;
