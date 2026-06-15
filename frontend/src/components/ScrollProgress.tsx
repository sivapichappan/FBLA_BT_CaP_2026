/**
 * A thin reading-progress bar pinned to the very top of the viewport that fills
 * left-to-right as the page scrolls (a spring smooths the motion). Purely
 * decorative (aria-hidden) and self-disabling: it renders nothing for users who
 * prefer reduced motion. Uses the existing motion/react dependency.
 */

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

export function ScrollProgress() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  // Spring-follow the 0→1 scroll fraction so the bar glides rather than jumps.
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.3,
  });

  if (reduce) return null;
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-accent-600"
    />
  );
}
