import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/components/motion/reveal";

export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("glass w-full overflow-x-auto rounded-2xl", className)}>
      <table className="w-full text-left border-collapse whitespace-nowrap">{children}</table>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b hairline">{children}</tr>
    </thead>
  );
}

export function TableHead({ children, align = "left", className }: { children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th className={cn("label py-3.5 px-5 font-normal", align === "right" ? "text-right" : "text-left", className)}>
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-white/[0.05]">{children}</tbody>;
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
  index?: number;
  active?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Rows enter with a short stagger driven by their index.
 */
export function TableRow({ children, className, index = 0, active = false, onClick, onMouseEnter, onMouseLeave }: TableRowProps) {
  const reduce = useReducedMotion();
  return (
    <motion.tr
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT, delay: Math.min(index, 14) * 0.04 }}
      className={cn("row-hover", active && "bg-white/[0.04]", onClick && "cursor-pointer", className)}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </motion.tr>
  );
}

export function TableCell({ children, align = "left", className }: { children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={cn("py-3.5 px-5 text-[14px] align-middle", align === "right" ? "text-right" : "text-left", className)}>
      {children}
    </td>
  );
}
