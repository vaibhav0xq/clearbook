import { getGetWalletStatusQueryKey, useGetWalletStatus } from "@workspace/api-client-react";

/**
 * Whether the wallet is being indexed right now. Shares the status query the shell polls, so a
 * page can show an indexing state instead of an empty ledger without another request.
 */
export function useWalletIndexing(address: string): boolean {
  const { data } = useGetWalletStatus(address, { query: { queryKey: getGetWalletStatusQueryKey(address), enabled: address.length > 0 } });
  return data?.state === "indexing";
}
