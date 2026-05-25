'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, ComponentPropsWithoutRef, ElementRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md px-2.5 py-1.5 text-xs',
      'bg-popover text-popover-foreground',
      'border border-border ring-1 ring-black/5 dark:ring-white/5',
      'shadow-[0_8px_24px_-12px_rgb(0_0_0_/_0.45)] dark:shadow-[0_10px_28px_-12px_rgb(0_0_0_/_0.65)]',
      'data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-in',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export function Tooltip({
  content,
  children,
  side = 'top',
  delayDuration = 200,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
