'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  Download,
  FileSignature,
  Folder,
  FolderPlus,
  Lock,
  MoreHorizontal,
  Move,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GeneratedDoc,
  GeneratedGroup,
  createGeneratedGroup,
  deleteGeneratedDoc,
  deleteGeneratedGroup,
  generatedDownloadUrl,
  listGenerated,
  moveGeneratedDoc,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty } from '@/components/ui/empty';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useLang } from '@/app/providers';
import { t } from '@/lib/i18n';
import { formatBytes, formatEpoch } from '@/lib/utils';
import { cn } from '@/lib/cn';

const EXPANDED_KEY = 'acb.gen.expanded';

function readExpanded(): Record<string, boolean> {
  try {
    const raw = typeof window === 'undefined' ? null : localStorage.getItem(EXPANDED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch { return {}; }
}
function writeExpanded(value: Record<string, boolean>): void {
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(value)); } catch {/* ignore */}
}

export default function GeneratedPage() {
  const { lang } = useLang();
  const [groups, setGroups] = useState<GeneratedGroup[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load persisted expanded state on mount
  useEffect(() => { setExpanded(readExpanded()); }, []);

  const toggleGroup = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      writeExpanded(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await listGenerated();
      setGroups(r.groups);
    } catch (e: unknown) {
      toast.error('Failed to load', { description: e instanceof Error ? e.message : String(e) });
      setGroups([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function onCreateGroup() {
    const name = window.prompt('New group name', '');
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      await createGeneratedGroup(name.trim());
      toast.success(`Created group "${name.trim()}"`);
      await refresh();
    } catch (e: unknown) {
      toast.error('Create failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  }

  async function onDeleteGroup(g: GeneratedGroup) {
    if (g.reserved) return;
    if (g.count > 0) {
      toast.error('Group is not empty', { description: 'Move or delete its files first.' });
      return;
    }
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try {
      await deleteGeneratedGroup(g.name);
      toast.success(`Deleted group "${g.name}"`);
      await refresh();
    } catch (e: unknown) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }

  async function onMoveDoc(doc: GeneratedDoc, to: string) {
    if (to === doc.group) return;
    try {
      await moveGeneratedDoc(doc.filename, doc.group, to);
      toast.success(`Moved to "${to}"`);
      await refresh();
    } catch (e: unknown) {
      toast.error('Move failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }

  async function onDeleteDoc(doc: GeneratedDoc) {
    if (!confirm(`Delete ${doc.filename}?`)) return;
    try {
      await deleteGeneratedDoc(doc.group, doc.filename);
      toast.success('Deleted');
      await refresh();
    } catch (e: unknown) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }

  const totalDocs = groups?.reduce((n, g) => n + g.count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'gen_title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t(lang, 'gen_sub')}</p>
        </div>
        <Button onClick={onCreateGroup} disabled={creating} size="sm" className="gap-1.5">
          <FolderPlus className="h-3.5 w-3.5" />
          New group
        </Button>
      </div>

      {groups === null && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[140px] rounded-lg" />)}
        </div>
      )}

      {groups && totalDocs === 0 && groups.every((g) => g.count === 0) && (
        <Empty
          icon={<Sparkles className="h-5 w-5" />}
          title={t(lang, 'gen_empty_title')}
          description={t(lang, 'gen_empty_sub')}
          action={<Button asChild size="sm"><Link href="/">{t(lang, 'gen_open_chat')}</Link></Button>}
        />
      )}

      <div className="space-y-2">
        {groups?.map((g) => (
          <GroupSection
            key={g.name}
            group={g}
            allGroups={groups}
            expanded={!!expanded[g.name]}
            onToggle={() => toggleGroup(g.name)}
            onMoveDoc={onMoveDoc}
            onDeleteDoc={onDeleteDoc}
            onDeleteGroup={() => onDeleteGroup(g)}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================== */

function GroupSection({
  group, allGroups, expanded, onToggle, onMoveDoc, onDeleteDoc, onDeleteGroup,
}: {
  group: GeneratedGroup;
  allGroups: GeneratedGroup[];
  expanded: boolean;
  onToggle: () => void;
  onMoveDoc: (doc: GeneratedDoc, to: string) => void;
  onDeleteDoc: (doc: GeneratedDoc) => void;
  onDeleteGroup: () => void;
}) {
  const headerId = `gh-${group.name}`;
  const panelId  = `gp-${group.name}`;
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card/40 shadow-soft',
        'transition-colors',
        expanded && 'bg-card',
      )}
    >
      <div className="flex items-center gap-2 px-3">
        <button
          id={headerId}
          aria-controls={panelId}
          aria-expanded={expanded}
          onClick={onToggle}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-3 text-start',
            'transition-colors hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring/30',
          )}
        >
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </motion.span>
          <Folder className={cn('h-4 w-4 shrink-0 transition-colors', expanded ? 'text-primary' : 'text-muted-foreground')} />
          <h2 className="truncate text-sm font-semibold tracking-tight capitalize">
            {group.name}
          </h2>
          <span className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors',
            group.count > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {group.count}
          </span>
          {group.reserved && (
            <Tooltip content="Reserved — warnings auto-save here">
              <Lock className="h-3 w-3 text-muted-foreground/60" />
            </Tooltip>
          )}
        </button>
        {!group.reserved && (
          <Tooltip content={group.count > 0 ? 'Empty the group to delete it' : 'Delete group'}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => { e.stopPropagation(); onDeleteGroup(); }}
              disabled={group.count > 0}
              className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:hover:text-muted-foreground"
              aria-label="Delete group"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={headerId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 px-4 py-4">
              {group.count === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
                  No documents in this group yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence initial={false}>
                    {group.items.map((d, i) => (
                      <DocCard
                        key={`${group.name}/${d.filename}`}
                        doc={d}
                        index={i}
                        allGroups={allGroups}
                        onMove={onMoveDoc}
                        onDelete={onDeleteDoc}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function DocCard({
  doc, index, allGroups, onMove, onDelete,
}: {
  doc: GeneratedDoc;
  index: number;
  allGroups: GeneratedGroup[];
  onMove: (doc: GeneratedDoc, to: string) => void;
  onDelete: (doc: GeneratedDoc) => void;
}) {
  const otherGroups = allGroups.filter((g) => g.name !== doc.group);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 8) * 0.03 } }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group relative flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-ring/40 hover:shadow-elev"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-soft">
          <FileSignature className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground" title={doc.filename}>
            {doc.filename}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatBytes(doc.size)} · {formatEpoch(doc.created_at)}
          </div>
        </div>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Document actions"
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground',
                'opacity-0 transition-opacity hover:bg-accent hover:text-foreground',
                'group-hover:opacity-100 data-[state=open]:opacity-100 focus:opacity-100',
                'focus:outline-none focus:ring-2 focus:ring-ring/40',
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={generatedDownloadUrl(doc.filename, doc.group)} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </a>
            </DropdownMenuItem>
            {otherGroups.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  <Move className="me-1.5 inline h-3 w-3" />
                  Move to
                </DropdownMenuLabel>
                {otherGroups.map((g) => (
                  <DropdownMenuItem key={g.name} onSelect={() => onMove(doc, g.name)}>
                    <Folder className="h-3.5 w-3.5" />
                    <span className="capitalize">{g.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => onDelete(doc)}>
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Button asChild variant="outline" size="sm" className="w-full gap-2">
        <a href={generatedDownloadUrl(doc.filename, doc.group)} target="_blank" rel="noreferrer">
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </Button>
    </motion.div>
  );
}
