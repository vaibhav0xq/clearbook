import { QueryClient } from "@tanstack/react-query";

/**
 * Every wallet scoped query key starts with `/api/wallets/{address}`. After a
 * mutation that changes the ledger (a simulated sale, a confirmed swap, a
 * re-index) the whole family is stale, so it is invalidated by prefix.
 */
export function invalidateWalletQueries(queryClient: QueryClient, address: string) {
  const prefix = `/api/wallets/${address}`;
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const first = query.queryKey[0];
      return typeof first === "string" && (first === prefix || first.startsWith(`${prefix}/`));
    },
  });
}
