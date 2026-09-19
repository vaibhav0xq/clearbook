import { ReactNode } from "react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { formatUSD } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FigureProps {
  label?: string;
  /** Numeric values animate. Strings and nodes render as they are. */
  value: number | null | undefined | ReactNode;
  format?: (value: number | null | undefined) => string;
  sub?: ReactNode;
  subTone?: number | null;
  /** Colours the main value by sign. */
  tone?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "right";
  className?: string;
}

const SIZE: Record<NonNullable<FigureProps["size"]>, string> = {
  sm: "text-[17px]",
  md: "text-[22px]",
  lg: "text-[30px] md:text-[34px]",
  xl: "text-[44px] md:text-[64px] leading-[0.95] tracking-[-0.03em]",
};

export function Figure({ label, value, format = formatUSD, sub, subTone, tone = false, size = "md", align = "left", className }: FigureProps) {
  const subColor =
    subTone !== undefined && subTone !== null
      ? subTone > 0
        ? "text-success"
        : subTone < 0
          ? "text-destructive"
          : "text-muted-foreground"
      : "text-muted-foreground";

  const isNumeric = typeof value === "number" || value === null || value === undefined;

  return (
    <div className={cn("flex flex-col gap-2", align === "right" && "items-end text-right", className)}>
      {label && <span className="label">{label}</span>}
      <span className={cn("text-foreground leading-none tracking-tight", SIZE[size])}>
        {isNumeric ? (
          <AnimatedNumber value={value as number | null | undefined} format={format} tone={tone} className={size === "xl" ? "font-sans font-light" : "font-sans"} />
        ) : (
          <span className="num">{value}</span>
        )}
      </span>
      {sub && <span className={cn("num text-[12px]", subColor)}>{sub}</span>}
    </div>
  );
}
