'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp,
  Circle,
  PanelLeft,
  Plus,
  MessageSquareText,
  FolderOpen,
  FileSignature,
  Search,
  Settings,
  Trash2,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Copy,
  CornerDownRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import {
  listSessions, deleteSession, renameSession,
  ChatSession,
} from '@/lib/api';
import { useChat } from '@/app/chat-store';
import { useLang } from '@/app/providers';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  getPinned, togglePin as togglePinPref,
  dropAll as dropAllPrefs,
} from '@/lib/chat-prefs';
import { SettingsDialog } from './SettingsDialog';

const COLLAPSED_KEY = 'acb.sidebar.collapsed';

export function AppSidebar() {
  // Desktop: collapsed (rail fully hidden) vs expanded.
  const [collapsed, setCollapsed] = useState(false);
  // Mobile: drawer open/closed (overrides desktop collapsed semantics).
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    try {
      const v = localStorage.getItem(COLLAPSED_KEY);
      if (v === '1') setCollapsed(true);
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {/* ignore */}
  }, [collapsed, mounted]);

  // Cmd/Ctrl + B toggles (desktop), Esc closes drawer (mobile)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (window.innerWidth < 768) setMobileOpen((o) => !o);
        else                          setCollapsed((c) => !c);
      } else if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Close mobile drawer on route change so nav clicks land cleanly.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const desktopHidden = collapsed; // desktop-only: aside collapsed to 0 width

  return (
    <>
      <aside
        aria-hidden={!mobileOpen && desktopHidden}
        className={cn(
          // Base
          'flex h-[100dvh] w-[280px] shrink-0 flex-col overflow-hidden bg-card backdrop-blur',
          // MOBILE: fixed drawer with slide-in
          'fixed inset-y-0 start-0 z-50 transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0 rtl:translate-x-0' : '-translate-x-full rtl:translate-x-full',
          'border-e border-border shadow-elev',
          // DESKTOP: sticky in-flow, width animates between 0 and 268
          'md:sticky md:top-0 md:translate-x-0 md:rtl:translate-x-0',
          'md:shadow-none md:transition-[width] md:duration-300',
          desktopHidden ? 'md:w-0 md:border-0' : 'md:w-[268px] md:border-e md:border-border',
        )}
      >
        <Header
          collapsed={false}
          onToggle={() => {
            if (window.innerWidth < 768) setMobileOpen(false);
            else                          setCollapsed(true);
          }}
        />
        <NewChatButton collapsed={false} />
        <PrimaryNav collapsed={false} />
        <Recents collapsed={false} />
        <Footer collapsed={false} />
      </aside>

      {/* Mobile drawer backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm md:hidden"
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* Floating "open" button. Mobile: open drawer. Desktop: expand sidebar when collapsed. */}
      <AnimatePresence>
        {(!mobileOpen) && (
          <motion.div
            key="floating-open"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'fixed start-3 top-3 z-30',
              // Always shown on mobile; on desktop only when sidebar is collapsed
              desktopHidden ? 'block' : 'block md:hidden',
            )}
          >
            <button
              onClick={() => {
                if (window.innerWidth < 768) setMobileOpen(true);
                else                          setCollapsed(false);
              }}
              aria-label="Open sidebar"
              className={cn(
                'grid h-9 w-9 place-items-center rounded-lg',
                'bg-card/80 text-muted-foreground backdrop-blur',
                'border border-border ring-1 ring-black/5 dark:ring-white/5',
                'shadow-soft transition-colors',
                'hover:bg-accent hover:text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring/40',
              )}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* -------------------------- Header --------------------------- */

function Header({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { newChat } = useChat();
  const router = useRouter();
  const pathname = usePathname();

  const onNew = () => {
    newChat();
    if (pathname !== '/') router.push('/');
  };
  const onSearch = () => {
    const el = document.getElementById('sidebar-history-search') as HTMLInputElement | null;
    el?.focus();
    el?.select();
  };

  return (
    <div className="flex h-12 items-center justify-between gap-1 px-2">
      <div className="flex items-center gap-1">
        <Tooltip content="New chat" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNew}
            aria-label="New chat"
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Search history" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onSearch}
            aria-label="Search history"
            className="text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      <Tooltip content={collapsed ? 'Expand sidebar  ⌘B' : 'Collapse sidebar  ⌘B'} side="bottom">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label="Toggle sidebar"
          className="text-muted-foreground hover:text-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

/* ------------------------ New Chat --------------------------- */

function NewChatButton({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { newChat } = useChat();
  return (
    <div className="px-2 pt-2">
      <Tooltip content={collapsed ? 'New chat' : ''} side="right">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            newChat();
            if (pathname !== '/') router.push('/');
          }}
          className={cn(
            'w-full justify-center gap-2 border-border/80 bg-card text-foreground shadow-soft',
            'hover:border-ring/40 hover:bg-accent',
            !collapsed && 'justify-start px-3',
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="text-sm">New chat</span>}
        </Button>
      </Tooltip>
    </div>
  );
}

/* ----------------------- Primary Nav ------------------------- */

function NavLink({
  href, label, Icon, active, collapsed,
}: {
  href: string;
  label: string;
  Icon: typeof MessageSquareText;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Tooltip content={collapsed ? label : ''} side="right">
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
          active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          collapsed && 'justify-center px-0',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    </Tooltip>
  );
}

function PrimaryNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { lang } = useLang();
  const items = [
    { href: '/',          label: t(lang, 'nav_chat'),      Icon: MessageSquareText },
    { href: '/files',     label: t(lang, 'nav_files'),     Icon: FolderOpen },
    { href: '/generated', label: t(lang, 'nav_generated'), Icon: FileSignature },
  ];
  return (
    <nav className="mt-2 space-y-0.5 px-2">
      {items.map((it) => (
        <NavLink key={it.href} {...it} active={pathname === it.href} collapsed={collapsed} />
      ))}
    </nav>
  );
}

/* ------------------------- Recents --------------------------- */

function previewText(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? oneLine.slice(0, 60) + '…' : oneLine;
}

function Recents({ collapsed }: { collapsed: boolean }) {
  const { loadSession, currentSessionId, historyVersion } = useChat();
  const router = useRouter();
  const [items, setItems] = useState<ChatSession[] | null>(null);
  const [query, setQuery] = useState('');
  const [pinned, setPinned] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    setItems(null);
    listSessions(80)
      .then((r) => { if (alive) setItems(r.items); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [historyVersion]);

  useEffect(() => { setPinned(getPinned()); }, []);

  const open = useCallback((s: ChatSession) => {
    void loadSession(s.id);
    router.push('/');
  }, [loadSession, router]);

  const handlePin = useCallback((id: number) => {
    const pinnedNow = togglePinPref(id);
    setPinned((prev) => pinnedNow ? [id, ...prev.filter((x) => x !== id)] : prev.filter((x) => x !== id));
    toast.success(pinnedNow ? 'Pinned' : 'Unpinned');
  }, []);

  const handleRename = useCallback(async (s: ChatSession) => {
    const next = window.prompt('Rename chat', s.title);
    if (next === null || !next.trim()) return;
    try {
      await renameSession(s.id, next.trim());
      setItems((prev) => prev?.map((x) => (x.id === s.id ? { ...x, title: next.trim() } : x)) ?? null);
    } catch (e: unknown) {
      toast.error('Rename failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this chat? It will be removed from history.')) return;
    try {
      await deleteSession(id);
      dropAllPrefs(id);
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? null);
      setPinned((prev) => prev.filter((x) => x !== id));
      toast.success('Deleted');
    } catch (e: unknown) {
      toast.error('Delete failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const matches = useCallback((s: ChatSession) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return s.title.toLowerCase().includes(q);
  }, [query]);

  const { pinnedItems, recentItems } = useMemo(() => {
    const pinSet = new Set(pinned);
    const all = items ?? [];
    const visible = all.filter(matches);
    const pinnedRank = (id: number) => pinned.indexOf(id);
    const p = visible
      .filter((s) => pinSet.has(s.id))
      .sort((a, b) => pinnedRank(a.id) - pinnedRank(b.id));
    const r = visible.filter((s) => !pinSet.has(s.id));
    return { pinnedItems: p, recentItems: r };
  }, [items, pinned, matches]);

  if (collapsed) {
    return <div className="flex-1" />;
  }

  const renderItem = (s: ChatSession, i: number) => {
    const titleText = s.title;
    const isPinnedRow = pinned.includes(s.id);
    const isActive = currentSessionId === s.id;
    return (
      <motion.div
        key={s.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.012 } }}
        exit={{ opacity: 0 }}
        className={cn(
          'group/item relative flex items-center gap-1 rounded-md text-[12.5px] transition-colors',
          isActive
            ? 'bg-accent text-foreground'
            : 'text-foreground/85 hover:bg-accent hover:text-foreground',
        )}
      >
        <button
          onClick={() => open(s)}
          title={titleText}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-start"
        >
          <Circle
            className={cn(
              'h-2.5 w-2.5 shrink-0 transition-colors',
              isActive    && 'fill-primary text-primary',
              !isActive && isPinnedRow && 'fill-foreground/70 text-foreground/70',
              !isActive && !isPinnedRow && 'text-muted-foreground/50 group-hover/item:text-foreground/70',
            )}
            strokeWidth={isActive || isPinnedRow ? 0 : 1.5}
          />
          <span className="min-w-0 flex-1 truncate">{previewText(titleText)}</span>
        </button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Chat options"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'me-1 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground',
                'opacity-0 transition-opacity hover:bg-background hover:text-foreground',
                'group-hover/item:opacity-100 data-[state=open]:opacity-100',
                'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/40',
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onSelect={() => open(s)}>
              <CornerDownRight className="h-3.5 w-3.5" />
              <span>Open</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlePin(s.id)}>
              {isPinnedRow
                ? <><PinOff className="h-3.5 w-3.5" /><span>Unpin</span></>
                : <><Pin    className="h-3.5 w-3.5" /><span>Pin</span></>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleRename(s)}>
              <Pencil className="h-3.5 w-3.5" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleCopy(s.title)}>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy title</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => handleDelete(s.id)}>
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>
    );
  };

  const noMatches = (items?.length ?? 0) > 0 && pinnedItems.length === 0 && recentItems.length === 0;

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="relative mx-2 mb-1 mt-1">
        <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="sidebar-history-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search history…"
          className="h-8 w-full rounded-md border border-border/70 bg-card/60 ps-7 pe-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {items === null && (
          <div className="space-y-1.5 px-1 py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-7 w-full rounded-md" />
            ))}
          </div>
        )}
        {items && items.length === 0 && (
          <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            No conversations yet. Ask anything to get started.
          </div>
        )}
        {noMatches && (
          <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            Nothing matches “{query}”.
          </div>
        )}

        {pinnedItems.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pinned
            </div>
            <AnimatePresence initial={false}>
              {pinnedItems.map((h, i) => renderItem(h, i))}
            </AnimatePresence>
          </>
        )}

        {recentItems.length > 0 && (
          <>
            {pinnedItems.length > 0 && (
              <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recents
              </div>
            )}
            <AnimatePresence initial={false}>
              {recentItems.map((h, i) => renderItem(h, i))}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Footer --------------------------- */

function Footer({ collapsed }: { collapsed: boolean }) {
  const { newChat } = useChat();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="border-t border-border/60 p-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md p-1.5 text-sm transition-colors',
              'hover:bg-accent focus:bg-accent focus:outline-none focus:ring-2 focus:ring-ring/40',
              collapsed && 'justify-center p-1',
            )}
            aria-label="Account menu"
          >
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
              AB
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-start leading-tight">
                  <div className="truncate text-[12.5px] font-medium text-foreground">
                    Local instance
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">v1.0 · DeepSeek</div>
                </div>
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          className="w-[240px]"
        >
          <DropdownMenuLabel>AI Company Brain</DropdownMenuLabel>

          <DropdownMenuItem onSelect={() => { newChat(); toast.success('New chat'); }}>
            <Plus className="h-3.5 w-3.5" />
            <span>New chat</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              // Let the dropdown finish its close transition before mounting
              // the dialog — otherwise the two Radix portals race and the
              // dialog never appears.
              setTimeout(() => setSettingsOpen(true), 0);
            }}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
            <span className="ms-auto text-[10px] text-muted-foreground">Theme · Lang · Data</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
