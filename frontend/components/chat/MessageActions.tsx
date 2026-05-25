'use client';

import { useCallback, useState } from 'react';
import { Check, Copy, Pencil, RefreshCw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { exportConversationMarkdown } from '@/lib/chat/exports';
import { useChat, type Msg } from '@/app/chat-store';

/** Hover-revealed action row under each assistant message:
 *    Copy · Regenerate · Share (export markdown) */
export function MessageActions({ msg }: { msg: Msg }) {
  const { messages, regenerate, busy } = useChat();
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Copy failed');
    }
  }, [msg.content]);

  const onShare = useCallback(() => {
    // Export the whole current conversation as a portable Markdown file.
    exportConversationMarkdown(messages, 'AI Company Brain conversation');
    toast.success('Conversation exported as Markdown');
  }, [messages]);

  const isLastAssistant =
    msg.role === 'assistant' &&
    messages.findLast?.((m) => m.role === 'assistant')?.id === msg.id;

  return (
    <div className="-ms-1 mt-1 flex items-center gap-0.5 text-muted-foreground opacity-60 transition-opacity group-hover/msg:opacity-100">
      <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={onCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionBtn>

      {isLastAssistant && (
        <ActionBtn
          label="Regenerate"
          onClick={() => regenerate()}
          disabled={busy}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </ActionBtn>
      )}

      <ActionBtn label="Export Markdown" onClick={onShare}>
        <Share2 className="h-3.5 w-3.5" />
      </ActionBtn>
    </div>
  );
}

/** Edit pencil that sits under a user message — clicking it puts the
 *  message text back in the composer and truncates the conversation at
 *  that point so the user can re-send a tweaked version. */
export function UserMessageActions({ msg }: { msg: Msg }) {
  const { messages, editMessageAndRestream, busy } = useChat();
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {/* ignore */}
  }, [msg.content]);

  const onEdit = useCallback(() => {
    const next = window.prompt('Edit your message', msg.content);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    void editMessageAndRestream(msg.id, trimmed);
  }, [editMessageAndRestream, msg.id, msg.content]);

  // hide actions on the very first turn while busy, to avoid double-fires
  if (!messages.length) return null;

  return (
    <div className="mt-1 flex items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/msg:opacity-100">
      <ActionBtn label="Edit" onClick={onEdit} disabled={busy}>
        <Pencil className="h-3.5 w-3.5" />
      </ActionBtn>
      <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={onCopy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  label, onClick, disabled, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-md transition-colors',
        'hover:bg-accent hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}
