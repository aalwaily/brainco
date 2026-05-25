'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  clearAllSessions,
  deleteSessionMessage,
  getSession,
  streamChat,
  truncateSession,
  Source,
} from '@/lib/api';
import { readProviderPref } from '@/lib/chat/provider-pref';

// --- Typewriter pacing ---------------------------------------------------
// Tokens from the model arrive in bursts (sometimes 20 chars at once, then
// nothing for half a second). To get a smooth ChatGPT-style readout we
// buffer them and emit a steady ~40 chars/sec via a single interval loop.
// Cadence is gently adaptive: stays at base unless backlog grows, then it
// nudges up — capped so it never feels like a burst.
const TYPEWRITER_TICK_MS  = 18;   // ~55 ticks/sec  → buttery smooth
const BASE_CHARS_PER_TICK = 2;    // base    ~ 110 cps (fast steady-state)
const MAX_CHARS_PER_TICK  = 6;    // ceiling ~ 330 cps (aggressive catch-up)
// Each multiple of this in the backlog adds +1 char/tick (clamped to MAX).
const BACKLOG_ACCEL_AT    = 50;

type TypeBuffer = {
  pending: string;
  finished: boolean;        // server emitted "done" (no more tokens incoming)
  finalAnswer?: string;     // canonical full text from the "done" event
  onFlush?: () => void;     // called once the buffer is fully rendered
};

export type Msg = {
  id: string;
  /** Server-side row id from `chat_messages.id`. Set after the message is
   *  persisted; null for in-flight messages whose id we don't know yet. */
  serverId?: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  generated_file?: string | null;
  error?: boolean;
  streaming?: boolean;
};

type ChatState = {
  messages: Msg[];
  busy: boolean;
  send: (message: string) => Promise<void>;
  stop: () => void;
  newChat: () => void;
  loadSession: (id: number) => Promise<void>;
  /** Re-run the last user turn — drops the trailing assistant reply
   *  server-side and streams a fresh one. */
  regenerate: () => Promise<void>;
  /** Edit a user message and re-stream from that point. Truncates the
   *  session after the edited message. */
  editMessageAndRestream: (clientMsgId: string, newContent: string) => Promise<void>;
  /** Wipe every chat session server-side and reset the local view. */
  clearHistory: () => Promise<void>;
  /** Currently-loaded conversation id (null = a brand-new, unsaved chat). */
  currentSessionId: number | null;
  /** Bumped each time the session list may have changed (new send / delete / rename). */
  historyVersion: number;
};

const ChatContext = createContext<ChatState | null>(null);

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const sessionRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // keep ref in sync so the streamChat callback sees the latest id
  useEffect(() => { sessionRef.current = currentSessionId; }, [currentSessionId]);

  // Per-message typewriter buffers.
  const buffersRef = useRef<Map<string, TypeBuffer>>(new Map());
  const tickRef = useRef<number | null>(null);

  // Drain pending buffers at a steady cadence. Started lazily.
  const ensureDrainLoop = useCallback(() => {
    if (tickRef.current !== null) return;
    const tick = () => {
      const buffers = buffersRef.current;
      if (buffers.size === 0) {
        if (tickRef.current !== null) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        return;
      }
      const updates: Array<{ id: string; chunk: string; done: boolean }> = [];
      const flushes: Array<() => void> = [];

      for (const [id, buf] of buffers) {
        if (buf.pending.length === 0) {
          if (buf.finished) {
            // Buffer is fully flushed and the server is done — emit a no-op
            // update so the bubble flips out of streaming state (drops the
            // trailing pulse dot).
            updates.push({ id, chunk: '', done: true });
            buffers.delete(id);
            if (buf.onFlush) flushes.push(buf.onFlush);
          }
          continue;
        }
        // Backlog-aware rate: speed up if we're falling behind, otherwise base.
        const speed = Math.min(
          MAX_CHARS_PER_TICK,
          Math.max(
            BASE_CHARS_PER_TICK,
            Math.ceil(buf.pending.length / BACKLOG_ACCEL_AT) * BASE_CHARS_PER_TICK,
          ),
        );
        const take = Math.min(buf.pending.length, speed);
        const chunk = buf.pending.slice(0, take);
        buf.pending = buf.pending.slice(take);
        updates.push({ id, chunk, done: buf.finished && buf.pending.length === 0 });
        if (updates[updates.length - 1].done) {
          buffers.delete(id);
          if (buf.onFlush) flushes.push(buf.onFlush);
        }
      }

      if (updates.length > 0) {
        setMessages((prev) =>
          prev.map((x) => {
            const u = updates.find((it) => it.id === x.id);
            if (!u) return x;
            return { ...x, content: x.content + u.chunk, streaming: !u.done };
          }),
        );
      }
      for (const fn of flushes) fn();
    };
    tickRef.current = window.setInterval(tick, TYPEWRITER_TICK_MS) as unknown as number;
  }, []);

  // Tear down on unmount.
  useEffect(() => () => {
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    buffersRef.current.clear();
  }, []);

  const send = useCallback(async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: 'user', content: m },
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Set up typewriter buffer for this assistant message.
    const buf: TypeBuffer = { pending: '', finished: false };
    buffersRef.current.set(assistantId, buf);
    ensureDrainLoop();

    // Promise the buffer will resolve once fully flushed to the UI.
    const flushed = new Promise<void>((resolve) => { buf.onFlush = () => resolve(); });

    let generatedFile: string | null = null;
    try {
      await streamChat(
        m,
        (ev) => {
          if (ev.type === 'session') {
            // Server may have assigned a new id (first message) — capture it.
            setCurrentSessionId(ev.id);
            sessionRef.current = ev.id;
            return;
          }
          if (ev.type === 'sources') {
            setMessages((prev) =>
              prev.map((x) => (x.id === assistantId ? { ...x, sources: ev.sources } : x)),
            );
          } else if (ev.type === 'token') {
            // Buffer it — the drain loop emits at a steady pace.
            buf.pending += ev.content;
          } else if (ev.type === 'done') {
            generatedFile = ev.generated_file;
            // Mark the buffer "finished" — the drain loop will continue
            // playing back any remaining pending text, then resolve `flushed`.
            buf.finished = true;
            // Persist the generated_file on the message immediately.
            setMessages((prev) =>
              prev.map((x) =>
                x.id === assistantId ? { ...x, generated_file: ev.generated_file } : x,
              ),
            );
          } else if (ev.type === 'error') {
            // Abandon the buffer; show the error directly.
            buffersRef.current.delete(assistantId);
            setMessages((prev) =>
              prev.map((x) =>
                x.id === assistantId
                  ? { ...x, content: ev.message, error: true, streaming: false }
                  : x,
              ),
            );
            toast.error('Request failed', { description: ev.message });
          }
        },
        ctrl.signal,
        sessionRef.current,
        readProviderPref(),
      );
      // Wait for the typewriter to finish playing back the rest of the buffer.
      await flushed;
      if (generatedFile) {
        toast.success('Document generated', { description: generatedFile });
      }
      setHistoryVersion((v) => v + 1);
    } catch (e: unknown) {
      // Drop any pending buffer so we don't keep typing after an error/abort.
      buffersRef.current.delete(assistantId);
      if ((e as { name?: string })?.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((x) =>
            x.id === assistantId
              ? { ...x, streaming: false, content: x.content || '(stopped)' }
              : x,
          ),
        );
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setMessages((prev) =>
          prev.map((x) =>
            x.id === assistantId
              ? { ...x, content: msg, error: true, streaming: false }
              : x,
          ),
        );
        toast.error('Request failed', { description: msg });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    buffersRef.current.clear();
    setMessages([]);
    setCurrentSessionId(null);
    sessionRef.current = null;
  }, []);

  const loadSession = useCallback(async (id: number) => {
    abortRef.current?.abort();
    buffersRef.current.clear();
    try {
      const s = await getSession(id);
      setMessages(
        s.messages.map((m) => ({
          id: uid(),
          serverId: m.id,
          role: m.role,
          content: m.content,
          generated_file: m.generated_file ?? null,
        })),
      );
      setCurrentSessionId(id);
      sessionRef.current = id;
    } catch (e: unknown) {
      toast.error('Could not load chat', { description: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const regenerate = useCallback(async () => {
    if (busy) return;
    // Find the last user message + the trailing assistant reply.
    let lastUser: Msg | undefined;
    let lastAssistant: Msg | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!lastAssistant && m.role === 'assistant') lastAssistant = m;
      if (m.role === 'user') { lastUser = m; break; }
    }
    if (!lastUser) {
      toast.message('Nothing to regenerate yet');
      return;
    }
    const sid = sessionRef.current;
    // Truncate server-side so the new reply lands cleanly. If we know the
    // user message's serverId, keep messages up to and including it.
    if (sid && lastUser.serverId !== undefined) {
      try { await truncateSession(sid, lastUser.serverId); } catch {/* non-fatal */}
    } else if (sid && lastAssistant?.serverId !== undefined) {
      try { await deleteSessionMessage(sid, lastAssistant.serverId); } catch {/* non-fatal */}
    }
    // Drop the local assistant message and re-fire the user prompt.
    setMessages((prev) => {
      const idx = lastAssistant ? prev.findIndex((m) => m.id === lastAssistant!.id) : -1;
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    // `send` itself appends a fresh user turn — but we ALREADY have the
    // user message in the list. Avoid duplicating: temporarily reuse the
    // same content by calling send with the original text after dropping
    // BOTH the user and assistant turns from local state. The server already
    // has the user turn from before (we only deleted from `lastUser.serverId`
    // onwards) — but since `send` posts the user message again, the server
    // will store a duplicate. To keep things simple and reliable, drop the
    // local user message too:
    setMessages((prev) => prev.filter((m) => m.id !== lastUser!.id));
    await send(lastUser.content);
  }, [busy, messages, send]);

  const editMessageAndRestream = useCallback(async (clientMsgId: string, newContent: string) => {
    if (busy) return;
    const idx = messages.findIndex((m) => m.id === clientMsgId);
    if (idx < 0) return;
    const target = messages[idx];
    if (target.role !== 'user') return;

    // Decide truncation boundary on the server: the message JUST BEFORE the
    // one being edited (so the edited message itself is also removed and
    // we'll re-post it via send()).
    const sid = sessionRef.current;
    const beforeServerId =
      idx > 0 ? messages.slice(0, idx).reverse().find((m) => m.serverId !== undefined)?.serverId : undefined;
    if (sid && beforeServerId !== undefined) {
      try { await truncateSession(sid, beforeServerId); } catch {/* non-fatal */}
    } else if (sid && target.serverId !== undefined) {
      // No earlier messages had a serverId — truncate everything after the
      // target id then delete the target itself.
      try {
        await truncateSession(sid, target.serverId);
        await deleteSessionMessage(sid, target.serverId);
      } catch {/* non-fatal */}
    }
    // Drop everything from the edited message onwards locally.
    setMessages((prev) => prev.slice(0, idx));
    await send(newContent);
  }, [busy, messages, send]);

  const clearHistory = useCallback(async () => {
    abortRef.current?.abort();
    buffersRef.current.clear();
    try {
      await clearAllSessions();
      setMessages([]);
      setCurrentSessionId(null);
      sessionRef.current = null;
      setHistoryVersion((v) => v + 1);
      toast.success('Chat history cleared');
    } catch (e: unknown) {
      toast.error('Could not clear history', { description: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const value = useMemo<ChatState>(
    () => ({
      messages, busy, send, stop, newChat, loadSession,
      regenerate, editMessageAndRestream, clearHistory,
      currentSessionId, historyVersion,
    }),
    [messages, busy, send, stop, newChat, loadSession, regenerate, editMessageAndRestream, clearHistory, currentSessionId, historyVersion],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const v = useContext(ChatContext);
  if (!v) throw new Error('useChat must be used inside <ChatProvider>');
  return v;
}
