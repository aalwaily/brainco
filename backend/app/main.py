from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import history
from .categories import (
    CATEGORIES,
    DEFAULT_CATEGORY,
    category_of_path,
    classify,
    classify_smart,
    ensure_dirs as ensure_category_dirs,
    find_by_name as find_company_file,
    migrate_flat_files,
    safe_category,
)
from .chat_service import answer, stream_answer
from .config import settings
from .providers import LLMError, list_providers
from .generated_groups import (
    create_group as gen_create_group,
    delete_file as gen_delete_file,
    delete_group as gen_delete_group,
    find_in_groups as gen_find,
    list_groups as gen_list_groups,
    move_file as gen_move_file,
)
from .ingest_service import ingest_all, ingest_path
from .loaders import SUPPORTED_EXTENSIONS, iter_company_files
from .logger import logger
from .vectorstore import delete_by_source, stats
from .warnings import generate_warning, list_generated_warnings

app = FastAPI(title="AI Company Brain", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Schemas ----------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: Optional[int] = None
    provider: Optional[str] = None  # "deepseek" / "gemini" — omit to use default


class ChatResponse(BaseModel):
    answer: str
    sources: list = []
    generated_file: Optional[str] = None
    session_id: Optional[int] = None
    provider: Optional[str] = None


class SessionRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class WarningRequest(BaseModel):
    employee: str = Field(..., description="Iqama or name")
    reason: str = Field(..., min_length=1)
    date: Optional[str] = None


# ---- Lifecycle --------------------------------------------------------------

@app.on_event("startup")
def _startup() -> None:
    history.init_db()
    ensure_category_dirs()
    moved = migrate_flat_files()
    if moved:
        logger.info(f"Migrated {moved} loose file(s) into category folders")
    logger.info("AI Company Brain API ready")
    logger.info(f"  company_data: {settings.company_data_path}")
    logger.info(f"  chroma:       {settings.chroma_path}")
    logger.info(f"  sqlite:       {settings.sqlite_path}")


# ---- Health -----------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"ok": True, "vector_store": stats()}


# ---- LLM Providers ----------------------------------------------------------

@app.get("/providers")
def get_providers() -> dict:
    """List every registered LLM provider with its availability + default."""
    return {
        "default":   settings.LLM_PROVIDER,
        "providers": list_providers(),
    }


# ---- Chat -------------------------------------------------------------------

def _ensure_session(req: ChatRequest) -> int:
    """Return the session id for this request, creating a new session
    titled by the first message if none was provided."""
    if req.session_id is not None:
        s = history.get_session(req.session_id)
        if not s:
            raise HTTPException(status_code=404, detail=f"Session {req.session_id} not found")
        return req.session_id
    return history.create_session(history._title_from_message(req.message))


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    try:
        result = await answer(req.message, getattr(req, "provider", None))
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("chat failed")
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

    session_id = _ensure_session(req)
    history.add_message(session_id, "user", req.message)
    history.add_message(
        session_id,
        "assistant",
        result["answer"],
        json.dumps(result.get("sources", []), ensure_ascii=False),
        result.get("generated_file"),
    )
    return ChatResponse(**result, session_id=session_id)


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Newline-delimited JSON stream. Events:
    {"type":"session","id":N}                       — first event, always
    {"type":"sources","sources":[...]}
    {"type":"token","content":"..."}
    {"type":"done","answer":"<full>","generated_file":null}
    {"type":"error","message":"..."}
    """
    session_id = _ensure_session(req)
    # Persist the user message immediately so reloads / parallel queries see it.
    history.add_message(session_id, "user", req.message)

    final_answer = {"text": "", "sources": [], "generated_file": None}

    async def gen():
        # Tell the client the session id up front so it can route follow-ups.
        yield json.dumps({"type": "session", "id": session_id}, ensure_ascii=False) + "\n"
        try:
            async for line in stream_answer(req.message, req.provider):
                try:
                    obj = json.loads(line)
                    if obj.get("type") == "sources":
                        final_answer["sources"] = obj.get("sources") or []
                    elif obj.get("type") == "done":
                        final_answer["text"] = obj.get("answer") or ""
                        final_answer["generated_file"] = obj.get("generated_file")
                except json.JSONDecodeError:
                    pass
                yield line
        finally:
            if final_answer["text"]:
                history.add_message(
                    session_id,
                    "assistant",
                    final_answer["text"],
                    json.dumps(final_answer["sources"], ensure_ascii=False),
                    final_answer["generated_file"],
                )

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


# ---- Sessions ---------------------------------------------------------------

@app.get("/sessions")
def list_chat_sessions(limit: int = 80) -> dict:
    return {"items": history.list_sessions(limit=limit)}


@app.get("/sessions/{session_id}")
def get_chat_session(session_id: int) -> dict:
    s = history.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s["messages"] = history.get_session_messages(session_id)
    return s


@app.patch("/sessions/{session_id}")
def rename_chat_session(session_id: int, req: SessionRenameRequest) -> dict:
    updated = history.rename_session(session_id, req.title)
    if updated == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"renamed": session_id, "title": req.title}


@app.delete("/sessions/{session_id}")
def delete_chat_session(session_id: int) -> dict:
    deleted = history.delete_session(session_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": session_id}


@app.delete("/sessions")
def clear_chat_sessions() -> dict:
    return {"deleted": history.clear_all_sessions()}


@app.delete("/sessions/{session_id}/messages/{message_id}")
def delete_message_in_session(session_id: int, message_id: int) -> dict:
    n = history.delete_message(session_id, message_id)
    if n == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"deleted": message_id}


class TruncateRequest(BaseModel):
    after_message_id: int = Field(..., ge=0)


@app.post("/sessions/{session_id}/truncate")
def truncate_session(session_id: int, req: TruncateRequest) -> dict:
    """Delete every message in this session whose id is > after_message_id.
    Used by the frontend to support Edit (keep up to the edited message) and
    Regenerate (drop the trailing assistant reply)."""
    s = history.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    removed = history.truncate_after_message(session_id, req.after_message_id)
    return {"removed": removed}


# ---- History ----------------------------------------------------------------

@app.get("/history")
def get_history(limit: int = 50) -> dict:
    return {"items": history.list_history(limit=limit)}


@app.delete("/history")
def delete_history() -> dict:
    return {"deleted": history.clear()}


@app.delete("/history/{item_id}")
def delete_history_item(item_id: int) -> dict:
    deleted = history.delete(item_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"deleted": item_id}


# ---- Files ------------------------------------------------------------------

def _file_record(p: Path, base: Path) -> dict:
    st = p.stat()
    return {
        "name": p.name,
        "relative_path": str(p.relative_to(base)),
        "size": st.st_size,
        "modified_at": st.st_mtime,
        "type": p.suffix.lower().lstrip("."),
        "category": category_of_path(p),
    }


@app.get("/files")
def list_files() -> dict:
    """Return company files grouped by category."""
    base = settings.company_data_path
    ensure_category_dirs()

    by_cat: dict[str, list] = {cat: [] for cat in CATEGORIES}
    uncategorized: list = []
    for p in iter_company_files(base):
        rec = _file_record(p, base)
        cat = rec["category"]
        if cat in by_cat:
            by_cat[cat].append(rec)
        else:
            uncategorized.append(rec)
    for items in by_cat.values():
        items.sort(key=lambda x: x["modified_at"], reverse=True)
    uncategorized.sort(key=lambda x: x["modified_at"], reverse=True)

    categories_payload = [
        {"name": cat, "count": len(by_cat[cat]), "items": by_cat[cat]}
        for cat in CATEGORIES
    ]
    return {
        "categories": categories_payload,
        "uncategorized": uncategorized,
        "company_data_dir": str(base),
    }


@app.post("/upload")
async def upload(
    files: List[UploadFile] = File(...),
    category: Optional[str] = None,
) -> dict:
    """Upload files. If `category` is omitted, each file is auto-classified:
    obvious filenames go via the keyword rules (instant), ambiguous ones get
    a real AI classification based on the file's content preview.
    """
    import os
    import tempfile

    saved = []
    base = settings.company_data_path
    ensure_category_dirs()

    chosen: Optional[str] = None
    if category:
        try:
            chosen = safe_category(category)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {ext or '(none)'}. Allowed: {sorted(SUPPORTED_EXTENSIONS)}",
            )
        safe_name = Path(f.filename).name

        # 1) Stage to a temp file so we can read its content for AI classification
        #    without committing to a folder yet.
        tmp_fd, tmp_path_str = tempfile.mkstemp(suffix=ext, prefix="acb_upload_")
        tmp_path = Path(tmp_path_str)
        try:
            with os.fdopen(tmp_fd, "wb") as out:
                shutil.copyfileobj(f.file, out)

            # 2) Pick the destination category.
            if chosen:
                cat, method = chosen, "explicit"
            else:
                cat, method = await classify_smart(tmp_path)

            # 3) Move staged file into the final category folder, then index.
            cat_dir = base / cat
            cat_dir.mkdir(parents=True, exist_ok=True)
            dest = cat_dir / safe_name
            shutil.move(str(tmp_path), str(dest))
            tmp_path = dest  # keep tmp_path for the finally cleanup test
            added = ingest_path(dest)
            saved.append({
                "name": safe_name,
                "category": cat,
                "classified_by": method,
                "chunks_added": added,
                "size": dest.stat().st_size,
            })
        finally:
            # Only delete if the move never happened (tmp_path still pointing
            # to the temp file rather than the final destination).
            try:
                if tmp_path.exists() and str(tmp_path).startswith(tempfile.gettempdir()):
                    tmp_path.unlink()
            except Exception:
                pass

    return {"uploaded": saved, "store": stats()}


@app.delete("/files/{name}")
def delete_file(name: str) -> dict:
    """Delete a file by basename — searches every category folder."""
    target = find_company_file(name)
    if not target:
        raise HTTPException(status_code=404, detail="File not found")
    target.unlink()
    delete_by_source(target.name)
    return {"deleted": name, "category": category_of_path(target), "store": stats()}


@app.delete("/files/{category}/{name}")
def delete_file_in_category(category: str, name: str) -> dict:
    """Delete a file from a specific category folder."""
    try:
        cat = safe_category(category)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    base = settings.company_data_path
    target = (base / cat / Path(name).name).resolve()
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if base.resolve() not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid path")
    target.unlink()
    delete_by_source(target.name)
    return {"deleted": name, "category": cat, "store": stats()}


@app.get("/categories")
def get_categories() -> dict:
    return {"categories": CATEGORIES, "default": DEFAULT_CATEGORY}


@app.post("/ingest")
def trigger_ingest(append: bool = False) -> dict:
    return ingest_all(reset=not append)


# ---- Warnings ---------------------------------------------------------------

@app.post("/warnings/generate")
def warnings_generate(req: WarningRequest) -> dict:
    try:
        return generate_warning(req.employee, req.reason, req.date)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("warning generate failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/generated")
def get_generated() -> dict:
    return {"groups": gen_list_groups(), "dir": str(settings.generated_path)}


class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=40)


class MoveRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    from_group: str = Field(..., alias="from", min_length=1)
    to_group: str = Field(..., alias="to", min_length=1)

    model_config = {"populate_by_name": True}


@app.post("/generated/groups")
def create_generated_group(req: GroupCreateRequest) -> dict:
    try:
        name = gen_create_group(req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"created": name}


@app.delete("/generated/groups/{name}")
def delete_generated_group(name: str) -> dict:
    try:
        gen_delete_group(name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"deleted": name}


@app.post("/generated/move")
def move_generated_file(req: MoveRequest) -> dict:
    try:
        dst = gen_move_file(req.filename, req.from_group, req.to_group)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"moved": dst.name, "to": req.to_group}


@app.delete("/generated/{group}/{filename}")
def delete_generated_file(group: str, filename: str) -> dict:
    try:
        gen_delete_file(filename, group)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"deleted": filename, "group": group}


def _safe_download(path: Path) -> FileResponse:
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/octet-stream",
    )


@app.get("/generated/group/{group}/{name}")
def download_generated_in_group(group: str, name: str) -> FileResponse:
    base = settings.generated_path
    target = (base / group / name).resolve()
    if base not in target.parents and target.parent.parent != base:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return _safe_download(target)


@app.get("/generated/{name}")
def download_generated(name: str) -> FileResponse:
    # Back-compat: search every group for the file.
    found = gen_find(name)
    if not found:
        raise HTTPException(status_code=404, detail="File not found")
    return _safe_download(found)
