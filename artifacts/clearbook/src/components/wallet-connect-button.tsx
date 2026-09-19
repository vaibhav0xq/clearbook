import { useState } from "react";
import { useWalletSession } from "@/lib/wallet";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function WalletConnectButton({ className }: { className?: string }) {
  const wallet = useWalletSession();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await wallet.connect();
    } catch (e) {
      console.error("Failed to connect wallet", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await wallet.disconnect();
  };

  if (!wallet.available) {
    return null;
  }

  if (wallet.connected) {
    return (
      <button
        type="button"
        onClick={handleDisconnect}
        title="Disconnect wallet"
        className={cn(
          "group inline-flex h-9 items-center gap-2 rounded-full border hairline bg-white/[0.03] px-3.5 num text-[12px] text-foreground transition-colors hover:border-white/20",
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_10px_hsl(var(--success))]" />
        {wallet.publicKey ? `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}` : "Disconnect"}
      </button>
    );
  }

  const busy = isConnecting || wallet.connecting;
  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={busy}
      className={cn(
        "relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full bg-foreground px-4 text-[12px] font-medium text-background transition-transform duration-500 ease-out-expo hover:scale-[1.03] disabled:opacity-60",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-sweep" />
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      Connect wallet
    </button>
  );
}
