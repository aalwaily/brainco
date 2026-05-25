# Deployment Guide

This project has **two halves** that deploy to **two different services**:

| Half | What it does | Host |
|---|---|---|
| `frontend/` | Next.js UI (chat, files, generated docs, sidebar, settings) | **Vercel** |
| `backend/`  | FastAPI + ChromaDB + sentence-transformers + SQLite | **Railway** or **Render** |

The frontend needs to know the backend's public URL via the `NEXT_PUBLIC_API_URL` env var. The backend needs the LLM API keys + the frontend's domain allowed in CORS.

---

## 1 · Backend on Railway (recommended — 5 minutes)

1. **Create the project** — sign in at <https://railway.com>, click **+ New Project → Deploy from GitHub repo**, pick `aalwaily/brainco`.
2. Railway auto-detects `railway.json` in the repo root and builds from `backend/Dockerfile`.
3. After the first build succeeds, go to **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DEEPSEEK_API_KEY` | `sk-...` from <https://platform.deepseek.com/api_keys> |
   | `GEMINI_API_KEY`   | `AIza...` from <https://aistudio.google.com/app/apikey> |
   | `LLM_PROVIDER`     | `deepseek` |
   | `GEMINI_MODEL`     | `gemini-2.0-flash` |
   | `CORS_ORIGINS`     | `https://<your-app>.vercel.app` (your Vercel domain) |

4. Go to **Settings → Networking → Generate Domain**. You'll get something like `https://brainco-backend-production.up.railway.app`.
5. Test it: open `https://<that-domain>/health` in your browser — should return `{"ok": true, ...}`.

---

## 2 · Backend on Render (alternative)

1. Click <https://render.com/deploy?repo=https://github.com/aalwaily/brainco>.
2. Render reads `render.yaml` and provisions the service + a 1 GB persistent disk.
3. Add the same secret env vars (`DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `CORS_ORIGINS`) in the Render dashboard.
4. After deploy, your URL will be `https://brainco-backend.onrender.com`.

---

## 3 · Frontend on Vercel

1. **Connect the repo** — sign in at <https://vercel.com>, **Add New… → Project**, pick `aalwaily/brainco`.
2. **IMPORTANT: set Root Directory to `frontend/`** (Vercel's settings, before first deploy).
3. **Framework Preset**: Next.js (auto-detected).
4. Add environment variables (Production + Preview):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | your backend URL from step 1 or 2 (no trailing slash) |

5. Click **Deploy**.

### Disable Deployment Protection (so the public URL works)

By default Vercel puts Preview deployments behind authentication. To make your app reachable without logging in:

- Vercel dashboard → your project → **Settings → Deployment Protection**
- Set **Vercel Authentication** to **Disabled** (or scope it to Preview only)
- Click **Save**

---

## 4 · After both are up

- **Test it** — open your Vercel URL, ask anything. The chat should stream.
- **Switch provider** — in the app: **Local instance → Settings → AI model → Provider** (DeepSeek / Gemini).
- **Upload company files** — go to **Files** tab and drop documents; they'll be auto-classified into HR / Accounts / Operations & Project and indexed for retrieval.

---

## 5 · Updating CORS after Vercel URL changes

Vercel preview deployments use different subdomains. To allow them all in CORS, set:

```
CORS_ORIGINS=https://<your-app>.vercel.app,https://<your-app>-*.vercel.app,http://localhost:3000
```

Or, if you have a custom domain, just put that.

---

## Troubleshooting

**`Failed to fetch`** in browser console → backend URL is wrong, or CORS is blocking. Verify:
- `NEXT_PUBLIC_API_URL` in Vercel matches the backend's public URL exactly.
- `CORS_ORIGINS` in Railway/Render includes the Vercel domain.

**Backend cold-start is slow (first call after idle)** → Render free tier sleeps after 15 min of inactivity. Upgrade or keep it warm with a cron-ping.

**Gemini 429 rate-limit** → Free tier is small. The app automatically falls back to DeepSeek when this happens; you'll see `provider: deepseek` in the response. Switch model in Settings or upgrade your plan.
