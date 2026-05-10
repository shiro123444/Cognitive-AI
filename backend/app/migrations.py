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


def _backfill_null_column(table_name: str, column_name: str, expression: str) -> None:
    inspector = inspect(db.engine)
    if not inspector.has_table(table_name):
        return
    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name not in existing_columns:
        return
    with db.engine.begin() as conn:
        conn.execute(text(
            f"UPDATE {table_name} SET {column_name} = {expression} WHERE {column_name} IS NULL"
        ))


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
    _add_column_if_missing("concept", "created_at", "created_at DATETIME")
    _backfill_null_column("concept", "created_at", "CURRENT_TIMESTAMP")
    _add_column_if_missing("graph_edge", "scope_type", "scope_type VARCHAR NOT NULL DEFAULT 'course_global'")
    _add_column_if_missing("graph_edge", "owner_id", "owner_id VARCHAR NOT NULL DEFAULT ''")
    _add_column_if_missing("graph_edge", "created_at", "created_at DATETIME")
    _backfill_null_column("graph_edge", "created_at", "CURRENT_TIMESTAMP")

    # Job webhook support
    _add_column_if_missing("job", "webhook_url", "webhook_url VARCHAR")
    _add_column_if_missing("job", "webhook_secret", "webhook_secret VARCHAR")

    # Multi-tenancy
    for table in ("edu_dataset", "edu_analysis", "edu_report"):
        _add_column_if_missing(table, "tenant_id", "tenant_id VARCHAR NOT NULL DEFAULT 'default'")
        _backfill_null_column(table, "tenant_id", "'default'")

    # Auth: username + password_hash on user
    _add_column_if_missing("user", "username", "username VARCHAR")
    _add_column_if_missing("user", "password_hash", "password_hash VARCHAR")

    with db.engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_template (
                id VARCHAR NOT NULL PRIMARY KEY,
                title VARCHAR NOT NULL,
                experiment_type VARCHAR NOT NULL,
                adapter VARCHAR NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                status VARCHAR NOT NULL DEFAULT 'draft',
                data_source VARCHAR NOT NULL DEFAULT 'synthetic',
                difficulty VARCHAR NOT NULL DEFAULT 'basic',
                estimated_minutes INTEGER NOT NULL DEFAULT 25,
                default_params_json TEXT NOT NULL DEFAULT '{}',
                linked_concept_ids_json TEXT NOT NULL DEFAULT '[]',
                created_at DATETIME NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_run (
                id VARCHAR NOT NULL PRIMARY KEY,
                template_id VARCHAR NOT NULL,
                student_id VARCHAR,
                course_id VARCHAR,
                chapter_id VARCHAR,
                activity_id VARCHAR,
                status VARCHAR NOT NULL DEFAULT 'pending',
                adapter VARCHAR NOT NULL,
                params_json TEXT NOT NULL DEFAULT '{}',
                summary_json TEXT NOT NULL DEFAULT '{}',
                error_message TEXT NOT NULL DEFAULT '',
                created_at DATETIME NOT NULL,
                completed_at DATETIME,
                FOREIGN KEY(template_id) REFERENCES experiment_template (id)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_artifact (
                id VARCHAR NOT NULL PRIMARY KEY,
                run_id VARCHAR NOT NULL,
                artifact_type VARCHAR NOT NULL,
                title VARCHAR NOT NULL,
                data_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME NOT NULL,
                FOREIGN KEY(run_id) REFERENCES experiment_run (id)
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS experiment_report (
                id VARCHAR NOT NULL PRIMARY KEY,
                run_id VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'draft',
                content_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(run_id) REFERENCES experiment_run (id)
            )
        """))
