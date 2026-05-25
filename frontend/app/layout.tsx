import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Shell } from '@/components/Shell';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const noto = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-ar',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Company Brain',
  description: 'Local company assistant. DeepSeek + RAG over your company files. Arabic + English.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#0a0a0c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${noto.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
