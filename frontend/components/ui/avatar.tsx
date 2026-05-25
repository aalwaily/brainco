import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Avatar({
  fallback,
  tone = 'primary',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  fallback: string;
  tone?: 'primary' | 'muted';
}) {
  return (
    <div
      className={cn(
        'grid h-8 w-8 shrink-0 select-none place-items-center rounded-full text-xs font-semibold ring-1 ring-inset',
        tone === 'primary'
          ? 'bg-primary/15 text-primary ring-primary/20'
          : 'bg-muted text-muted-foreground ring-border',
        className,
      )}
      {...props}
    >
      {fallback}
    </div>
  );
}
