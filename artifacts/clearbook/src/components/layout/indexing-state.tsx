import { EmptyState } from "@/components/surface";

/** Shown in place of an empty ledger while the first index of a wallet is still running. */
export function IndexingState({ what }: { what: string }) {
  return (
    <EmptyState
      title="Indexing this wallet"
      description={`Reading its transaction history from Solana. ${what} will appear here when indexing finishes, usually within a minute.`}
    />
  );
}
