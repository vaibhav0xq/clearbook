import { ReactNode } from "react";

export function DataTable({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <div className={`w-full overflow-x-auto border border-border bg-card ${className}`}>
      <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-muted/30">
      <tr className="border-b border-border">
        {children}
      </tr>
    </thead>
  );
}

export function TableHead({ children, align = "left", className = "" }: { children: ReactNode, align?: "left" | "right", className?: string }) {
  return (
    <th className={`py-3 px-4 text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground font-normal ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border/50">{children}</tbody>;
}

export function TableRow({ children, className = "" }: { children: ReactNode, className?: string }) {
  return <tr className={`hover:bg-muted/20 transition-colors ${className}`}>{children}</tr>;
}

export function TableCell({ children, align = "left", className = "" }: { children: ReactNode, align?: "left" | "right", className?: string }) {
  return (
    <td className={`py-3 px-4 text-sm font-sans tabular-nums ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}
