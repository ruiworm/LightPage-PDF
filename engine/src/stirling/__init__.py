"""Stirling AI engine package."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

    from .api.app import app


def __getattr__(name: str) -> FastAPI:
    # Local redaction must not initialize the account-connected AI application.
    if name == "app":
        from .api.app import app

        return app
    raise AttributeError(name)


__all__ = [
    "app",
]
