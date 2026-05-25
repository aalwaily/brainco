'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  Calculator,
  Inbox,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CATEGORIES,
  Category,
  CompanyCategoryGroup,
  CompanyFile,
  deleteFile,
  listFiles,
  reingest,
} from '@/lib/api';
import { Dropzone } from '@/components/Dropzone';
import { useLang } from '@/app/providers';
import { t } from '@/lib/i18n';
import { formatBytes, formatEpoch } from '@/lib/utils';
import { iconForFile } from '@/lib/file-icon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const CATEGORY_META: Record<Category, { icon: typeof Users; tint: string; hint: string }> = {
  'HR':                     { icon: Users,      tint: 'text-violet-400',  hint: 'Employees, payroll, warnings, training…' },
  'Accounts':               { icon: Calculator, tint: 'text-emerald-400', hint: 'Invoices, payments, budgets, audits…' },
  'Operations and Project': { icon: Briefcase,  tint: 'text-sky-400',     hint: 'Contracts, plans, vendors, reports…' },
};

export default function FilesPage() {
  const { lang } = useLang();
  const [groups, setGroups] = useState<CompanyCategoryGroup[] | null>(null);
  const [uncategorized, setUncategorized] = useState<CompanyFile[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await listFiles();
      setGroups(r.categories);
      setUncategorized(r.uncategorized);
    } catch (e: unknown) {
      toast.error('Failed to load files', { description: e instanceof Error ? e.message : String(e) });
      setGroups([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function onDelete(f: CompanyFile) {
    if (!confirm(t(lang, 'files_confirm_delete', { name: f.name }))) return;
    setBusy(true);
    try {
      await deleteFile(f.name, f.category ?? undefined);
      toast.success('File deleted');
      await refresh();
    } catch (e: unknown) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onReingest() {
    setBusy(true);
    try {
      await reingest();
      toast.success('Re-indexed successfully');
      await refresh();
    } catch (e: unknown) {
      toast.error('Re-index failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const totalFiles = (groups?.reduce((n, g) => n + g.count, 0) ?? 0) + uncategorized.length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'files_title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Files are auto-routed into <b>HR</b>, <b>Accounts</b>, or <b>Operations &amp; Project</b> based on their name. Drop into a section to force its category.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReingest} disabled={busy} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {t(lang, 'files_reindex')}
        </Button>
      </div>

      {/* Auto-classify drop zone */}
      <Dropzone
        onUploaded={refresh}
        title="Drop files here — we'll route them to the right folder"
        subtitle="PDF · DOCX · XLSX · CSV · TXT · auto-classified by filename"
      />

      {groups === null && (
        <div className="mt-10 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      )}

      {groups && totalFiles === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 h-5 w-5" />
          {t(lang, 'files_empty')}
        </div>
      )}

      <div className="mt-10 space-y-6">
        {groups?.map((g) => (
          <CategorySection
            key={g.name}
            group={g}
            busy={busy}
            onDelete={onDelete}
            onRefresh={refresh}
          />
        ))}

        {uncategorized.length > 0 && (
          <section className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              Loose files
              <Badge variant="outline">{uncategorized.length}</Badge>
              <span className="text-xs font-normal text-muted-foreground">
                (left in <code>company_data/</code> root)
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {uncategorized.map((f, i) => <FileCard key={f.relative_path} f={f} i={i} onDelete={onDelete} busy={busy} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ============================================================== */

function CategorySection({
  group, busy, onDelete, onRefresh,
}: {
  group: CompanyCategoryGroup;
  busy: boolean;
  onDelete: (f: CompanyFile) => void;
  onRefresh: () => void;
}) {
  const meta = CATEGORY_META[group.name];
  const Icon = meta.icon;
  return (
    <section className="rounded-xl border border-border bg-card/40 shadow-soft">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted', meta.tint)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{group.name}</h2>
            <p className="truncate text-[11px] text-muted-foreground">{meta.hint}</p>
          </div>
        </div>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-medium',
          group.count > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}>
          {group.count}
        </span>
      </div>

      <div className="p-4">
        <Dropzone
          compact
          category={group.name}
          onUploaded={onRefresh}
          title={`Drop files into ${group.name}`}
          subtitle="PDF · DOCX · XLSX · CSV · TXT"
        />

        {group.count > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {group.items.map((f, i) => (
                <FileCard key={f.relative_path} f={f} i={i} busy={busy} onDelete={onDelete} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-muted-foreground">No files in this group yet.</p>
        )}
      </div>
    </section>
  );
}

function FileCard({
  f, i, busy, onDelete,
}: {
  f: CompanyFile;
  i: number;
  busy: boolean;
  onDelete: (f: CompanyFile) => void;
}) {
  const { Icon, color } = iconForFile(f.type);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group relative flex items-start gap-3 rounded-lg border border-border bg-card p-3.5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-ring/40 hover:shadow-elev"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted">
        <Icon className={`h-5 w-5 ${color}`} strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground" title={f.name}>{f.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="uppercase">{f.type}</Badge>
          <span>·</span>
          <span>{formatBytes(f.size)}</span>
          <span>·</span>
          <span className="truncate">{formatEpoch(f.modified_at)}</span>
        </div>
      </div>
      <Tooltip content="Delete">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(f)}
          disabled={busy}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </motion.div>
  );
}
