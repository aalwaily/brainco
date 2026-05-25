export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type Source = {
  source?: string;
  page?: number;
  sheet?: string;
  row?: number;
  type?: string;
  distance?: number;
};

export type ChatResponse = {
  answer: string;
  sources: Source[];
  generated_file: string | null;
};

export type Category = 'HR' | 'Accounts' | 'Operations and Project';
export const CATEGORIES: Category[] = ['HR', 'Accounts', 'Operations and Project'];

export type CompanyFile = {
  name: string;
  relative_path: string;
  size: number;
  modified_at: number;
  type: string;
  category: Category | null;
};

export type CompanyCategoryGroup = {
  name: Category;
  count: number;
  items: CompanyFile[];
};

export type GeneratedDoc = {
  filename: string;
  group: string;
  size: number;
  created_at: number;
};

export type GeneratedGroup = {
  name: string;
  count: number;
  reserved: boolean;
  items: GeneratedDoc[];
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.detail || JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function postChat(message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handle<ChatResponse>(res);
}

export type StreamEvent =
  | { type: 'session';  id: number }
  | { type: 'provider'; id: string; label: string }
  | { type: 'sources';  sources: Source[] }
  | { type: 'token';    content: string }
  | { type: 'done';     answer: string; generated_file: string | null }
  | { type: 'error';    message: string };

/** Stream the chat response. Calls `onEvent` for each event as it arrives.
 *  Resolves when the stream ends; rejects on network/protocol error.
 *  Pass `sessionId` to continue an existing conversation; omit to start a new one.
 *  Pass `provider` to override the backend default (e.g. "gemini"). */
export async function streamChat(
  message: string,
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
  sessionId?: number | null,
  provider?: string | null,
): Promise<void> {
  const res = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId ?? null,
      ...(provider ? { provider } : {}),
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.json())?.detail || ''; }
    catch { detail = await res.text(); }
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {/* ignore malformed line */}
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try { onEvent(JSON.parse(tail) as StreamEvent); } catch {/* ignore */}
  }
}

export async function listFiles(): Promise<{
  categories: CompanyCategoryGroup[];
  uncategorized: CompanyFile[];
  company_data_dir: string;
}> {
  const res = await fetch(`${API_URL}/files`, { cache: 'no-store' });
  return handle(res);
}

export async function deleteFile(name: string, category?: Category): Promise<{ deleted: string }> {
  const url = category
    ? `${API_URL}/files/${encodeURIComponent(category)}/${encodeURIComponent(name)}`
    : `${API_URL}/files/${encodeURIComponent(name)}`;
  const res = await fetch(url, { method: 'DELETE' });
  return handle(res);
}

export type UploadedFile = {
  name: string;
  category: Category;
  classified_by: 'explicit' | 'keyword' | 'ai';
  chunks_added: number;
  size: number;
};

export type UploadResponse = {
  uploaded: UploadedFile[];
  store: { count: number; collection: string };
};

/** Upload files. Pass `category` to force a target folder; omit to auto-classify. */
export async function uploadFiles(
  files: File[],
  category?: Category,
): Promise<UploadResponse> {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const url = category
    ? `${API_URL}/upload?category=${encodeURIComponent(category)}`
    : `${API_URL}/upload`;
  const res = await fetch(url, { method: 'POST', body: fd });
  return handle<UploadResponse>(res);
}

export async function listGenerated(): Promise<{ groups: GeneratedGroup[] }> {
  const res = await fetch(`${API_URL}/generated`, { cache: 'no-store' });
  return handle(res);
}

/** Group-aware download URL. Falls back to the back-compat path when group is omitted. */
export function generatedDownloadUrl(filename: string, group?: string): string {
  if (group) {
    return `${API_URL}/generated/group/${encodeURIComponent(group)}/${encodeURIComponent(filename)}`;
  }
  return `${API_URL}/generated/${encodeURIComponent(filename)}`;
}

export async function createGeneratedGroup(name: string): Promise<{ created: string }> {
  const res = await fetch(`${API_URL}/generated/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return handle(res);
}

export async function deleteGeneratedGroup(name: string): Promise<{ deleted: string }> {
  const res = await fetch(`${API_URL}/generated/groups/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  return handle(res);
}

export async function moveGeneratedDoc(
  filename: string,
  from: string,
  to: string,
): Promise<{ moved: string; to: string }> {
  const res = await fetch(`${API_URL}/generated/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, from, to }),
  });
  return handle(res);
}

export async function deleteGeneratedDoc(
  group: string,
  filename: string,
): Promise<{ deleted: string }> {
  const res = await fetch(
    `${API_URL}/generated/${encodeURIComponent(group)}/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
  return handle(res);
}

export async function reingest(): Promise<unknown> {
  const res = await fetch(`${API_URL}/ingest`, { method: 'POST' });
  return handle(res);
}

export type HistoryItem = {
  id: number;
  question: string;
  answer: string;
  sources: string;
  created_at: string;
};

export async function listHistory(limit = 50): Promise<{ items: HistoryItem[] }> {
  const res = await fetch(`${API_URL}/history?limit=${limit}`, { cache: 'no-store' });
  return handle(res);
}

export async function clearHistory(): Promise<{ deleted: number }> {
  const res = await fetch(`${API_URL}/history`, { method: 'DELETE' });
  return handle(res);
}

export async function deleteHistoryItem(id: number): Promise<{ deleted: number }> {
  const res = await fetch(`${API_URL}/history/${id}`, { method: 'DELETE' });
  return handle(res);
}

// --- Sessions (one entry per conversation) ---------------------------------

export type ChatSession = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  first_message: string | null;
};

export type ChatMessageRow = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources: string | null;
  generated_file: string | null;
  created_at: string;
};

export async function listSessions(limit = 80): Promise<{ items: ChatSession[] }> {
  const res = await fetch(`${API_URL}/sessions?limit=${limit}`, { cache: 'no-store' });
  return handle(res);
}

export async function getSession(id: number): Promise<ChatSession & { messages: ChatMessageRow[] }> {
  const res = await fetch(`${API_URL}/sessions/${id}`, { cache: 'no-store' });
  return handle(res);
}

export async function renameSession(id: number, title: string): Promise<unknown> {
  const res = await fetch(`${API_URL}/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return handle(res);
}

export async function deleteSession(id: number): Promise<unknown> {
  const res = await fetch(`${API_URL}/sessions/${id}`, { method: 'DELETE' });
  return handle(res);
}

export async function clearAllSessions(): Promise<unknown> {
  const res = await fetch(`${API_URL}/sessions`, { method: 'DELETE' });
  return handle(res);
}

export async function truncateSession(
  sessionId: number,
  afterMessageId: number,
): Promise<{ removed: number }> {
  const res = await fetch(`${API_URL}/sessions/${sessionId}/truncate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ after_message_id: afterMessageId }),
  });
  return handle(res);
}

export async function deleteSessionMessage(
  sessionId: number,
  messageId: number,
): Promise<{ deleted: number }> {
  const res = await fetch(
    `${API_URL}/sessions/${sessionId}/messages/${messageId}`,
    { method: 'DELETE' },
  );
  return handle(res);
}

// --- LLM providers ---------------------------------------------------------

export type ProviderInfo = {
  id: string;
  label: string;
  model: string;
  available: boolean;
};

export async function listProviders(): Promise<{ default: string; providers: ProviderInfo[] }> {
  const res = await fetch(`${API_URL}/providers`, { cache: 'no-store' });
  return handle(res);
}
