import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  SolanaSignIn,
  SolanaSignMessage,
  type SolanaSignInFeature,
  type SolanaSignInInput,
  type SolanaSignMessageFeature,
} from '@solana/wallet-standard-features';
import { createSignInMessage, parseSignInMessage, verifyMessageSignature, verifySignIn } from '@solana/wallet-standard-util';
import bs58 from 'bs58';

/**
 * Wallet session contract.
 *
 * The UI only talks to this hook. The provider is implemented with the Wallet
 * Standard, so any installed Solana wallet (Phantom, Solflare, Backpack) that
 * registers itself in the page is offered without wallet specific adapters.
 *
 * A session starts with a choice in the wallet picker and a signed sign in
 * message. The signature is verified in the browser against the account the
 * wallet returned, so a connected address is one the person could sign for.
 * The session is kept in local storage and restored silently on the next
 * visit as long as the wallet still trusts the site and still holds the same
 * account. Disconnecting ends the session in the wallet as well, so the next
 * connection goes through the picker and a fresh signature.
 *
 * When no wallet is installed every screen still works through the paste an
 * address and demo paths.
 */
export interface WalletChoice {
  name: string;
  icon: string;
}

export interface WalletSession {
  /** True when at least one Solana wallet is installed in the browser. */
  available: boolean;
  /** Detected wallets, for the picker. */
  wallets: readonly WalletChoice[];
  connected: boolean;
  /** Name of the wallet a sign in is running for, or null. */
  connecting: string | null;
  publicKey: string | null;
  walletName: string | null;
  walletIcon: string | null;
  error: string | null;
  /** True while the wallet picker is open. */
  pickerOpen: boolean;
  /**
   * Without a name, opens the picker and resolves with the address once a wallet has signed in,
   * or null when the picker is closed. With a name, signs in with that wallet directly.
   */
  connect: (walletName?: string) => Promise<string | null>;
  closePicker: () => void;
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
  wallets: [],
  connected: false,
  connecting: null,
  publicKey: null,
  walletName: null,
  walletIcon: null,
  error: null,
  pickerOpen: false,
  connect: async () => null,
  closePicker: () => undefined,
  disconnect: async () => undefined,
  signAndSendTransaction: notAvailable,
};

export const WalletSessionContext = createContext<WalletSession>(stubWalletSession);

const CHAIN = 'solana:mainnet';
const SESSION_KEY = 'clearbook.session';
const LEGACY_KEY = 'clearbook.wallet';
const SESSION_DAYS = 7;
const STATEMENT = 'Sign in to Clearbook. This confirms the account is yours. It is free and sends nothing on chain.';

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
type SignInFeature = SolanaSignInFeature[typeof SolanaSignIn];
type SignMessageFeature = SolanaSignMessageFeature[typeof SolanaSignMessage];

interface StoredSession {
  wallet: string;
  address: string;
  signedAt: string;
}

function feature<T>(wallet: Wallet | null, name: string): T | null {
  if (!wallet) return null;
  const f = (wallet.features as Record<string, unknown>)[name];
  return f ? (f as T) : null;
}

function isSolanaWallet(wallet: Wallet): boolean {
  return wallet.chains.some((c) => c.startsWith('solana:')) && !!feature<ConnectFeature>(wallet, 'standard:connect');
}

/**
 * An account is accepted only when its address is the base58 form of its public key, so the
 * signature checks below bind to the address the ledger opens and not to a claimed string.
 */
function isSolanaAccount(account: WalletAccount | undefined): account is WalletAccount {
  return (
    !!account &&
    account.publicKey.length === 32 &&
    account.chains.some((c) => c.startsWith('solana:')) &&
    bs58.encode(new Uint8Array(account.publicKey)) === account.address
  );
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

function loadSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.wallet !== 'string' || typeof parsed.address !== 'string' || typeof parsed.signedAt !== 'string') return null;
    const age = Date.now() - Date.parse(parsed.signedAt);
    if (!Number.isFinite(age) || age > SESSION_DAYS * 24 * 60 * 60 * 1000) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null) {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode. The session lasts for the page.
  }
}

/** A nonce of at least eight alphanumeric characters, as the sign in specification requires. */
function makeNonce(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function describeError(err: unknown, walletName: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/reject|denied|cancel|declin/i.test(message)) return `Request declined in ${walletName}.`;
  return message || `${walletName} did not complete the sign in.`;
}

/**
 * Connects to the wallet and obtains a verified sign in signature for the account it returns.
 * Wallets that implement solana:signIn do both in one prompt. Others connect first and then sign
 * the same message through solana:signMessage.
 */
async function signInWith(wallet: Wallet): Promise<{ account: WalletAccount; signedAt: string }> {
  const issuedAt = new Date().toISOString();
  const domain = window.location.host;
  const input: SolanaSignInInput = {
    domain,
    statement: STATEMENT,
    uri: window.location.origin,
    version: '1',
    chainId: 'mainnet',
    nonce: makeNonce(),
    issuedAt,
  };

  const signIn = feature<SignInFeature>(wallet, SolanaSignIn);
  if (signIn) {
    const [output] = await signIn.signIn(input);
    if (!output) throw new Error(`${wallet.name} did not return a sign in result.`);
    const parsed = parseSignInMessage(output.signedMessage);
    if (!isSolanaAccount(output.account) || !parsed || parsed.address !== output.account.address || !verifySignIn(input, output)) {
      throw new Error('The signature did not verify for the account the wallet returned.');
    }
    return { account: output.account, signedAt: issuedAt };
  }

  const connectFeature = feature<ConnectFeature>(wallet, 'standard:connect');
  if (!connectFeature) throw new Error(`${wallet.name} cannot connect to sites.`);
  const { accounts } = await connectFeature.connect();
  const account = accounts.find(isSolanaAccount);
  if (!account) throw new Error('The wallet did not share a Solana account.');
  const signMessage = feature<SignMessageFeature>(wallet, SolanaSignMessage);
  try {
    if (!signMessage) throw new Error(`${wallet.name} cannot sign messages, so the account cannot be confirmed.`);
    const message = createSignInMessage({ ...input, domain, address: account.address });
    const [signed] = await signMessage.signMessage({ account, message });
    const publicKey = new Uint8Array(account.publicKey);
    if (!signed || !verifyMessageSignature({ message, signedMessage: signed.signedMessage, signature: signed.signature, publicKey })) {
      throw new Error('The signature did not verify for the connected account.');
    }
  } catch (err) {
    // The connection was approved but the sign in was not. Leave the wallet as it was.
    await feature<DisconnectFeature>(wallet, 'standard:disconnect')?.disconnect().catch(() => undefined);
    throw err;
  }
  return { account, signedAt: issuedAt };
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
  // This fallback is deliberately keyless. Build time environment variables must not place
  // provider credentials in the browser bundle.
  const rpcUrl = 'https://api.mainnet-beta.solana.com';
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
  const [active, setActive] = useState<{ name: string; icon: string } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeWallet = useRef<Wallet | null>(null);
  const restored = useRef(false);
  // Every explicit session change moves the generation on. A silent restore that finishes after
  // a later connect or disconnect finds a newer generation and leaves the session alone.
  const generation = useRef(0);
  const signingIn = useRef(false);
  const pickerOpenRef = useRef(false);
  // Resolver of the connect() call that opened the picker.
  const pending = useRef<((address: string | null) => void) | null>(null);

  const settlePending = useCallback((address: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.(address);
  }, []);

  const openPicker = useCallback((open: boolean) => {
    pickerOpenRef.current = open;
    setPickerOpen(open);
  }, []);

  const endSession = useCallback(() => {
    generation.current += 1;
    activeWallet.current = null;
    setAccount(null);
    setActive(null);
    saveSession(null);
  }, []);

  const connect = useCallback(
    async (name?: string): Promise<string | null> => {
      if (!name) {
        settlePending(null);
        setError(null);
        openPicker(true);
        return new Promise<string | null>((resolve) => {
          pending.current = resolve;
        });
      }
      if (signingIn.current) return null;
      const wallet = wallets.find((w) => w.name === name);
      if (!wallet) {
        setError('That wallet is no longer available in this browser.');
        return null;
      }
      signingIn.current = true;
      setConnecting(wallet.name);
      setError(null);
      try {
        const { account: signed, signedAt } = await signInWith(wallet);
        generation.current += 1;
        activeWallet.current = wallet;
        setAccount(signed);
        setActive({ name: wallet.name, icon: wallet.icon });
        saveSession({ wallet: wallet.name, address: signed.address, signedAt });
        openPicker(false);
        settlePending(signed.address);
        return signed.address;
      } catch (err) {
        setError(describeError(err, wallet.name));
        // With the picker still open the person can try again. Closed, the wait is over.
        if (!pickerOpenRef.current) settlePending(null);
        return null;
      } finally {
        signingIn.current = false;
        setConnecting(null);
      }
    },
    [wallets, settlePending, openPicker],
  );

  // Closing the picker hides it. A sign in that is already waiting on the wallet keeps running,
  // since the wallet prompt cannot be withdrawn, and its result still settles the connect() call.
  const closePicker = useCallback(() => {
    openPicker(false);
    if (!signingIn.current) {
      setError(null);
      settlePending(null);
    }
  }, [settlePending, openPicker]);

  const disconnect = useCallback(async () => {
    const wallet = activeWallet.current;
    endSession();
    setError(null);
    try {
      await feature<DisconnectFeature>(wallet, 'standard:disconnect')?.disconnect();
    } catch {
      // The session is already over locally.
    }
  }, [endSession]);

  // Restore the last session silently when the same wallet still trusts the site and holds the
  // same account. Anything else ends the session and the next visit starts from the picker.
  useEffect(() => {
    if (restored.current || wallets.length === 0) return;
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Nothing to clean.
    }
    const session = loadSession();
    if (!session) return;
    const wallet = wallets.find((w) => w.name === session.wallet);
    if (!wallet) return;
    restored.current = true;
    const started = generation.current;
    feature<ConnectFeature>(wallet, 'standard:connect')!
      .connect({ silent: true })
      .then(({ accounts }) => {
        if (generation.current !== started) return;
        const match = accounts.find((a) => a.address === session.address);
        if (!isSolanaAccount(match)) {
          saveSession(null);
          return;
        }
        activeWallet.current = wallet;
        setAccount(match);
        setActive({ name: wallet.name, icon: wallet.icon });
      })
      .catch(() => {
        if (generation.current === started) saveSession(null);
      });
  }, [wallets]);

  // The session belongs to the account that signed in. When the wallet switches to another one,
  // the session ends instead of following it, and the person signs in again with the new account.
  useEffect(() => {
    const wallet = activeWallet.current;
    if (!wallet || !account) return;
    const events = feature<{ on: (event: 'change', cb: (props: { accounts?: readonly WalletAccount[] }) => void) => () => void }>(wallet, 'standard:events');
    if (!events) return;
    return events.on('change', ({ accounts }) => {
      if (!accounts) return;
      if (accounts.some((a) => a.address === account.address)) return;
      endSession();
      setError(accounts.length === 0 ? 'The wallet disconnected.' : 'The wallet switched accounts. Connect again with the new account.');
    });
  }, [account, endSession]);

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

  const choices = useMemo<WalletChoice[]>(() => wallets.map((w) => ({ name: w.name, icon: w.icon })), [wallets]);

  const value = useMemo<WalletSession>(
    () => ({
      available: wallets.length > 0,
      wallets: choices,
      connected: !!account,
      connecting,
      publicKey: account?.address ?? null,
      walletName: active?.name ?? null,
      walletIcon: active?.icon ?? null,
      error,
      pickerOpen,
      connect,
      closePicker,
      disconnect,
      signAndSendTransaction,
    }),
    [wallets.length, choices, account, connecting, active, error, pickerOpen, connect, closePicker, disconnect, signAndSendTransaction],
  );

  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}

export function useWalletSession(): WalletSession {
  return useContext(WalletSessionContext);
}
