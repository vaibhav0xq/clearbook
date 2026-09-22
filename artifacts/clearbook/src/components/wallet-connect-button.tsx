import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, ChevronDown, Copy, Loader2, LogOut } from "lucide-react";
import { useWalletSession } from "@/lib/wallet";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/** Opens the wallet picker and, once a wallet has signed in, goes to that wallet's ledger. */
export function useConnectAndOpen() {
  const wallet = useWalletSession();
  const [location, setLocation] = useLocation();
  const connect = async () => {
    const connected = await wallet.connect();
    if (!connected) return;
    const path = `/w/${connected}`;
    if (location !== path && !location.startsWith(`${path}/`)) setLocation(path);
  };
  return { connect, busy: wallet.connecting !== null };
}

/**
 * The header wallet control. Disconnected it opens the wallet picker and, once a wallet has signed
 * in, goes to that wallet's ledger. Connected it shows the address and a menu with the full
 * address, the ledger, the explorer and disconnect.
 */
export function WalletConnectButton({ className }: { className?: string }) {
  const wallet = useWalletSession();
  const [location, setLocation] = useLocation();
  const { connect: connectAndOpen, busy } = useConnectAndOpen();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const address = wallet.publicKey;
  const ledgerPath = address ? `/w/${address}` : null;
  const onOwnLedger = !!ledgerPath && (location === ledgerPath || location.startsWith(`${ledgerPath}/`));

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const handleDisconnect = async () => {
    setMenuOpen(false);
    const leaving = onOwnLedger;
    await wallet.disconnect();
    // Disconnecting is leaving the account, so the ledger it opened closes with it.
    if (leaving) setLocation("/");
  };

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused. The address is visible in the menu.
    }
  };

  if (wallet.connected && address) {
    return (
      <div ref={rootRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={address}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full border hairline bg-white/[0.03] pl-2.5 pr-2.5 num text-[12px] text-foreground transition-colors hover:border-white/20",
            menuOpen && "border-white/20 bg-white/[0.05]",
          )}
        >
          {wallet.walletIcon ? (
            <img src={wallet.walletIcon} alt="" className="h-4 w-4 rounded-[4px]" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_10px_hsl(var(--success))]" />
          )}
          {`${address.slice(0, 4)}...${address.slice(-4)}`}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-300", menuOpen && "rotate-180")} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              aria-label="Wallet"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="glass-strong absolute right-0 top-full z-50 mt-2 w-[272px] origin-top-right rounded-xl p-1.5"
            >
              <div className="px-3 pb-3 pt-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_10px_hsl(var(--success))]" />
                  <span className="text-[12px] text-foreground">{wallet.walletName ?? "Wallet"}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">Signed in</span>
                </div>
                <p className="num mt-2 break-all text-[11px] leading-relaxed text-muted-foreground">{address}</p>
              </div>
              <div className="border-t hairline pt-1.5">
                <MenuItem onClick={handleCopy} icon={copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}>
                  {copied ? "Copied" : "Copy address"}
                </MenuItem>
                {!onOwnLedger && ledgerPath && (
                  <MenuItem href={ledgerPath} icon={<ArrowUpRight className="h-3.5 w-3.5" />}>
                    Open my ledger
                  </MenuItem>
                )}
                <MenuItem href={`https://solscan.io/account/${address}`} external icon={<ArrowUpRight className="h-3.5 w-3.5" />}>
                  View on Solscan
                </MenuItem>
              </div>
              <div className="mt-1.5 border-t hairline pt-1.5">
                <MenuItem onClick={handleDisconnect} icon={<LogOut className="h-3.5 w-3.5" />} tone="destructive">
                  Disconnect
                </MenuItem>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={connectAndOpen}
      disabled={busy}
      className={cn(
        "relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full bg-foreground px-4 text-[12px] font-medium text-background transition-transform duration-500 ease-out-expo hover:scale-[1.03] disabled:opacity-60",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-sweep" />
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      <span className="hidden sm:inline">Connect wallet</span>
      <span className="sm:hidden">Connect</span>
    </button>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  href,
  external = false,
  tone = "default",
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  tone?: "default" | "destructive";
}) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.05]",
    tone === "destructive" ? "text-destructive hover:text-destructive" : "text-foreground/85 hover:text-foreground",
  );
  const body = (
    <>
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </>
  );
  if (href && external) {
    return (
      <a role="menuitem" href={href} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link role="menuitem" href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
