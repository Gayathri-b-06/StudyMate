from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE documents ADD COLUMN index_status TEXT NOT NULL DEFAULT 'ready'"))
        conn.commit()
        print("Column added successfully.")
    except Exception as e:
        msg = str(e).lower()
        if "duplicate column" in msg or "already exists" in msg:
            print("Column already exists, skipping.")
        else:
            raise
