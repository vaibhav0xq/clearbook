import { useState } from "react";
import { useWalletSession } from "@/lib/wallet";
import { NotarizationPayload } from "@workspace/api-client-react";
import { Loader2, FileSignature, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
      setFailure(e instanceof Error ? e.message : "Notarization failed");
    } finally {
      setIsProcessing(false);
    }
  };

  if (success) {
    return (
      <span className="inline-flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <span className="num text-[12px] text-success">
          {isSimulated ? "Simulated" : "Confirmed"}
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button 
        onClick={handleNotarize} 
        disabled={isProcessing} 
        className={cn(
          "group relative inline-flex items-center justify-center gap-2.5 rounded-full border hairline bg-white/[0.03] px-4 py-2 num text-[12px] text-foreground transition-colors hover:bg-white/[0.06] hover:border-white/20",
          isProcessing && "opacity-50 pointer-events-none"
        )}
      >
        <span className="relative flex h-4 w-4 items-center justify-center overflow-hidden">
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <>
              <FileSignature className="absolute h-4 w-4 text-primary transition-transform duration-500 ease-out-expo group-hover:translate-x-4 group-hover:-translate-y-4" />
              <FileSignature className="absolute h-4 w-4 text-primary transition-transform duration-500 ease-out-expo -translate-x-4 translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0" />
            </>
          )}
        </span>
        {isSimulated ? "Simulate proof" : "Sign on chain"}
      </button>
      {failure && <span className="text-[12px] text-destructive max-w-[240px] text-right break-words">{failure}</span>}
    </div>
  );
}