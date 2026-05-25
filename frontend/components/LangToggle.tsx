'use client';

import { useLang } from '@/app/providers';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export function LangToggle() {
  const { lang, setLang } = useLang();
  const next = lang === 'en' ? 'ar' : 'en';
  return (
    <Tooltip content={next === 'ar' ? 'العربية' : 'English'}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLang(next)}
        aria-label="Switch language"
        className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{lang}</span>
      </Button>
    </Tooltip>
  );
}
