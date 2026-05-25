from __future__ import annotations

import sys
from loguru import logger

logger.remove()
logger.add(
    sys.stdout,
    level="INFO",
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
)
logger.add(
    "logs/app.log",
    level="DEBUG",
    rotation="5 MB",
    retention="14 days",
    enqueue=True,
    backtrace=True,
    diagnose=False,
)

__all__ = ["logger"]
