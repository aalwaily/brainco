'use client';

import { useEffect, useState } from 'react';
import {
  ChevronRight,
  Code2,
  Cpu,
  Database,
  Globe,
  HelpCircle,
  Info,
  Loader2,
  MessageSquare,
  Moon,
  Palette,
  RefreshCw,
  Sun,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { API_URL, listProviders, reingest, ProviderInfo } from '@/lib/api';
import { useChat } from '@/app/chat-store';
import { useLang, useTheme } from '@/app/providers';
import { readProviderPref, writeProviderPref } from '@/lib/chat/provider-pref';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Settings panel — ChatGPT-style: each section is a single rounded card,
 * each row is a flat line with an icon on the left, label in the middle,
 * and a control on the right. Hover highlight, subtle dividers, no nested
 * cards.
 */
export function SettingsDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang }   = useLang();
  const { clearHistory }    = useChat();
  const [reindexing, setReindexing] = useState(false);
  const [clearing,   setClearing]   = useState(false);

  // --- Provider selector ---------------------------------------------------
  const [providers, setProviders]     = useState<ProviderInfo[] | null>(null);
  const [defaultId, setDefaultId]     = useState<string | null>(null);
  const [providerId, setProviderId]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProviderId(readProviderPref());
    listProviders()
      .then((r) => { setProviders(r.providers); setDefaultId(r.default); })
      .catch((e) => toast.error('Could not load providers', { description: String(e) }));
  }, [open]);

  function chooseProvider(id: string | null) {
    setProviderId(id);
    writeProviderPref(id);
    if (id) toast.success(`Now using ${providers?.find((p) => p.id === id)?.label || id}`);
    else    toast.success('Reverted to default provider');
  }
  const activeProviderId = providerId ?? defaultId ?? '';

  async function onReindex() {
    setReindexing(true);
    try {
      await reingest();
      toast.success('Re-indexed all files');
    } catch (e: unknown) {
      toast.error('Re-index failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setReindexing(false);
    }
  }

  async function onClear() {
    if (!confirm('Clear all chat history? This cannot be undone.')) return;
    setClearing(true);
    try { await clearHistory(); }
    finally { setClearing(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-6 px-5 py-5">
          {/* AI MODEL */}
          <SectionGroup title="AI model">
            <Row
              icon={<Cpu className="h-4 w-4" />}
              label="Provider"
              hint={
                providers
                  ? `Active: ${providers.find((p) => p.id === activeProviderId)?.label || activeProviderId} · ${providers.find((p) => p.id === activeProviderId)?.model || '—'}`
                  : 'Loading providers…'
              }
            >
              {providers && providers.length > 0 ? (
                <Segmented
                  options={providers.filter((p) => p.available).map((p) => ({
                    value: p.id,
                    label: p.label.replace('Google ', ''),
                  }))}
                  value={activeProviderId}
                  onChange={(v) => chooseProvider(v)}
                />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </Row>
          </SectionGroup>

          {/* APP */}
          <SectionGroup title="App">
            <Row
              icon={<Globe className="h-4 w-4" />}
              label="Interface language"
            >
              <Segmented
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'ar', label: 'العربية' },
                ]}
                value={lang}
                onChange={(v) => setLang(v as 'en' | 'ar')}
              />
            </Row>
            <Row
              icon={<Palette className="h-4 w-4" />}
              label="Theme"
            >
              <Segmented
                options={[
                  { value: 'light', label: 'Light', icon: <Sun  className="h-3.5 w-3.5" /> },
                  { value: 'dark',  label: 'Dark',  icon: <Moon className="h-3.5 w-3.5" /> },
                ]}
                value={theme}
                onChange={(v) => setTheme(v as 'light' | 'dark')}
              />
            </Row>
          </SectionGroup>

          {/* DATA */}
          <SectionGroup title="Data">
            <Row
              icon={<Database className="h-4 w-4" />}
              label="Re-index company files"
              hint="Rebuild the search index from company_data/."
            >
              <Button
                onClick={onReindex}
                disabled={reindexing}
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-3"
              >
                {reindexing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                <span>Run</span>
              </Button>
            </Row>
            <Row
              icon={<MessageSquare className="h-4 w-4" />}
              label="Clear chat history"
              hint="Delete every saved conversation. Cannot be undone."
              destructive
            >
              <Button
                onClick={onClear}
                disabled={clearing}
                variant="destructive"
                size="sm"
                className="h-7 gap-1.5 px-3"
              >
                {clearing
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                <span>Clear</span>
              </Button>
            </Row>
          </SectionGroup>

          {/* RESOURCES */}
          <SectionGroup title="Resources">
            <LinkRow
              icon={<Code2 className="h-4 w-4" />}
              label="API documentation"
              href={`${API_URL}/docs`}
            />
            <LinkRow
              icon={<HelpCircle className="h-4 w-4" />}
              label="Get help"
              onClick={() =>
                toast(
                  'Try: "Show employee with iqama <number>", "Create delay warning for employee <id>", or upload a file then ask about it.',
                  { duration: 7000 },
                )
              }
            />
            <LinkRow
              icon={<Info className="h-4 w-4" />}
              label="About"
              valueRight="v1.0 · Local · DeepSeek"
              onClick={() => toast('AI Company Brain · v1.0\nLocal-first · DeepSeek + ChromaDB RAG\nNext.js 15 · FastAPI · sentence-transformers', { duration: 7000 })}
            />
          </SectionGroup>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── building blocks ─────────────────────────── */

function SectionGroup({
  title, children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon, label, hint, destructive, children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted',
          destructive ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm font-medium', destructive ? 'text-destructive' : 'text-foreground')}>
          {label}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function LinkRow({
  icon, label, href, onClick, valueRight,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  valueRight?: string;
}) {
  const cls = 'group flex w-full items-center gap-3 px-3 py-3 text-start transition-colors hover:bg-accent/40';
  const inner = (
    <>
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1 text-sm font-medium text-foreground">{label}</div>
      {valueRight && <span className="text-xs text-muted-foreground">{valueRight}</span>}
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}

function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
