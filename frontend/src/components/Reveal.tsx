/**
 * Orchestrated entrance motion (§14): a subtle fade-up with per-item stagger,
 * via motion/react. Wrapped once in <MotionConfig reducedMotion="user"> (see
 * App.tsx), so users who set prefers-reduced-motion get no movement at all.
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.21, 0.61, 0.35, 1] }}
    >
      {children}
    </motion.div>
  );
}
