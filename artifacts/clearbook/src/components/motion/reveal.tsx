import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  y?: number;
  blur?: boolean;
  once?: boolean;
  as?: "div" | "section" | "li" | "span" | "tr";
}

/**
 * Fades and lifts content into view when it enters the viewport.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  duration = 0.8,
  y = 18,
  blur = true,
  once = true,
  as = "div",
}: RevealProps) {
  const reduce = useReducedMotion();
  const Component = motion[as] as typeof motion.div;
  if (reduce) return <Component className={className}>{children}</Component>;
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y, filter: blur ? "blur(8px)" : undefined }}
      whileInView={{ opacity: 1, y: 0, filter: blur ? "blur(0px)" : undefined }}
      viewport={{ once, margin: "-48px" }}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </Component>
  );
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE_OUT } },
};

/**
 * Staggers its children into view. Use StaggerItem for each child.
 */
export function Stagger({
  children,
  className,
  as = "div",
  inView = true,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul" | "tbody" | "section";
  inView?: boolean;
}) {
  const reduce = useReducedMotion();
  const Component = motion[as] as typeof motion.div;
  if (reduce) return <Component className={className}>{children}</Component>;
  return (
    <Component
      className={className}
      variants={containerVariants}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "-32px" } } : { animate: "show" })}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "tr";
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      className={className}
      variants={itemVariants}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </Component>
  );
}
