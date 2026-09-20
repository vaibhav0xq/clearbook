import { ReactNode } from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

/**
 * Glass panel. The default surface for grouped content.
 */
export function Panel({ children, className, strong = false }: { children: ReactNode; className?: string; strong?: boolean }) {
  return <div className={cn(strong ? "glass-strong" : "glass", "rounded-2xl", className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex flex-col gap-2">
        {eyebrow && <span className="label text-primary">{eyebrow}</span>}
        <h1 className="display text-[26px] text-foreground md:text-[30px]">{title}</h1>
        {description && <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-baseline justify-between gap-4", className)}>
      <h2 className="display text-[20px] text-foreground md:text-[22px]">{children}</h2>
      {aside && <div className="text-[12px] text-muted-foreground">{aside}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "amber" | "gain" | "loss"; className?: string }) {
  const tones = {
    neutral: "border-white/10 text-muted-foreground bg-white/[0.03]",
    amber: "border-primary/30 text-primary bg-primary/10",
    gain: "border-success/30 text-success bg-success/10",
    loss: "border-destructive/30 text-destructive bg-destructive/10",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[3px] text-[10px] uppercase tracking-[0.12em] leading-none", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md", className)} aria-hidden />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cn("flex flex-col items-center gap-4 px-8 py-14 text-center", className)}>
      {Icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full border hairline bg-white/[0.03]">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
      )}
      <h3 className="display text-[20px] text-foreground">{title}</h3>
      {description && <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action}
    </Panel>
  );
}

export function ErrorState({ title = "Something did not load", message, className }: { title?: string; message?: string; className?: string }) {
  return (
    <Panel className={cn("flex flex-col items-center gap-4 px-8 py-12 text-center", className)}>
      <AlertCircle className="h-6 w-6 text-destructive" />
      <h3 className="display text-[20px] text-foreground">{title}</h3>
      {message && <p className="max-w-md break-words text-[13px] leading-relaxed text-muted-foreground">{message}</p>}
    </Panel>
  );
}

export function MethodologyLink({ children = "Methodology", className }: { children?: ReactNode; className?: string }) {
  return (
    <Link href="/methodology" className={cn("text-primary hover:text-foreground transition-colors underline-offset-4 hover:underline", className)}>
      {children}
    </Link>
  );
}
