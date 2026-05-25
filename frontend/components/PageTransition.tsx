'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

/**
 * App-router page transitions. Wraps the route's children with a motion
 * fade-up keyed by pathname so navigating between Chat / Files / Generated
 * crossfades instead of hard-cutting.
 *
 * Kept short (160ms) so it feels snappy — anything longer starts to feel
 * laggy when clicking between sidebar nav items.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: 0.16,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="contents"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
