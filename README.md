# AI Company Brain

A **local-first** company assistant that reads your internal files (PDF, DOCX, XLSX, CSV, TXT) and answers questions using **DeepSeek** + **RAG**. Built with:

- **Next.js 15** (App Router) + TypeScript + Tailwind — dark mode, RTL for Arabic
- **FastAPI** (Python) backend
- **ChromaDB** local vector store + **sentence-transformers** (`all-MiniLM-L6-v2`) embeddings
- **SQLite** for chat history
- **Docker Compose** for one-command boot

Built for future Telegram integration: the chat layer is a single `POST /chat` call.

---

## Folder layout

```
project/
├── backend/                 FastAPI app, ingestion, RAG
│   ├── app/                 Python package (config, loaders, chunker, embeddings,
│   │                        vectorstore, deepseek client, chat service,
│   │                        warning generator, history, main)
│   ├── ingest.py            CLI: scan company_data/ and (re)build the vector index
│   ├── run.py               Convenience launcher: `python run.py`
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                Next.js (App Router) UI
│   ├── app/                 /, /files, /generated
│   ├── components/          Chat, Dropzone, sidebars, Shell
│   ├── lib/                 API client + utilities
│   └── Dockerfile
├── company_data/            ← drop files here (PDF/DOCX/XLSX/CSV/TXT)
│   ├── employees.xlsx       (sample)
│   ├── warning_template.docx(sample)
│   └── contracts.txt        (sample)
├── generated/
│   └── warnings/            ← warning letters land here
├── scripts/
│   └── create_samples.py    creates the three sample files above
└── docker-compose.yml
```

---

## 1. Installation

Requires: **Python 3.10+**, **Node 20+**, and a **DeepSeek API key**.

```bash
# 1) clone and enter
cd project

# 2) backend
cd backend
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then edit .env to add your key

# 3) frontend
cd ../frontend
npm install
cp .env.local.example .env.local
```

---

## 2. DeepSeek setup

1. Get an API key at <https://platform.deepseek.com/>.
2. Open `backend/.env` and set:

```env
DEEPSEEK_API_KEY=sk-your-real-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

The model is called via the OpenAI-compatible `POST /chat/completions` endpoint.

---

## 3. Create sample data (optional but recommended)

```bash
cd project
python scripts/create_samples.py
```

This drops `employees.xlsx`, `warning_template.docx`, and `contracts.txt` into `company_data/`.

---

## 4. Ingest your files

```bash
cd backend
source .venv/bin/activate
python ingest.py            # reset + rebuild
# python ingest.py --append # add to existing index
```

The first run downloads the embedding model (~80 MB). Subsequent runs are fast.

---

## 5. Run

**Backend**

```bash
cd backend
python run.py
# → http://localhost:8000   (FastAPI)
# → http://localhost:8000/docs  (Swagger)
```

**Frontend** (in another terminal)

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

Open <http://localhost:3000>.

### Or: Docker

```bash
cd project
cp backend/.env.example backend/.env   # edit DEEPSEEK_API_KEY
docker compose up --build
```

Open <http://localhost:3000>.

---

## 6. Pages

| Route          | What it does                                                   |
|----------------|----------------------------------------------------------------|
| `/`            | Chat. Left = file list, right = generated docs.                |
| `/files`       | Drag-drop uploader. Lists/deletes files, re-indexes on upload. |
| `/generated`   | Lists every generated `.docx` (warning letters etc.).          |

---

## 7. Example prompts

```
Show employee 1002
Find employee by iqama 1234
Show salary for Ahmed Al-Saud
What is the lateness policy?
Summarize contracts.txt
Create delay warning for employee 1234
Create absence warning for employee 1001 because two unexcused absences
أنشئ إنذار تأخير للموظف رقم 1234
```

When the assistant detects a warning intent (`create warning…`, `إنذار…`), it loads `warning_template.docx`, replaces `{{NAME}}`, `{{IQAMA}}`, `{{DATE}}`, `{{REASON}}`, and saves the result to `generated/warnings/`.

---

## 8. API surface (for future Telegram bot etc.)

| Method | Path                       | Body / Query                                   |
|--------|----------------------------|------------------------------------------------|
| POST   | `/chat`                    | `{ "message": "..." }` → `{answer, sources, generated_file}` |
| POST   | `/upload`                  | `multipart` `files=[...]` — saves to `company_data/` + re-ingests each |
| GET    | `/files`                   | list of company files                          |
| DELETE | `/files/{name}`            | delete one + re-index                          |
| POST   | `/ingest`                  | rebuild the whole index                        |
| POST   | `/warnings/generate`       | `{ "employee": "...", "reason": "...", "date": "YYYY-MM-DD" }` |
| GET    | `/generated`               | list generated docs                            |
| GET    | `/generated/{name}`        | download a generated doc                       |
| GET    | `/history?limit=50`        | recent Q/A pairs (from SQLite)                 |
| DELETE | `/history`                 | clear history                                  |
| GET    | `/health`                  | liveness + vector store stats                  |

A Telegram bot can simply forward the user message to `POST /chat` and post `answer` back. If `generated_file` is returned, fetch it from `GET /generated/{name}` and send as a document.

---

## 9. How it works

```
company_data/
   ↓ loaders.py            PDF / DOCX / XLSX / CSV / TXT → records (text + metadata)
   ↓ chunker.py            char-based, 1000 / 200 overlap
   ↓ embeddings.py         sentence-transformers all-MiniLM-L6-v2 (normalized)
   ↓ vectorstore.py        ChromaDB persistent client (cosine)
                            ↑
   user question  → query top-K chunks → build context → DeepSeek → answer + cited sources
```

- XLSX/CSV are stored **one row per record**, so "show employee 1002" retrieves the exact row.
- All retrieval cites `source` + `page`/`sheet`/`row`.
- Arabic input is auto-detected and the assistant replies in Arabic. The UI auto-flips that bubble to RTL.

---

## 10. Troubleshooting

- **"DEEPSEEK_API_KEY is not set"** — fill in `backend/.env`, restart the backend.
- **First call is slow** — embedding model is downloading.
- **No answer / "no context retrieved"** — run `python ingest.py` and confirm files are in `company_data/`.
- **Docker volume issues** — `docker compose down -v` to nuke the persisted store, then `docker compose up --build` to start fresh.

---

## 11. Roadmap

- [ ] Telegram bot adapter (just calls `/chat`)
- [ ] Per-user / per-role access control
- [ ] Streaming responses (`/chat/stream`)
- [ ] More document types (PPTX, images via OCR)
