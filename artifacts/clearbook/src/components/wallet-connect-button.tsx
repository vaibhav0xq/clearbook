import { useState } from "react";
import { useWalletSession } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
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
    return null; // Don't show connect button if no wallets are detected
  }

  if (wallet.connected) {
    return (
      <Button variant="outline" onClick={handleDisconnect} className="font-mono text-xs">
        {wallet.publicKey ? `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}` : "Disconnect"}
      </Button>
    );
  }

  return (
    <Button onClick={handleConnect} disabled={isConnecting || wallet.connecting} variant="secondary">
      {(isConnecting || wallet.connecting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Connect Wallet
    </Button>
  );
}
