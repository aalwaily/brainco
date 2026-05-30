'use client';

import { FormEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp, Check, Download, FileText, Loader2, Paperclip, Plus, Sparkles, Square, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { useLang } from '@/app/providers';
import { useChat, type Msg } from '@/app/chat-store';
import { t } from '@/lib/i18n';
import { uploadFiles } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { MessageActions, UserMessageActions } from '@/components/chat/MessageActions';
import { ThinkingRenderer } from '@/components/chat/ThinkingRenderer';
import { VoiceButton } from '@/components/chat/VoiceButton';
import { detectDirection } from '@/lib/i18n/direction';

export function Chat() {
  const { lang } = useLang();
  const { messages, busy, send, stop } = useChat();
  const [input, setInput] = useState('');
  // Attachments staged in the composer; sent with the next message, then cleared.
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // "Stay glued to bottom" intent — flipped off when the user scrolls up,
  // flipped on again when they return near the bottom or send a new message.
  const stickyRef = useRef(true);
  // Avoid treating our own programmatic scroll as a user action.
  const programmaticScrollRef = useRef(false);

  const SUGGESTIONS = [
    t(lang, 'suggest_show_emp'),
    t(lang, 'suggest_find_iqama'),
    t(lang, 'suggest_policy'),
    t(lang, 'suggest_warning'),
  ];

  // Callback ref — attaches the scroll listener every time the container
  // appears (empty-state → active-state remounts the scroll div, so a
  // useEffect-based listener would miss the first mount).
  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    if (scrollElRef.current && scrollElRef.current !== el) {
      scrollElRef.current.onscroll = null;
    }
    scrollElRef.current = el;
    if (!el) return;
    el.onscroll = () => {
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickyRef.current = distance < 80;
    };
    // First mount of the active scroll area → start glued to the bottom.
    if (stickyRef.current) {
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Auto-follow the bottom on every message change while sticky.
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el || !stickyRef.current) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function submit(message: string) {
    const m = message.trim();
    // Files still uploading? wait. Need either text or a finished attachment.
    const ready = attachments.filter((a) => a.status === 'done');
    const uploading = attachments.some((a) => a.status === 'uploading');
    if (uploading) return;
    if (!m && ready.length === 0) return;
    if (busy) return;

    const names = ready.map((a) => a.name);
    setInput('');
    setAttachments([]);
    stickyRef.current = true;
    await send(m, names.length ? names : undefined);
    requestAnimationFrame(() => {
      const el = scrollElRef.current;
      if (el && stickyRef.current) {
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(input);
  }

  function onTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  }

  const composer = (
    <Composer
      input={input}
      setInput={setInput}
      busy={busy}
      stop={stop}
      onSubmit={onSubmit}
      onKey={onTextareaKey}
      lang={lang}
      textareaRef={textareaRef}
      attachments={attachments}
      setAttachments={setAttachments}
    />
  );

  // EMPTY STATE — Claude/ChatGPT-style: big centered greeting + composer + chips
  if (messages.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[12vh] sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-2xl text-center"
          >
            <Greeting />
            <p className="mt-3 text-sm text-muted-foreground sm:text-[15px]">
              {t(lang, 'chat_welcome_sub')}
            </p>
            <div className="mt-6 sm:mt-8">{composer}</div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 sm:mt-5 sm:gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void submit(s)}
                  disabled={busy}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-ring/50 hover:bg-accent hover:text-foreground disabled:opacity-40 sm:text-[12px]"
                >
                  <Sparkles className="h-3 w-3 text-primary/80" />
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ACTIVE STATE — messages + bottom-docked composer
  return (
    <div className="flex h-[100dvh] flex-1 flex-col">
      <div ref={setScrollRef} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-14 pb-6 sm:px-6 sm:pt-8 lg:px-8">
          <AnimatePresence initial={false}>
            {messages.map((m) => <Bubble key={m.id} msg={m} />)}
          </AnimatePresence>
        </div>
      </div>

      <div
        className="border-t border-border bg-background/80 glass"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto w-full max-w-5xl px-3 py-3 sm:px-6 lg:px-8">
          {composer}
          <p className="mt-2 hidden text-center text-[10px] text-muted-foreground sm:block">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Composer ---------------------------------------------------------------

type AttachedFile = {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  category?: string;
};

function Composer({
  input, setInput, busy, stop, onSubmit, onKey, lang, textareaRef,
  attachments, setAttachments,
}: {
  input: string;
  setInput: (s: string) => void;
  busy: boolean;
  stop: () => void;
  onSubmit: (e: FormEvent) => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  lang: 'en' | 'ar';
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  attachments: AttachedFile[];
  setAttachments: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
}) {
  const MIN_H = 28;
  const MAX_H = 220; // textarea grows then scrolls internally

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Auto-grow the textarea to fit content, capped at MAX_H.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, MIN_H), MAX_H);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_H ? 'auto' : 'hidden';
  }, [input, textareaRef]);

  // Upload picked / dropped files to the knowledge base, then re-index.
  const handleFiles = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const pending: AttachedFile[] = files.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      status: 'uploading',
    }));
    setAttachments((prev) => [...prev, ...pending]);
    try {
      const res = await uploadFiles(files);
      const byName = new Map(
        (res?.uploaded ?? []).map((u) => [u.name, u.category]),
      );
      setAttachments((prev) =>
        prev.map((a) =>
          pending.find((p) => p.id === a.id)
            ? { ...a, status: 'done', category: byName.get(a.name) }
            : a,
        ),
      );
      const n = files.length;
      toast.success(`Uploaded ${n} file${n === 1 ? '' : 's'}`, {
        description: 'Indexed — you can now ask about them.',
      });
    } catch (e: unknown) {
      setAttachments((prev) =>
        prev.map((a) =>
          pending.find((p) => p.id === a.id) ? { ...a, status: 'error' } : a,
        ),
      );
      toast.error('Upload failed', { description: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  }

  // Match the form's logical direction to the input content.
  const formDir = input ? detectDirection(input) : 'ltr';

  return (
    <form
      onSubmit={onSubmit}
      dir={formDir}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.xlsx,.xls,.csv,.txt"
        onChange={onPick}
        className="hidden"
      />

      <div
        className={cn(
          'flex flex-col gap-1 rounded-3xl border bg-card px-2 pb-2 pt-1 shadow-elev transition-[border-color,box-shadow] duration-150',
          'focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/30',
          dragging ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        )}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2 pt-2">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                file={a}
                onRemove={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          dir="auto"
          placeholder={t(lang, 'chat_placeholder')}
          disabled={busy}
          style={{ minHeight: MIN_H, maxHeight: MAX_H }}
          className={cn(
            'scrollbar-thin block w-full resize-none bg-transparent px-3 pt-3 pb-1 text-[15px] leading-6',
            'placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60',
          )}
        />

        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            title="Attach company files"
            className={cn(
              'grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors',
              'hover:bg-accent hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
          >
            <Plus className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1">
            <VoiceButton
              lang={lang}
              disabled={busy}
              getBaseText={() => input}
              onText={(text) => setInput(text)}
            />
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={stop}
                aria-label="Stop"
                className="h-9 w-9 rounded-full border border-border"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() && !attachments.some((a) => a.status === 'done')}
                aria-label={t(lang, 'chat_send')}
                style={{ backgroundColor: '#FFFFF0', color: '#111827' }}
                className="h-9 w-9 rounded-full border border-border shadow-soft hover:brightness-95"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function AttachmentChip({ file, onRemove }: { file: AttachedFile; onRemove: () => void }) {
  return (
    <div
      className={cn(
        'group/chip flex max-w-[220px] items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-xs',
        file.status === 'error' ? 'border-destructive/40' : 'border-border',
      )}
    >
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        {file.status === 'uploading'
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : file.status === 'done'
            ? <FileText className="h-3 w-3" />
            : <X className="h-3 w-3 text-destructive" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground" title={file.name}>{file.name}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {file.status === 'uploading' ? 'Uploading…'
            : file.status === 'error' ? 'Failed'
            : file.category ? `Indexed · ${file.category}` : 'Indexed'}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/chip:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// --- Time-of-day greeting --------------------------------------------------

function Greeting() {
  const { lang } = useLang();
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => { setHour(new Date().getHours()); }, []);
  const key =
    hour === null ? 'chat_welcome_title'
    : hour < 5  ? 'greet_night'
    : hour < 12 ? 'greet_morning'
    : hour < 17 ? 'greet_afternoon'
    : hour < 22 ? 'greet_evening'
    : 'greet_night';
  // Until we know the hour, show the neutral title to avoid a hydration flicker.
  const text = t(lang, key as 'chat_welcome_title');
  return (
    <h1 className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
      <Sparkles className="me-2 inline-block h-6 w-6 -translate-y-0.5 text-primary" />
      {text}
    </h1>
  );
}

/** Strip any stray `[Source N]`, `[N]`, `[doc:...]` style tags the model may
 *  still emit even though the prompt tells it not to. */
function stripCitations(text: string): string {
  return text
    .replace(/\s*\[\s*Source\s*\d+(?:\s*[,،]\s*\d+)*\s*\]/gi, '')
    .replace(/\s*\[\s*doc[:\-][^\]]+\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function UserText({ text }: { text: string }) {
  // Split on blank-line paragraphs to preserve user spacing; collapse runs
  // of empty lines so the pill doesn't get giant vertical gaps.
  // Render each line as its OWN <p dir="auto"> so each line resolves both
  // direction AND text-align independently. (A <span class="block"> inside
  // a <p> inherits text-align from the <p>, leaving Arabic visually left-
  // aligned even when dir resolved to rtl.)
  const lines = text.replace(/\n{3,}/g, '\n\n').split(/\r?\n/);
  return (
    <>
      {lines.map((line, i) => {
        const blank = !line.trim();
        return (
          <p
            key={i}
            dir="auto"
            className={cn(
              'text-start whitespace-pre-wrap',
              i > 0 && !blank && 'mt-1',
              blank && 'h-3',
            )}
          >
            {line || ' '}
          </p>
        );
      })}
    </>
  );
}

const Bubble = memo(function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user';
  const { lang } = useLang();

  // Pure "thinking" state — rotating multi-stage indicator, no bubble chrome.
  if (msg.streaming && !msg.content) {
    return (
      <div className="flex w-full">
        <ThinkingRenderer lang={lang} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn('group/msg flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('flex flex-col gap-1.5', isUser ? 'max-w-[70%] items-end' : 'w-full items-start')}>
        {isUser && msg.attachments && msg.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {msg.attachments.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-soft"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="max-w-[180px] truncate font-medium" title={name}>{name}</span>
              </div>
            ))}
          </div>
        )}
        <div
          dir="auto"
          className={cn(
            'text-[15px] leading-7',
            isUser
              ? 'rounded-3xl bg-muted px-4 py-2.5 text-foreground'
              : 'text-foreground',
            msg.error && 'rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-destructive whitespace-pre-wrap',
          )}
        >
          {isUser || msg.error ? (
            <UserText text={msg.content} />
          ) : (
            <MarkdownRenderer>{stripCitations(msg.content)}</MarkdownRenderer>
          )}
          {msg.streaming && msg.content && (
            <span
              aria-hidden
              className="ms-1.5 inline-block h-2.5 w-2.5 -translate-y-[1px] rounded-full bg-foreground align-middle animate-think"
            />
          )}
        </div>

        {msg.generated_file && (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/generated/${encodeURIComponent(msg.generated_file)}`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/20"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="font-medium">{t(lang, 'chat_download')}</span>
            <span className="opacity-70">·</span>
            <span className="truncate font-mono opacity-80">{msg.generated_file}</span>
          </a>
        )}

        {!isUser && !msg.streaming && msg.content && !msg.error && (
          <MessageActions msg={msg} />
        )}
        {isUser && !msg.error && (
          <UserMessageActions msg={msg} />
        )}
      </div>
    </motion.div>
  );
});

