"""Lightweight schema migrations for SQLite.

Runs at app startup. Adds missing columns to existing tables so that
old databases work with new code without losing data.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.db import db


def _add_column_if_missing(table_name: str, column_name: str, column_def: str) -> None:
    """ALTER TABLE ADD COLUMN if the column does not already exist."""
    inspector = inspect(db.engine)
    if not inspector.has_table(table_name):
        return
    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        return
    with db.engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_def}"))


def run_migrations() -> None:
    """Apply all pending schema additions. Safe to run repeatedly."""
    # Material: chunk_count, extraction_method
    _add_column_if_missing("material", "chunk_count", "chunk_count INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("material", "extraction_method", "extraction_method VARCHAR NOT NULL DEFAULT ''")

    # Chunk: page_number, chunk_type, heading
    _add_column_if_missing("chunk", "page_number", "page_number INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing("chunk", "chunk_type", "chunk_type VARCHAR NOT NULL DEFAULT 'text'")
    _add_column_if_missing("chunk", "heading", "heading VARCHAR")

    # QuizItem: material_id (nullable FK)
    _add_column_if_missing("quiz_item", "material_id", "material_id VARCHAR")

    # Knowledge scope metadata
    _add_column_if_missing("material", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("material", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
    _add_column_if_missing("concept", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("concept", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
    _add_column_if_missing("concept", "created_at", "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
    _add_column_if_missing("graph_edge", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("graph_edge", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
    _add_column_if_missing("graph_edge", "created_at", "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
