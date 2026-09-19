import { useCallback, useSyncExternalStore } from "react";
import { CostMethod } from "@workspace/api-client-react";

/**
 * The lot relief method is a session wide setting. It follows the visitor across
 * every wallet page and survives a reload, and a `?method=` query on any URL
 * overrides it so that a statement view can be shared with its method attached.
 */
const STORAGE_KEY = "clearbook.costMethod";
const METHODS: CostMethod[] = ["fifo", "lifo", "hifo"];
const listeners = new Set<() => void>();

function isMethod(value: string | null): value is CostMethod {
  return !!value && (METHODS as string[]).includes(value);
}

function readInitial(): CostMethod {
  if (typeof window === "undefined") return "fifo";
  const fromUrl = new URLSearchParams(window.location.search).get("method");
  if (isMethod(fromUrl)) return fromUrl;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isMethod(stored) ? stored : "fifo";
}

let current: CostMethod = readInitial();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function useCostMethod() {
  const method = useSyncExternalStore(subscribe, getSnapshot, () => "fifo" as CostMethod);
  const setMethod = useCallback((next: CostMethod) => {
    if (next === current) return;
    current = next;
    window.localStorage.setItem(STORAGE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("method", next);
    window.history.replaceState(window.history.state, "", url);
    listeners.forEach((l) => l());
  }, []);
  return { method, setMethod };
}
