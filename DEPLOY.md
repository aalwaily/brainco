# Deploying

The app is split in two:

- **Frontend** — Next.js 15 (Vercel-friendly, deploys in seconds)
- **Backend** — FastAPI + ChromaDB + sentence-transformers + SQLite (needs a real server with persistent disk; Vercel can't host it)

## 1. Frontend → Vercel

1. Push this repo to GitHub (already done if you're reading this).
2. Go to <https://vercel.com/new> and **Import Git Repository**.
3. In **Configure Project**:
   - **Root Directory**: `frontend`
   - Framework: Next.js (auto-detected)
   - Build Command: leave default (`next build`)
   - Output Directory: leave default (`.next`)
4. **Environment Variables** — add:

   | Name | Value | Scope |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | `https://your-backend.example.com` | Production, Preview, Development |

5. Deploy. The frontend will build but every chat / file / generated call will fail until the backend URL is real.

## 2. Backend → pick one host

The backend can't run on Vercel because it needs:
- Long-running process (ChromaDB persistent client)
- Persistent disk (vector DB, SQLite, uploaded files)
- ~300 MB+ memory (sentence-transformers model)

Options ranked by ease:

### A. Railway (recommended)

1. <https://railway.app/new> → **Deploy from GitHub repo** → pick this repo.
2. Service settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. **Variables** tab — set:
   ```
   DEEPSEEK_API_KEY=sk-...
   GEMINI_API_KEY=AIza...
   LLM_PROVIDER=deepseek
   GEMINI_MODEL=gemini-2.0-flash
   COMPANY_DATA_DIR=/data/company_data
   GENERATED_DIR=/data/generated
   CHROMA_DIR=/data/chroma_db
   SQLITE_PATH=/data/chat_history.db
   CORS_ORIGINS=https://your-vercel-app.vercel.app
   ```
4. **Volumes** tab — attach a 5 GB volume mounted at `/data`.
5. After deploy, copy the Railway public URL and paste it into Vercel's `NEXT_PUBLIC_API_URL`.

### B. Render / Fly.io / Hetzner / your own VPS

Same idea: install Python deps, set env vars, attach a persistent volume, expose port 8000, set CORS to your Vercel URL.

### C. Just run it locally and tunnel

For a quick demo without a backend host, run the backend locally:

```bash
cd backend
source .venv/bin/activate
python run.py
```

Then expose it with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or ngrok:

```bash
cloudflared tunnel --url http://localhost:8000
```

Use the tunnel URL as `NEXT_PUBLIC_API_URL` in Vercel.

## 3. After both are deployed

- Upload your files via **Upload Company files** page (or rsync them onto the backend volume at `/data/company_data/...`).
- Hit the **Settings → Re-index company files** button (or `POST /ingest`) so ChromaDB indexes them.
- Open the chat and ask away.

## 4. CORS gotcha

The backend's `CORS_ORIGINS` env var must include your Vercel frontend's exact URL (no trailing slash). Example:

```
CORS_ORIGINS=https://brainco.vercel.app,https://brainco-git-main-aalwaily.vercel.app
```

For preview deployments, Vercel generates per-PR URLs — easiest workaround is to set `CORS_ORIGINS=*` while testing, then tighten once you've picked a final domain.

## 5. Things NOT in the repo (by design)

These are `.gitignore`d so you have to provide them per-deploy:
- `backend/.env` (API keys)
- `company_data/**` (your real PII)
- `generated/warnings/**` (generated letters)
- `backend/chroma_db/`, `backend/chat_history.db` (regenerated on the host)
- `node_modules`, `.venv`, `.next`, logs
