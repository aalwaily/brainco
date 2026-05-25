"""CLI: scan company_data/ and (re)build the vector index.

Usage:
    python ingest.py            # reset and rebuild
    python ingest.py --append   # add to existing index
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make 'app' importable when run from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.ingest_service import ingest_all  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest company_data into ChromaDB")
    parser.add_argument(
        "--append",
        action="store_true",
        help="Add to existing index instead of resetting it.",
    )
    args = parser.parse_args()

    result = ingest_all(reset=not args.append)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
