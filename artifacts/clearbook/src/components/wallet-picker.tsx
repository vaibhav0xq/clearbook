import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { Link } from "wouter";
import { useWalletSession } from "@/lib/wallet";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/** Wallets offered with an install link when the browser has not registered them. */
const KNOWN_WALLETS = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
];

/**
 * The wallet picker. Lists every Solana wallet the browser has registered through the Wallet
 * Standard and starts the sign in for the one chosen. Mounted once, next to the router, and
 * opened through the session's connect().
 */
export function WalletPicker() {
  const wallet = useWalletSession();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = wallet.pickerOpen;
  const { closePicker } = wallet;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePicker();
        return;
      }
      // Focus stays inside the dialog while it is open.
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !panelRef.current.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !panelRef.current.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("[data-first]");
      (first ?? panelRef.current)?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      window.clearTimeout(focus);
      previous?.focus?.();
    };
  }, [open, closePicker]);

  if (typeof document === "undefined") return null;

  const detected = wallet.wallets;
  const missing = KNOWN_WALLETS.filter((k) => !detected.some((d) => d.name.toLowerCase().startsWith(k.name.toLowerCase())));
  const busy = wallet.connecting !== null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="wallet-picker"
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closePicker} aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-picker-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="glass-strong relative w-full max-w-[400px] rounded-2xl p-6 outline-none"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="label text-primary">Wallet</span>
                <h2 id="wallet-picker-title" className="display text-[22px] text-foreground">
                  Connect a wallet
                </h2>
              </div>
              <button
                type="button"
                onClick={closePicker}
                aria-label="Close"
                className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              {detected.length > 0
                ? "The wallet will ask you to approve the connection and to sign a message that proves the account is yours. Signing is free and sends nothing on chain."
                : "No Solana wallet was found in this browser. Install one, then reload this page."}
            </p>

            <ul className="mt-5 flex flex-col gap-1.5" aria-label="Wallets">
              {detected.map((w, i) => {
                const running = wallet.connecting === w.name;
                return (
                  <li key={w.name}>
                    <button
                      type="button"
                      data-first={i === 0 ? "" : undefined}
                      onClick={() => void wallet.connect(w.name)}
                      disabled={busy}
                      className={cn(
                        "flex h-14 w-full items-center gap-3 rounded-xl border hairline bg-white/[0.02] px-3.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-default",
                        running && "border-primary/40 bg-primary/10",
                        busy && !running && "opacity-50",
                      )}
                    >
                      <img src={w.icon} alt="" className="h-8 w-8 rounded-lg" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[14px] font-medium text-foreground">{w.name}</span>
                        <span className="text-[11px] text-muted-foreground">{running ? "Waiting for the wallet" : "Detected"}</span>
                      </span>
                      {running ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                    </button>
                  </li>
                );
              })}
              {missing.map((k, i) => (
                <li key={k.name}>
                  <a
                    href={k.url}
                    target="_blank"
                    rel="noreferrer"
                    data-first={detected.length === 0 && i === 0 ? "" : undefined}
                    className="group flex h-12 w-full items-center gap-3 rounded-xl border border-dashed border-white/10 px-3.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.03]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] text-foreground/80">{k.name}</span>
                      <span className="text-[11px] text-muted-foreground">Not installed</span>
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors group-hover:text-foreground">
                      Install <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            {wallet.error && (
              <p role="alert" className="mt-4 text-[12px] leading-relaxed text-destructive">
                {wallet.error}
              </p>
            )}

            <p className="mt-5 border-t hairline pt-4 text-[12px] leading-relaxed text-muted-foreground">
              Reading does not need a wallet.{" "}
              <Link href="/" onClick={closePicker} className="text-foreground underline-offset-4 hover:underline">
                Paste an address
              </Link>{" "}
              on the home page to open any ledger.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
