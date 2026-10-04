"""Per-phone-number chat history. Also the log for evaluating the model.

Uses DynamoDB when HISTORY_TABLE is set (AWS Lambda), otherwise a local SQLite file.
"""
import os
import sqlite3
import threading
import time
from decimal import Decimal

_lock = threading.Lock()
_db = None
_table = None


def _messages(pairs):
    """[(user_text, reply), ...] oldest first -> Converse messages (user/assistant alternating, user first)."""
    messages = []
    for user_text, reply in pairs:
        messages.append({"role": "user", "content": [{"text": user_text}]})
        messages.append({"role": "assistant", "content": [{"text": reply}]})
    return messages


# ---- DynamoDB: partition key phone (S), sort key ts (N). RESET writes a marker instead of deleting. ----

def _dynamo():
    global _table
    if _table is None:
        import boto3

        _table = boto3.resource("dynamodb").Table(os.environ["HISTORY_TABLE"])
    return _table


def _dynamo_get(phone, max_turns):
    from boto3.dynamodb.conditions import Key

    pairs, kwargs = [], {}
    while len(pairs) < max_turns:
        page = _dynamo().query(
            KeyConditionExpression=Key("phone").eq(phone), ScanIndexForward=False, Limit=50, **kwargs
        )
        for item in page["Items"]:
            if item.get("kind") == "reset":
                return _messages(reversed(pairs))
            pairs.append((item["user_text"], item["reply"]))
            if len(pairs) == max_turns:
                break
        if "LastEvaluatedKey" not in page:
            break
        kwargs = {"ExclusiveStartKey": page["LastEvaluatedKey"]}
    return _messages(reversed(pairs))


def _dynamo_put(phone, **fields):
    _dynamo().put_item(Item={"phone": phone, "ts": Decimal(str(time.time())), **{k: v for k, v in fields.items() if v}})


def _dynamo_last_conversation(phone):
    from boto3.dynamodb.conditions import Key

    page = _dynamo().query(KeyConditionExpression=Key("phone").eq(phone), ScanIndexForward=False, Limit=1)
    item = page["Items"][0] if page["Items"] else {}
    return item.get("conversation_id") if item.get("kind") == "turn" else None


# ---- SQLite (local) ----

def _sqlite():
    global _db
    if _db is None:
        _db = sqlite3.connect(os.getenv("DB_PATH", "chat.db"), check_same_thread=False)
        _db.execute(
            """CREATE TABLE IF NOT EXISTS turns (
                phone TEXT, user_text TEXT, reply TEXT, model TEXT, ts REAL, active INTEGER DEFAULT 1
            )"""
        )
        try:
            _db.execute("ALTER TABLE turns ADD COLUMN conversation_id TEXT")
        except sqlite3.OperationalError:
            pass  # column already there
        _db.commit()
    return _db


def get(phone, max_turns):
    """Last max_turns exchanges as Converse messages."""
    if os.getenv("HISTORY_TABLE"):
        return _dynamo_get(phone, max_turns)
    with _lock:
        rows = _sqlite().execute(
            "SELECT user_text, reply FROM turns WHERE phone = ? AND active = 1 ORDER BY rowid DESC LIMIT ?",
            (phone, max_turns),
        ).fetchall()
    return _messages(reversed(rows))


def add_turn(phone, user_text, reply, model, conversation_id=None):
    if os.getenv("HISTORY_TABLE"):
        return _dynamo_put(phone, kind="turn", user_text=user_text, reply=reply, model=model,
                           conversation_id=conversation_id)
    with _lock:
        _sqlite().execute(
            "INSERT INTO turns (phone, user_text, reply, model, ts, conversation_id) VALUES (?, ?, ?, ?, ?, ?)",
            (phone, user_text, reply, model, time.time(), conversation_id),
        )
        _sqlite().commit()


def last_conversation(phone):
    """The Floss conversation id of the latest exchange, or None after RESET / when there is none."""
    if os.getenv("HISTORY_TABLE"):
        return _dynamo_last_conversation(phone)
    with _lock:
        row = _sqlite().execute(
            "SELECT conversation_id FROM turns WHERE phone = ? AND active = 1 ORDER BY rowid DESC LIMIT 1", (phone,)
        ).fetchone()
    return row[0] if row else None


def clear(phone):
    """Forget the conversation for the model, but keep the rows for evaluation."""
    if os.getenv("HISTORY_TABLE"):
        return _dynamo_put(phone, kind="reset")
    with _lock:
        _sqlite().execute("UPDATE turns SET active = 0 WHERE phone = ?", (phone,))
        _sqlite().commit()
