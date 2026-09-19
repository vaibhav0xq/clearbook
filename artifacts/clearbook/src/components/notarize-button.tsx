import { useState } from "react";
import { useWalletSession } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { NotarizationPayload } from "@workspace/api-client-react";
import { Loader2, CheckCircle2, Link as LinkIcon, FileSignature } from "lucide-react";

interface NotarizeButtonProps {
  payload: NotarizationPayload;
  onSubmit: (params: { statementId: string; data: { signature?: string | null; simulate: boolean } }) => Promise<any>;
}

export function NotarizeButton({ payload, onSubmit }: NotarizeButtonProps) {
  const wallet = useWalletSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const [failure, setFailure] = useState<string | null>(null);

  const isSimulated = !wallet.connected || payload.mode === "simulated" || !payload.transaction;

  const handleNotarize = async () => {
    setIsProcessing(true);
    setFailure(null);
    try {
      if (isSimulated) {
        await onSubmit({
          statementId: payload.statementId,
          data: { simulate: true },
        });
      } else {
        const txSig = await wallet.signAndSendTransaction(payload.transaction!);
        await onSubmit({
          statementId: payload.statementId,
          data: { signature: txSig, simulate: false },
        });
      }
      setSuccess(true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Notarization failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center gap-2 text-success text-sm font-medium">
        <CheckCircle2 className="h-4 w-4" />
        {isSimulated ? "Simulated proof created" : "On-chain proof created"}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
    <Button 
      onClick={handleNotarize} 
      disabled={isProcessing} 
      variant="outline" 
      size="sm"
      className="gap-2"
    >
      {isProcessing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSignature className="h-4 w-4" />
      )}
      {isSimulated ? "Create simulated proof" : "Sign on-chain proof"}
    </Button>
    {failure && <span className="text-xs text-destructive max-w-xs text-right">{failure}</span>}
    </div>
  );
}
