'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/app/providers';
import { useLang } from '@/app/providers';
import { t } from '@/lib/i18n';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { lang } = useLang();
  const dark = theme === 'dark';
  const label = dark ? t(lang, 'theme_light') : t(lang, 'theme_dark');
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleTheme}
        aria-label={label}
        className="text-muted-foreground hover:text-foreground"
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </Tooltip>
  );
}
