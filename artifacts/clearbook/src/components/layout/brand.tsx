import { Link } from "wouter";
import { cn } from "@/lib/utils";

/** The wordmark can step aside on narrow headers that also carry controls. */
export function Brand({ className, compactWordmark = false }: { className?: string; compactWordmark?: boolean }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="Clearbook home">
      <span className="relative block h-6 w-6">
        <span className="absolute left-0 top-[3px] h-[5px] w-6 rounded-[2px] bg-foreground/90 transition-transform duration-500 ease-out-expo group-hover:translate-x-[3px]" />
        <span className="absolute left-0 top-[10px] h-[5px] w-6 rounded-[2px] bg-primary transition-transform duration-500 ease-out-expo group-hover:-translate-x-[3px]" />
        <span className="absolute left-0 top-[17px] h-[5px] w-6 rounded-[2px] bg-foreground/50 transition-transform duration-500 ease-out-expo group-hover:translate-x-[2px]" />
      </span>
      <span className={cn("wordmark text-[15px] leading-none text-foreground", compactWordmark && "hidden sm:inline")}>Clearbook</span>
    </Link>
  );
}
