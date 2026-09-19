import { ReactNode } from "react";

interface FigureProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: number | null;
  size?: "md" | "lg" | "xl";
  className?: string;
}

export function Figure({ label, value, sub, subTone, size = "md", className = "" }: FigureProps) {
  const subColorClass = subTone !== undefined && subTone !== null 
    ? (subTone > 0 ? "text-success" : subTone < 0 ? "text-destructive" : "text-muted-foreground") 
    : "text-muted-foreground";
    
  const valClass = size === "xl" ? "font-serif text-[40px] md:text-[44px] font-medium" 
    : size === "lg" ? "font-sans text-[26px]" 
    : "font-sans text-lg";

  return (
    <div className={`flex flex-col ${className}`}>
       <span className="text-[11px] uppercase tracking-[0.08em] font-sans text-muted-foreground mb-1.5">{label}</span>
       <span className={`${valClass} tracking-tight tabular-nums text-foreground leading-none`}>
         {value ?? "-"}
       </span>
       {sub && <span className={`text-xs font-sans mt-2 tabular-nums ${subColorClass}`}>{sub}</span>}
    </div>
  );
}
