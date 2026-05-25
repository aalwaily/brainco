'use client';

import { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatProvider } from '@/app/chat-store';
import { AppSidebar } from './AppSidebar';
import { PageTransition } from './PageTransition';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <ChatProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="min-w-0 flex-1">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </TooltipProvider>
    </ChatProvider>
  );
}
