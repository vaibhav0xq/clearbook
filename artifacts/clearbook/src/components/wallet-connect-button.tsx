import { useState } from "react";
import { useWalletSession } from "@/lib/wallet";
import { Loader2 } from "lucide-react";

export function WalletConnectButton() {
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
        className="font-mono text-xs border border-border px-3 py-1.5 hover:bg-muted transition-colors text-foreground uppercase tracking-widest"
      >
        {wallet.publicKey ? `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}` : "Disconnect"}
      </button>
    );
  }

  return (
    <button 
      type="button"
      onClick={handleConnect} 
      disabled={isConnecting || wallet.connecting} 
      className="font-mono text-xs bg-foreground text-background border border-foreground px-4 py-1.5 hover:bg-foreground/90 transition-colors flex items-center gap-2 uppercase tracking-widest disabled:opacity-50"
    >
      {(isConnecting || wallet.connecting) && <Loader2 className="h-3 w-3 animate-spin" />}
      Connect wallet
    </button>
  );
}
