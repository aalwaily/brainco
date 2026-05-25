"""Group management for generated documents.

Each subdirectory of `generated/` is a *group*. The `warnings` group is the
default — warning letters land there automatically. Users can create custom
groups (e.g. "Summaries", "HR-2026") and move documents between them.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Dict, List, Optional

from .config import settings
from .logger import logger

RESERVED_GROUPS = {"warnings"}
_NAME_RE = re.compile(r"^[A-Za-z0-9_\- ]{1,40}$")


def _safe_group_name(name: str) -> str:
    n = (name or "").strip()
    if not n or not _NAME_RE.match(n):
        raise ValueError(
            "Invalid group name. Use letters, numbers, spaces, '-' or '_' (1-40 chars)."
        )
    return n


def _safe_filename(name: str) -> str:
    # strip any directory components
    return Path(name).name


def list_groups() -> List[Dict]:
    base = settings.generated_path
    base.mkdir(parents=True, exist_ok=True)
    # Ensure the default "warnings" group is always present.
    (base / "warnings").mkdir(parents=True, exist_ok=True)

    out: List[Dict] = []
    for d in sorted(base.iterdir(), key=lambda p: p.name.lower()):
        if not d.is_dir() or d.name.startswith("."):
            continue
        items: List[Dict] = []
        for p in sorted(d.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file() and not p.name.startswith("."):
                st = p.stat()
                items.append({
                    "filename": p.name,
                    "group": d.name,
                    "size": st.st_size,
                    "created_at": st.st_mtime,
                })
        out.append({
            "name": d.name,
            "count": len(items),
            "reserved": d.name in RESERVED_GROUPS,
            "items": items,
        })
    return out


def create_group(name: str) -> str:
    safe = _safe_group_name(name)
    target = settings.generated_path / safe
    if target.exists():
        if target.is_dir():
            return safe
        raise ValueError("A non-directory with that name already exists.")
    target.mkdir(parents=True, exist_ok=True)
    logger.info(f"Created group: {safe}")
    return safe


def delete_group(name: str) -> None:
    safe = _safe_group_name(name)
    if safe in RESERVED_GROUPS:
        raise ValueError(f"Group '{safe}' is reserved and cannot be deleted.")
    target = settings.generated_path / safe
    if not target.exists() or not target.is_dir():
        raise FileNotFoundError(f"Group '{safe}' not found.")
    if any(target.iterdir()):
        raise ValueError("Group is not empty. Move or delete its files first.")
    target.rmdir()
    logger.info(f"Deleted group: {safe}")


def move_file(filename: str, from_group: str, to_group: str) -> Path:
    src_group = _safe_group_name(from_group)
    dst_group = _safe_group_name(to_group)
    if src_group == dst_group:
        return settings.generated_path / src_group / _safe_filename(filename)
    safe_filename = _safe_filename(filename)
    src = settings.generated_path / src_group / safe_filename
    dst_dir = settings.generated_path / dst_group
    if not src.exists() or not src.is_file():
        raise FileNotFoundError(f"File not found in group '{src_group}'.")
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / safe_filename
    if dst.exists():
        # avoid clobbering — suffix with a numeric tag
        stem, ext = dst.stem, dst.suffix
        for i in range(1, 100):
            candidate = dst_dir / f"{stem}_{i}{ext}"
            if not candidate.exists():
                dst = candidate
                break
    shutil.move(str(src), str(dst))
    logger.info(f"Moved {safe_filename}: {src_group} -> {dst_group}")
    return dst


def delete_file(filename: str, group: str) -> None:
    safe_group = _safe_group_name(group)
    safe_name = _safe_filename(filename)
    target = settings.generated_path / safe_group / safe_name
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"File not found in group '{safe_group}'.")
    target.unlink()
    logger.info(f"Deleted {safe_name} from {safe_group}")


def find_in_groups(filename: str) -> Optional[Path]:
    """Back-compat: search every group for a filename when the URL omits the group."""
    safe_name = _safe_filename(filename)
    base = settings.generated_path
    if not base.exists():
        return None
    for d in base.iterdir():
        if not d.is_dir():
            continue
        p = d / safe_name
        if p.exists() and p.is_file():
            return p
    return None
