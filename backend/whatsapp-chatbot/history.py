"""Per-phone-number chat history in SQLite. Survives restarts and doubles as a log for evaluating the model."""
import os
import sqlite3
import threading
import time

_lock = threading.Lock()
_db = sqlite3.connect(os.getenv("DB_PATH", "chat.db"), check_same_thread=False)
_db.execute(
    """CREATE TABLE IF NOT EXISTS turns (
        phone TEXT, user_text TEXT, reply TEXT, model TEXT, ts REAL, active INTEGER DEFAULT 1
    )"""
)
_db.commit()


def get(phone, max_turns):
    """Last max_turns exchanges as Converse messages (user/assistant alternating, user first)."""
    with _lock:
        rows = _db.execute(
            "SELECT user_text, reply FROM turns WHERE phone = ? AND active = 1 ORDER BY rowid DESC LIMIT ?",
            (phone, max_turns),
        ).fetchall()
    messages = []
    for user_text, reply in reversed(rows):
        messages.append({"role": "user", "content": [{"text": user_text}]})
        messages.append({"role": "assistant", "content": [{"text": reply}]})
    return messages


def add_turn(phone, user_text, reply, model):
    with _lock:
        _db.execute(
            "INSERT INTO turns (phone, user_text, reply, model, ts) VALUES (?, ?, ?, ?, ?)",
            (phone, user_text, reply, model, time.time()),
        )
        _db.commit()


def clear(phone):
    """Forget the conversation for the model, but keep the rows for evaluation."""
    with _lock:
        _db.execute("UPDATE turns SET active = 0 WHERE phone = ?", (phone,))
        _db.commit()
