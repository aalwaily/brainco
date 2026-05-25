/** Export helpers — pure functions that turn a conversation into a portable
 *  artifact (markdown blob today, more formats can plug in here). */
import type { Msg } from '@/app/chat-store';

export function conversationToMarkdown(messages: Msg[], title = 'Conversation'): string {
  const head = `# ${title}\n\n_Exported ${new Date().toISOString()}_\n\n---\n`;
  const body = messages
    .filter((m) => !m.streaming && m.content)
    .map((m) => {
      const who = m.role === 'user' ? '🧑 **You**' : '🤖 **Assistant**';
      const file = m.generated_file ? `\n\n_Attachment: ${m.generated_file}_` : '';
      return `### ${who}\n\n${m.content}${file}`;
    })
    .join('\n\n---\n\n');
  return head + '\n' + body + '\n';
}

export function downloadText(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

export function exportConversationMarkdown(messages: Msg[], title?: string): void {
  const md   = conversationToMarkdown(messages, title);
  const safe = (title || 'conversation')
    .replace(/[^\w؀-ۿ\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'conversation';
  downloadText(`${safe}.md`, 'text/markdown', md);
}

export function copySingleMessage(content: string): Promise<void> {
  return navigator.clipboard.writeText(content);
}
