import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

DB_PATH = Path("/opt/nirvana-max/data/nirvana.db")
INCOME_PM_THRESHOLD = float(os.getenv("INCOME_PM_THRESHOLD", "25000"))


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = get_conn()
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS profiles (
            user_id TEXT PRIMARY KEY,
            region TEXT,
            age INTEGER,
            employment TEXT,
            marital_status TEXT,
            income REAL,
            children_count INTEGER DEFAULT 0,
            children_ages TEXT DEFAULT '[]',
            statuses TEXT DEFAULT '[]',
            scenario_id TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            scenario_id TEXT,
            measure_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            due_date TEXT,
            status TEXT DEFAULT 'pending',
            priority INTEGER DEFAULT 3,
            deep_link TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS checklist_state (
            user_id TEXT NOT NULL,
            measure_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, measure_id, item_id)
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            task_id INTEGER,
            remind_at TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            sent_at TEXT
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        """
    )

    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def upsert_profile(user_id: str, data: dict[str, Any]):
    conn = get_conn()

    payload = {
        "user_id": user_id,
        "region": data.get("region"),
        "age": data.get("age"),
        "employment": data.get("employment"),
        "marital_status": data.get("marital_status"),
        "income": data.get("income"),
        "children_count": data.get("children_count", 0),
        "children_ages": json.dumps(data.get("children_ages", []), ensure_ascii=False),
        "statuses": json.dumps(data.get("statuses", []), ensure_ascii=False),
        "scenario_id": data.get("scenario_id"),
        "updated_at": now_iso(),
    }

    conn.execute(
        """
        INSERT INTO profiles (
            user_id,
            region,
            age,
            employment,
            marital_status,
            income,
            children_count,
            children_ages,
            statuses,
            scenario_id,
            updated_at
        )
        VALUES (
            :user_id,
            :region,
            :age,
            :employment,
            :marital_status,
            :income,
            :children_count,
            :children_ages,
            :statuses,
            :scenario_id,
            :updated_at
        )
        ON CONFLICT(user_id) DO UPDATE SET
            region = excluded.region,
            age = excluded.age,
            employment = excluded.employment,
            marital_status = excluded.marital_status,
            income = excluded.income,
            children_count = excluded.children_count,
            children_ages = excluded.children_ages,
            statuses = excluded.statuses,
            scenario_id = excluded.scenario_id,
            updated_at = excluded.updated_at
        """,
        payload,
    )

    conn.commit()
    conn.close()


def get_profile(user_id: str) -> dict[str, Any] | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM profiles WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    conn.close()

    if not row:
        return None

    result = dict(row)
    result["children_ages"] = json.loads(result["children_ages"] or "[]")
    result["statuses"] = json.loads(result["statuses"] or "[]")

    if result["income"] is not None:
        result["income_below_pm"] = result["income"] <= INCOME_PM_THRESHOLD
    else:
        result["income_below_pm"] = False

    return result


def create_task(
    user_id: str,
    title: str,
    description: str = "",
    scenario_id: str | None = None,
    measure_id: str | None = None,
    due_date: str | None = None,
    priority: int = 3,
    deep_link: str | None = None,
) -> int:
    conn = get_conn()

    cur = conn.execute(
        """
        INSERT INTO tasks (
            user_id,
            scenario_id,
            measure_id,
            title,
            description,
            due_date,
            priority,
            deep_link,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            scenario_id,
            measure_id,
            title,
            description,
            due_date,
            priority,
            deep_link,
            now_iso(),
        ),
    )

    conn.commit()
    task_id = int(cur.lastrowid)
    conn.close()
    return task_id


def get_tasks(user_id: str) -> list[dict[str, Any]]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT *
        FROM tasks
        WHERE user_id = ?
        ORDER BY
            CASE status
                WHEN 'pending' THEN 0
                WHEN 'in_progress' THEN 1
                ELSE 2
            END,
            priority ASC,
            id DESC
        """,
        (user_id,),
    ).fetchall()

    conn.close()
    return [dict(row) for row in rows]


def complete_task(task_id: int, user_id: str):
    conn = get_conn()

    conn.execute(
        """
        UPDATE tasks
        SET status = 'completed',
            completed_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (now_iso(), task_id, user_id),
    )

    conn.commit()
    conn.close()


def upsert_checklist(
    user_id: str,
    measure_id: str,
    item_id: str,
    completed: bool,
):
    conn = get_conn()

    conn.execute(
        """
        INSERT INTO checklist_state (
            user_id,
            measure_id,
            item_id,
            completed,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, measure_id, item_id)
        DO UPDATE SET
            completed = excluded.completed,
            updated_at = excluded.updated_at
        """,
        (
            user_id,
            measure_id,
            item_id,
            int(completed),
            now_iso(),
        ),
    )

    conn.commit()
    conn.close()


def get_checklist_state(user_id: str, measure_id: str) -> dict[str, bool]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT item_id, completed
        FROM checklist_state
        WHERE user_id = ? AND measure_id = ?
        """,
        (user_id, measure_id),
    ).fetchall()

    conn.close()

    return {
        row["item_id"]: bool(row["completed"])
        for row in rows
    }


def create_reminder(
    user_id: str,
    remind_at: str,
    task_id: int | None = None,
) -> int:
    conn = get_conn()

    cur = conn.execute(
        """
        INSERT INTO reminders (
            user_id,
            task_id,
            remind_at,
            active
        )
        VALUES (?, ?, ?, 1)
        """,
        (user_id, task_id, remind_at),
    )

    conn.commit()
    reminder_id = int(cur.lastrowid)
    conn.close()
    return reminder_id


def get_due_reminders() -> list[dict[str, Any]]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT *
        FROM reminders
        WHERE active = 1
          AND sent_at IS NULL
          AND remind_at <= ?
        ORDER BY id ASC
        """,
        (now_iso(),),
    ).fetchall()

    conn.close()
    return [dict(row) for row in rows]


def mark_reminder_sent(reminder_id: int):
    conn = get_conn()

    conn.execute(
        """
        UPDATE reminders
        SET active = 0,
            sent_at = ?
        WHERE id = ?
        """,
        (now_iso(), reminder_id),
    )

    conn.commit()
    conn.close()


def get_reminders(user_id: str) -> list[dict[str, Any]]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT *
        FROM reminders
        WHERE user_id = ?
        ORDER BY remind_at ASC
        """,
        (user_id,),
    ).fetchall()

    conn.close()
    return [dict(row) for row in rows]


def add_history(
    user_id: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
):
    conn = get_conn()

    conn.execute(
        """
        INSERT INTO history (
            user_id,
            event_type,
            payload,
            created_at
        )
        VALUES (?, ?, ?, ?)
        """,
        (
            user_id,
            event_type,
            json.dumps(payload or {}, ensure_ascii=False),
            now_iso(),
        ),
    )

    conn.commit()
    conn.close()


def get_history(user_id: str) -> list[dict[str, Any]]:
    conn = get_conn()

    rows = conn.execute(
        """
        SELECT *
        FROM history
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 50
        """,
        (user_id,),
    ).fetchall()

    conn.close()

    result = []

    for row in rows:
        item = dict(row)
        item["payload"] = json.loads(item["payload"] or "{}")
        result.append(item)

    return result
