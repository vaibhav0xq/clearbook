import { useState } from "react";
import { useWalletSession } from "@/lib/wallet";
import { NotarizationPayload } from "@workspace/api-client-react";
import { Loader2, FileSignature, CheckCircle2 } from "lucide-react";

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
      <div className="flex items-center justify-end gap-2 text-success text-[11px] font-sans uppercase tracking-[0.08em]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {isSimulated ? "Simulated" : "Confirmed"}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button 
        onClick={handleNotarize} 
        disabled={isProcessing} 
        className="flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 px-4 py-2 text-[11px] font-sans uppercase tracking-[0.08em] transition-colors disabled:opacity-50"
      >
        {isProcessing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileSignature className="h-3.5 w-3.5" />
        )}
        {isSimulated ? "Create simulated proof" : "Sign on-chain proof"}
      </button>
      {failure && <span className="text-xs font-sans text-destructive max-w-xs text-right break-words">{failure}</span>}
    </div>
  );
}
