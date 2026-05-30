# CLAUDE.md — Project Operating Manual

> Read this **first** at the start of every session. It captures the
> architecture, conventions, environment quirks, and pitfalls of this
> codebase so you can make changes safely without re-discovering everything.

---

## 1. What this project is

**AI Company Brain** (repo: `aalwaily/brainco`) — an internal AI assistant
for a Saudi company. Local-first, Arabic + English first-class.

**Live deployment:**
- Frontend: Vercel (`brainco-*.vercel.app`)
- Backend: Railway (`brainco-backend-production.up.railway.app`)
- Render blueprint also exists (`render.yaml`) as an alternative backend host

**Core capabilities (do not break any of these):**
1. **RAG chat** over uploaded company files (PDF / DOCX / XLSX / CSV / TXT)
2. **Employee lookup** by name / iqama / badge against `Book1.xlsx` (874 real
   Saudi employees — PII, never commit)
3. **File upload + auto-categorization** (HR / Accounts / Operations & Project)
4. **Warning-letter template generator** (older feature, uses `templates/`)
5. **Universal document generator** — PDF / DOCX / XLSX / MD / TXT from chat
6. **Chat history** (SQLite, sessions + messages with cascade delete)
7. **Streaming chat** with typewriter effect (~110 cps)
8. **Pluggable LLM providers** (DeepSeek + Gemini, auto-fallback on rate limit)
9. **Voice dictation** (Web Speech API, browser-side)
10. **File attach to message** (ChatGPT-style: pick → indexed → send → ask)

---

## 2. Repo layout

```
project/
├── backend/                          FastAPI + Chroma + LLM providers
│   ├── app/
│   │   ├── main.py                   FastAPI routes
│   │   ├── chat_service.py           answer() + stream_answer() + doc routing
│   │   ├── ingest_service.py         file → chunks → vector store
│   │   ├── chunker.py                semantic chunking (paragraph→sent→word)
│   │   ├── vectorstore.py            ChromaDB wrapper + keyword_search()
│   │   ├── employee_lookup.py        deterministic name/iqama/badge lookup
│   │   ├── categories.py             HR/Accounts/Ops classifier + AI fallback
│   │   ├── doc_builder.py            universal PDF/DOCX/XLSX/MD/TXT builder
│   │   ├── doc_intent.py             detect "build a doc" intent + language
│   │   ├── warnings.py               LEGACY template-based warning generator
│   │   ├── history.py                SQLite chat sessions + messages
│   │   ├── providers/
│   │   │   ├── base.py               LLMProvider abstract + LLMError
│   │   │   ├── deepseek.py           DeepSeek (OpenAI-compatible)
│   │   │   ├── gemini.py             Google Gemini via google-genai SDK
│   │   │   └── __init__.py           registry: get_provider / list_providers
│   │   ├── fonts/                    Noto Naskh AR + Noto Sans (static TTFs)
│   │   ├── config.py                 pydantic-settings env loader
│   │   └── logger.py
│   ├── requirements.txt              PINNED versions — do not loosen casually
│   ├── Dockerfile                    builds for Railway/Render ($PORT aware)
│   ├── run.py                        local dev entry: `python run.py`
│   └── .env                          API keys (gitignored)
│
├── frontend/                         Next.js 15 App Router + React 19
│   ├── app/
│   │   ├── chat-store.tsx            React context: messages, send, stream
│   │   ├── providers.tsx             ThemeProvider + LanguageProvider
│   │   ├── globals.css               token system (HSL) + motion vars
│   │   └── page.tsx
│   ├── components/
│   │   ├── Chat.tsx                  main chat UI + Composer + Bubble
│   │   ├── AppSidebar.tsx            Claude-style sidebar
│   │   ├── SettingsDialog.tsx        settings panel
│   │   ├── chat/
│   │   │   ├── MarkdownRenderer.tsx  remark-gfm + math + dir="auto"
│   │   │   ├── CodeBlock.tsx         syntax highlight + copy + wrap
│   │   │   ├── MessageActions.tsx    copy/regenerate/edit/export
│   │   │   ├── ThinkingRenderer.tsx  multi-state thinking indicator
│   │   │   └── VoiceButton.tsx       Web Speech API dictation
│   │   └── ui/                       shadcn-style primitives
│   ├── lib/
│   │   ├── api.ts                    streamChat, uploadFiles, sessions, etc.
│   │   ├── i18n/direction.ts         detectDirection, detectLanguage
│   │   ├── chat/exports.ts           markdown export
│   │   └── chat/provider-pref.ts     localStorage provider preference
│   ├── package.json                  React 19 + Next 15 + Tailwind + Radix
│   └── .env.local                    NEXT_PUBLIC_API_URL (gitignored)
│
├── company_data/                     uploaded company files (gitignored!)
│   ├── HR/                           Book1.xlsx (PII), templates, etc.
│   ├── Accounts/
│   └── Operations and Project/
├── generated/                        generated docs (gitignored!)
│   ├── warnings/                     LEGACY warning letters
│   └── Documents/                    new universal generator output
├── chroma_db/                        local vector store (gitignored)
├── .claude/launch.json               dev server config (frontend only)
├── DEPLOY.md                         Vercel + Railway deploy guide
├── render.yaml                       Render blueprint
└── README.md
```

---

## 3. Running locally (the macOS sandbox quirk)

**Frontend** — use `preview_start` MCP tool (it's pre-configured in
`.claude/launch.json`):
- Server name: `frontend`
- Port: 3000
- Command: `npm run dev` in `project/frontend/`

**Backend** — **do NOT use preview_start.** macOS TCC sandbox blocks the
launcher from reading `~/Desktop/`. Use Bash + nohup instead:
```bash
cd "/Users/alialgarea/Desktop/Company Ai deep/project/backend"
pkill -f "python run.py" 2>/dev/null; sleep 1
source .venv/bin/activate && rm -f server.log && nohup python run.py > server.log 2>&1 &
disown
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do sleep 1; done
```
Backend runs on **port 8000**. Frontend reads it via
`NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

**Why we removed `backend` from `launch.json`:** preview_start would fail
with TCC permission errors. The Bash approach is the only reliable path.

---

## 4. Environment & secrets

`backend/.env` (gitignored) must contain:
```
DEEPSEEK_API_KEY=sk-...
GEMINI_API_KEY=AI...
LLM_PROVIDER=deepseek                # or "gemini"
GEMINI_MODEL=gemini-2.0-flash        # 1500/day; 2.5-flash is only 20/day
```
`backend/.env.example` has placeholders only — **never commit real keys**.

**Vercel env vars** (frontend only):
- `NEXT_PUBLIC_API_URL` → Railway backend URL
- **Do NOT** set `DEEPSEEK_API_KEY` / `GEMINI_API_KEY` on Vercel —
  those live on the backend host (Railway / Render).

**Railway env vars** (backend):
- `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `LLM_PROVIDER`, `GEMINI_MODEL`,
  `CORS_ORIGINS` (set to the Vercel URL).

---

## 5. Data & PII (CRITICAL)

The `.gitignore` MUST exclude all of these — verify after any rebase:
```
company_data/**       (real employees, contracts — PII!)
generated/warnings/** (real names in letters)
generated/Documents/** (LLM-generated docs)
chroma_db/            (embeddings — derived from PII)
backend/.env
backend/chat_history.db
.venv, node_modules, .next, logs, .DS_Store
```

**Never commit `Book1.xlsx`, any file under `company_data/`, or any
generated document.** If a session adds a file there, leave it untracked.

**Fonts ARE committed** — `backend/app/fonts/*.ttf` (Noto Naskh Arabic +
Noto Sans). They're required for PDF generation and ship with the image.

---

## 6. Backend architecture

### 6.1 Chat flow

```
POST /chat/stream { message, session_id?, provider? }
  └─ main.py wraps with NDJSON streaming
     └─ chat_service.stream_answer(message, provider, session_id)
        ├─ 1. doc_intent.detect_document_intent(message)
        │    └─ if matched → _handle_document() → build + stream download card
        ├─ 2. warnings.detect_warning_intent(message)   (LEGACY)
        │    └─ if matched → template-based warning
        └─ 3. RAG path:
             ├─ employee_lookup.resolve(message)        (exact)
             ├─ vectorstore.query(message)              (semantic top-K)
             ├─ vectorstore.keyword_search(message)     (BM25-like)
             └─ provider.stream(messages) → token events
```

Events emitted (NDJSON, one JSON per line):
- `{type:"session", id}` — first message creates a session
- `{type:"provider", id, label, fallback_from?, reason?}`
- `{type:"sources", sources:[…]}`
- `{type:"token", content}` — streamed in real time
- `{type:"done", answer, generated_file}`
- `{type:"error", message}`

### 6.2 Document generator (`doc_builder.py` + `doc_intent.py`)

**Intent detection** (`doc_intent.py`):
- `detect_document_intent(message)` returns `{fmt, is_edit, language}` or `None`
- Needs (create-verb OR edit-verb) + (format keyword OR doc-noun)
- `detect_language()` — explicit override ("in arabic" / "بالإنجليزي") wins,
  otherwise script-based: more Arabic chars → `ar`, else `en`

**LLM spec generation** (`chat_service._generate_doc_spec`):
- Calls the LLM with `DOC_SPEC_SYSTEM` + a `Target language: …` line
- LLM returns a JSON spec: `{type, filename, title, body, table?}`
- `_extract_json()` handles code-fenced replies + trailing-comma JSON
- Result cached per session in `_LAST_DOC_SPEC` so "edit it" rebuilds
  from the previous spec, not from scratch

**Rendering** (`doc_builder.py`):
- `build_document(spec, group)` → file in `generated/<group>/`
- Routes by `type`: pdf→`_build_pdf`, docx→`_build_docx`, xlsx→`_build_xlsx`,
  md/txt→`_build_md`
- PDF: uses **static** (non-variable) Noto Naskh AR + Noto Sans
  - variable fonts (with `fvar` table) crash fpdf2's subsetter — only use
    static TTFs from `notofonts.github.io` or static instances
  - Arabic text goes through `arabic_reshaper.reshape()` → `bidi.get_display()`
  - Use leading-space indent for Arabic bullets (Naskh lacks `•` and `-` glyphs)
- DOCX: `python-docx`; adds `w:bidi` to paragraph with Arabic for RTL
- XLSX: `openpyxl`; auto-width columns when table present
- Returns metadata `{filename, group, type, size, path}`

### 6.3 LLM providers (`providers/`)

- `LLMProvider` abstract: `.id`, `.label`, `.chat(messages)`, `.stream(messages)`
- `LLMError(message, is_rate_limited=False)` — raised on failures
- `_chat_with_fallback()` in chat_service: if primary returns rate-limit
  error, transparently retries on the other provider mid-stream
- `get_provider(name=None)` falls back to `settings.LLM_PROVIDER`

### 6.4 Vector store

- ChromaDB persistent at `CHROMA_DIR` (default `./chroma_db`)
- Collection: `company_brain`, cosine distance
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`
- Per-file overview chunk added during ingestion so "summarize file X" works
- Re-uploading a file calls `delete_by_source(name)` first → no dupes

---

## 7. Frontend architecture

### 7.1 State (`app/chat-store.tsx`)

React Context exposing:
```ts
{
  messages: Msg[],
  busy: boolean,
  send(message: string, attachments?: string[]): Promise<void>,
  stop(): void,
  newChat(): void,
  loadSession(id: number): Promise<void>,
  regenerate(): Promise<void>,
  editMessageAndRestream(clientMsgId, newContent): Promise<void>,
  clearHistory(): Promise<void>,
  currentSessionId: number | null,
}
```

`Msg` shape:
```ts
{
  id: string;             // client-side uid
  serverId?: number;      // SQLite row id once persisted
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  generated_file?: string | null;   // server-built doc → download card
  attachments?: string[];           // names of files attached to this turn
  error?: boolean;
  streaming?: boolean;
}
```

### 7.2 Typewriter buffer (do not break)

Tokens stream in bursts but render at a **steady ~110 cps** via a single
rAF/interval drain loop. Constants in `chat-store.tsx`:
- `TYPEWRITER_TICK_MS = 18`
- `BASE_CHARS_PER_TICK = 2` (≈110 cps)
- `MAX_CHARS_PER_TICK = 6` (catch-up)
- `BACKLOG_ACCEL_AT = 50`

The bubble has **NO framer-motion `layout`** prop — that caused page shake.

### 7.3 Composer (`components/Chat.tsx`)

Single-form layout (no separate `relative` wrapper) — text on top,
toolbar row below:
- **left:** `+` attach button → `<input type="file" hidden>`
- **right:** voice mic button + send button
- Drag-and-drop on the form for files
- Send button color: `#FFFFF0` (ivory) with dark arrow (`#111827`)
- Send is enabled when `input.trim() || attachments.some(a=>a.status==='done')`
- After send: input cleared + attachments cleared
- User-bubble shows attachment chips ABOVE the bubble (via `msg.attachments`)

### 7.4 RTL / bidi

`detectDirection(text)` returns `'ltr' | 'rtl'`. Used in:
- Form `dir={formDir}` so `pe-14` and `end-2.5` resolve to the user's text end
- Every markdown block has `dir="auto"` — never set a single `dir` on
  the whole message; mixed Arabic+English content needs per-block detection
- User text: each line rendered as own `<p dir="auto" class="text-start">`,
  not as `<span class="block">` inside a parent `<p>` (the parent's
  text-align would override)

### 7.5 Language preference

`useLang()` from `app/providers.tsx` returns `{lang, setLang}` with values
`'en' | 'ar'`. Drives the i18n table (`lib/i18n/`) and the voice
recognition locale (`ar-SA` vs `en-US`).

---

## 8. Conventions / patterns

### Backend
- Async everywhere (`async def`, FastAPI native)
- Pydantic models in `main.py` for request/response shapes
- Loguru for logging (`from .logger import logger`)
- All file paths via `settings.generated_path`, `settings.chroma_dir`, etc.
- **Never** print to stdout in handlers — use logger
- Errors → HTTPException with detail string; LLMError → 502

### Frontend
- Strict TS, no `any` without justification
- Tailwind tokens (HSL) from `globals.css` — never hardcode colors except
  for the send button's `#FFFFF0` accent
- shadcn-style: `cn()` helper for class merging, Radix primitives wrapped
  under `components/ui/`
- Server state via API client (`lib/api.ts`), UI state in React
- Toasts via `sonner`
- Icons from `lucide-react` only

### Git
- Commit subject ≤ 70 chars, body wrapped at ~80
- Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Never `--no-verify`, never `--amend` (always new commit)
- Push only to `main` unless asked

---

## 9. Pitfalls to avoid (learned the hard way)

| Pitfall | Why it happens | Fix |
|---|---|---|
| **PDF "fvar" KeyError** | Variable fonts crash fpdf2's subsetter | Only static TTFs in `backend/app/fonts/` |
| **PDF glyph missing for `•` / `-`** | Naskh has neither | Indent Arabic bullets, only use `•` for Latin |
| **Backend can't start via preview_start** | macOS TCC blocks Desktop reads | Use Bash + nohup (see §3) |
| **Send button overlaps Arabic first word** | Form `dir` defaulted to LTR | Set form `dir={detectDirection(input)}` |
| **Page shake during streaming** | framer-motion `layout` on Bubble | Remove `layout`, use instant scroll |
| **Settings dialog appears transparent** | Card uses `bg-card/40` | Force `bg-popover` via inline style |
| **`[Source N]` chips in chat** | System prompt didn't forbid them | Prompt rule + `stripCitations()` regex |
| **`React.Children.only` in Button asChild** | Loader injected 2nd child into Slot | Conditionally render loader only when not asChild |
| **First message has no session_id** | Server creates it from message title | Always pass `session_id` from `session` event |
| **Duplicate `AttachedFile` type** | Edit fragment didn't fully replace | Search for duplicates after big edits |

---

## 10. Recent feature: language-aware document generation

A user can be in any combination of input language + desired output language.
The system handles all four cases:

| Input | Override phrase? | Output language |
|---|---|---|
| English | none | English |
| English | "in arabic" / "اجعله عربي" | **Arabic** |
| Arabic | none | Arabic |
| Arabic | "in english" / "بالإنجليزي" | **English** |

Implementation:
- `doc_intent.detect_language(msg)` — explicit override wins, else script
- `chat_service._generate_doc_spec(..., language)` — adds
  `Target language: …` line to the user prompt
- `DOC_SPEC_SYSTEM` rule: "LANGUAGE: write the document in EXACTLY the
  language specified in the 'Target language' line"
- `_handle_document()` confirmation message also matches target language

Unit-tested by 8 cases in `doc_intent.detect_language` + end-to-end
verified that the generated PDF body actually contains the right script.

---

## 11. When in doubt

- **Test before committing** — every backend change should round-trip
  through `curl POST /chat/stream` at least once
- **Verify in the preview window** — take a screenshot after any UI tweak
  to confirm the edit actually rendered (file Edits sometimes silently
  fail to match due to whitespace; check the screenshot, not just the
  Edit return value)
- **Check the streaming events** — never assume; tail server.log and
  parse the NDJSON
- **Never delete** anything under `company_data/`, `generated/`, or
  `chroma_db/` without explicit user permission
- **Never expose** API keys, employee data, or generated documents to
  any commit, log, or response
- **Frontend HMR** — Next.js dev server reloads automatically after edits;
  wait 3-4s, then re-eval / re-screenshot. If a change "didn't apply",
  it's usually because the Edit fragment didn't match — verify with
  `grep`, don't blindly retry.

---

*Last updated: 2026-05-30 — covers chat, RAG, files, voice, attach, and
the universal document generator with bilingual output.*
