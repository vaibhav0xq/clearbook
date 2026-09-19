import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import bs58 from 'bs58';

/**
 * Wallet session contract.
 *
 * The UI only talks to this hook. The provider is implemented with the Wallet
 * Standard, so any installed Solana wallet (Phantom, Solflare, Backpack) that
 * registers itself in the page is offered without wallet specific adapters.
 * When no wallet is installed every screen still works through the paste an
 * address and demo paths.
 */
export interface WalletSession {
  /** True when at least one Solana wallet is installed in the browser. */
  available: boolean;
  /** Names of detected wallets, for a picker. */
  walletNames: string[];
  connected: boolean;
  connecting: boolean;
  publicKey: string | null;
  walletName: string | null;
  error: string | null;
  connect: (walletName?: string) => Promise<string | null>;
  disconnect: () => Promise<void>;
  /**
   * Signs and sends a base64 encoded versioned transaction produced by the API.
   * Resolves with the transaction signature.
   */
  signAndSendTransaction: (base64Transaction: string) => Promise<string>;
}

const notAvailable = async (): Promise<never> => {
  throw new Error('No Solana wallet is available in this browser.');
};

export const stubWalletSession: WalletSession = {
  available: false,
  walletNames: [],
  connected: false,
  connecting: false,
  publicKey: null,
  walletName: null,
  error: null,
  connect: async () => null,
  disconnect: async () => undefined,
  signAndSendTransaction: notAvailable,
};

export const WalletSessionContext = createContext<WalletSession>(stubWalletSession);

const CHAIN = 'solana:mainnet';
const STORAGE_KEY = 'clearbook.wallet';

interface ConnectFeature {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
}
interface DisconnectFeature {
  disconnect: () => Promise<void>;
}
interface SignAndSendFeature {
  signAndSendTransaction: (
    ...inputs: Array<{ transaction: Uint8Array; account: WalletAccount; chain: string; options?: { preflightCommitment?: string } }>
  ) => Promise<Array<{ signature: Uint8Array }>>;
}
interface SignTransactionFeature {
  signTransaction: (
    ...inputs: Array<{ transaction: Uint8Array; account: WalletAccount; chain?: string }>
  ) => Promise<Array<{ signedTransaction: Uint8Array }>>;
}

function feature<T>(wallet: Wallet, name: string): T | null {
  const f = (wallet.features as Record<string, unknown>)[name];
  return f ? (f as T) : null;
}

function isSolanaWallet(wallet: Wallet): boolean {
  return wallet.chains.some((c) => c.startsWith('solana:')) && !!feature<ConnectFeature>(wallet, 'standard:connect');
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function useInstalledWallets(): Wallet[] {
  const [wallets, setWallets] = useState<Wallet[]>(() =>
    typeof window === 'undefined' ? [] : getWallets().get().filter(isSolanaWallet),
  );
  useEffect(() => {
    const api = getWallets();
    const refresh = () => setWallets(api.get().filter(isSolanaWallet));
    refresh();
    const offRegister = api.on('register', refresh);
    const offUnregister = api.on('unregister', refresh);
    // Some wallets inject after the first paint.
    const late = window.setTimeout(refresh, 800);
    return () => {
      offRegister();
      offUnregister();
      window.clearTimeout(late);
    };
  }, []);
  return wallets;
}

/** Sends a fully signed transaction through the public RPC when the wallet cannot send it itself. */
async function sendRaw(signed: Uint8Array): Promise<string> {
  const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [bytesToBase64(signed), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 3 }],
    }),
  });
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (!json.result) throw new Error(json.error?.message ?? 'The RPC did not accept the transaction.');
  return json.result;
}

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const wallets = useInstalledWallets();
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeWallet = useRef<Wallet | null>(null);
  const restored = useRef(false);

  const connect = useCallback(
    async (name?: string): Promise<string | null> => {
      const wallet = name ? wallets.find((w) => w.name === name) : wallets[0];
      if (!wallet) {
        setError('No Solana wallet is available in this browser.');
        return null;
      }
      setConnecting(true);
      setError(null);
      try {
        const { accounts } = await feature<ConnectFeature>(wallet, 'standard:connect')!.connect();
        const first = accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0];
        if (!first) throw new Error('The wallet did not share an account.');
        activeWallet.current = wallet;
        setAccount(first);
        setWalletName(wallet.name);
        window.localStorage.setItem(STORAGE_KEY, wallet.name);
        return first.address;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Wallet connection was rejected.';
        setError(message);
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [wallets],
  );

  const disconnect = useCallback(async () => {
    const wallet = activeWallet.current;
    activeWallet.current = null;
    setAccount(null);
    setWalletName(null);
    window.localStorage.removeItem(STORAGE_KEY);
    try {
      await feature<DisconnectFeature>(wallet ?? ({ features: {} } as Wallet), 'standard:disconnect')?.disconnect();
    } catch {
      // The session is already cleared locally.
    }
  }, []);

  // Reconnect silently to the wallet used last time, when it allows it.
  useEffect(() => {
    if (restored.current || wallets.length === 0) return;
    const remembered = window.localStorage.getItem(STORAGE_KEY);
    const wallet = wallets.find((w) => w.name === remembered);
    if (!wallet) return;
    restored.current = true;
    feature<ConnectFeature>(wallet, 'standard:connect')!
      .connect({ silent: true })
      .then(({ accounts }) => {
        const first = accounts[0];
        if (!first) return;
        activeWallet.current = wallet;
        setAccount(first);
        setWalletName(wallet.name);
      })
      .catch(() => undefined);
  }, [wallets]);

  // Follow account switches made inside the wallet.
  useEffect(() => {
    const wallet = activeWallet.current;
    if (!wallet || !account) return;
    const events = feature<{ on: (event: 'change', cb: (props: { accounts?: readonly WalletAccount[] }) => void) => () => void }>(wallet, 'standard:events');
    if (!events) return;
    return events.on('change', ({ accounts }) => {
      if (!accounts) return;
      if (accounts.length === 0) {
        void disconnect();
        return;
      }
      if (accounts[0].address !== account.address) setAccount(accounts[0]);
    });
  }, [account, disconnect]);

  const signAndSendTransaction = useCallback(
    async (base64Transaction: string): Promise<string> => {
      const wallet = activeWallet.current;
      if (!wallet || !account) throw new Error('Connect a wallet first.');
      const transaction = base64ToBytes(base64Transaction);
      const sendFeature = feature<SignAndSendFeature>(wallet, 'solana:signAndSendTransaction');
      if (sendFeature) {
        const [result] = await sendFeature.signAndSendTransaction({
          transaction,
          account,
          chain: CHAIN,
          options: { preflightCommitment: 'confirmed' },
        });
        return bs58.encode(result.signature);
      }
      const signFeature = feature<SignTransactionFeature>(wallet, 'solana:signTransaction');
      if (!signFeature) throw new Error(`${wallet.name} cannot sign transactions.`);
      const [signed] = await signFeature.signTransaction({ transaction, account, chain: CHAIN });
      return sendRaw(signed.signedTransaction);
    },
    [account],
  );

  const value = useMemo<WalletSession>(
    () => ({
      available: wallets.length > 0,
      walletNames: wallets.map((w) => w.name),
      connected: !!account,
      connecting,
      publicKey: account?.address ?? null,
      walletName,
      error,
      connect,
      disconnect,
      signAndSendTransaction,
    }),
    [wallets, account, connecting, walletName, error, connect, disconnect, signAndSendTransaction],
  );

  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

export function useWalletSession(): WalletSession {
  return useContext(WalletSessionContext);
}
