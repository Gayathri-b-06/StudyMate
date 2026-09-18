"""
Migration: Add concept_mastery and concept_mastery_history tables.
Idempotent script to ensure both tables and their indexes exist.
"""

from app.db.session import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS concept_mastery (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    concept TEXT NOT NULL,
                    score REAL NOT NULL DEFAULT 50.0,
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS ix_concept_mastery_project_concept
                ON concept_mastery (project_id, concept)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_concept_mastery_project
                ON concept_mastery (project_id)
            """))

            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS concept_mastery_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    concept TEXT NOT NULL,
                    score REAL NOT NULL,
                    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_cmh_project_concept_recorded
                ON concept_mastery_history (project_id, concept, recorded_at)
            """))
            print("concept_mastery and concept_mastery_history tables created or already exist.")

if __name__ == "__main__":
    run_migration()
