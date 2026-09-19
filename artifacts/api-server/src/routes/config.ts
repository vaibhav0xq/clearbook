import { Router, type IRouter } from "express";
import { GetAppConfigResponse, ListAssetsResponse, ListIssuersResponse } from "@workspace/api-zod";
import { ISSUERS, listAssets, listDemoWallets } from "@workspace/ledger";
import { env } from "../lib/env";
import { pythState } from "../services/pricing";

const router: IRouter = Router();

router.get("/config", (_req, res) => {
  const pyth = pythState();
  const sources = [
    {
      id: "solana_rpc",
      label: "Solana RPC",
      mode: env.rpcConfigured ? "live" : "fallback",
      detail: env.rpcConfigured ? "Configured RPC provider." : "Public mainnet endpoint. Rate limited and shallow history.",
      requiredEnv: ["SOLANA_RPC_URL", "HELIUS_API_KEY"],
    },
    {
      id: "pyth",
      label: "Pyth",
      mode: !pyth.configured ? "unavailable" : pyth.authorized === false ? "unavailable" : "live",
      detail: !pyth.configured
        ? "No PYTH_API_KEY. Marks fall back to Jupiter and PreStocks."
        : pyth.authorized === false
          ? "Key rejected by Pyth."
          : pyth.authorized
            ? "Pyth Pro feeds for wrapper tokens and reference equities."
            : "Key present. Waiting for the first request.",
      requiredEnv: ["PYTH_API_KEY"],
    },
    { id: "jupiter", label: "Jupiter", mode: "fallback", detail: "Keyless price and swap API. Used for marks, multipliers and sell routes.", requiredEnv: [] },
    { id: "prestocks", label: "PreStocks", mode: "fallback", detail: "Keyless mark and token prices for pre-IPO tokens.", requiredEnv: [] },
    {
      id: "notary",
      label: "Notarization",
      mode: "live",
      detail: "Your wallet signs a memo transaction with the statement hash. No server key is held.",
      requiredEnv: [],
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
