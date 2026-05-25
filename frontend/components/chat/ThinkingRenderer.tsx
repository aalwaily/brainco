'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * Multi-state thinking indicator inspired by ChatGPT / Claude:
 * cycles through "Thinking → Searching → Analyzing → Writing" so the
 * user gets a more concrete sense of what's happening than a single dot.
 *
 * The pulsing dot keeps the visual rhythm we already established; the
 * label only appears when streaming is empty (no tokens yet). Once tokens
 * arrive, the parent unmounts this component.
 */
const STAGES = [
  { key: 'thinking',   en: 'Thinking',           ar: 'يفكّر' },
  { key: 'searching',  en: 'Searching files',    ar: 'يبحث في الملفات' },
  { key: 'analyzing',  en: 'Analyzing context',  ar: 'يحلّل السياق' },
  { key: 'writing',    en: 'Writing response',   ar: 'يكتب الجواب' },
] as const;

const STAGE_DURATION_MS = 1100;

export function ThinkingRenderer({
  lang = 'en',
  className,
}: {
  lang?: 'en' | 'ar';
  className?: string;
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, STAGE_DURATION_MS);
    return () => window.clearInterval(id);
  }, []);

  const label = STAGES[stage][lang];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center gap-2.5 text-sm text-muted-foreground', className)}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full bg-foreground animate-think"
      />
      <AnimatePresence mode="wait">
        <motion.span
          key={STAGES[stage].key}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="leading-none"
        >
          {label}
          <span className="ms-1 inline-flex">
            <Dot delay="0s" />
            <Dot delay="0.18s" />
            <Dot delay="0.36s" />
          </span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="ms-[1px] h-[3px] w-[3px] translate-y-[-1px] self-center rounded-full bg-muted-foreground animate-pulse-dot"
      style={{ animationDelay: delay }}
    />
  );
}
