import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

# Путь относительно корня проекта — работает и локально, и в Docker
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "nirvana.db"
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

        CREATE TABLE IF NOT EXISTS profile_meta (
            user_id TEXT PRIMARY KEY,
            full_name TEXT,
            phone TEXT,
            region TEXT,
            about TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS benefit_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            measure_id TEXT NOT NULL,
            user_id TEXT,
            vote INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )

    # --- Миграции: добавляем недостающие колонки на существующей БД ---
    existing = {
        row[1]
        for row in conn.execute("PRAGMA table_info(profiles)").fetchall()
    }
    migrations = [
        ("children", "TEXT DEFAULT '[]'"),
        ("scenario_specific", "TEXT DEFAULT '{}'"),
        ("full_name", "TEXT"),
        ("phone", "TEXT"),
        ("about", "TEXT"),
    ]
    for col, typ in migrations:
        if col not in existing:
            try:
                conn.execute(f"ALTER TABLE profiles ADD COLUMN {col} {typ}")
                print(f"DB MIGRATION: добавлена колонка {col}")
            except Exception as e:
                print(f"DB MIGRATION ERROR ({col}): {e}")

    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def upsert_profile(user_id: str, data: dict[str, Any]):
    conn = get_conn()

    # Текущий профиль — чтобы сохранить поля, которых нет в новых данных
    current = get_profile(user_id) or {}

    def keep(field, new_value):
        """Если новое значение None — оставляем старое."""
        if new_value is None and field in current:
            return current.get(field)
        return new_value

    # Дети
    children = data.get("children")
    if children is None:
        # Если в data вообще нет ключа children — оставляем старых детей
        if "children" in current and current.get("children"):
            children = current["children"]
        else:
            cnt = int(data.get("children_count") or 0)
            ages = data.get("children_ages") or []
            children = []
            for i in range(cnt):
                age = ages[i] if i < len(ages) else None
                children.append({"name": "", "age": age})

    children_count = len(children)
    children_ages = [
        c.get("age") for c in children if c.get("age") is not None
    ]

    payload = {
        "user_id": user_id,
        "region": keep("region", data.get("region")),
        "age": keep("age", data.get("age")),
        "employment": keep("employment", data.get("employment")),
        "marital_status": keep("marital_status", data.get("marital_status")),
        "income": keep("income", data.get("income")),
        "children_count": children_count,
        "children_ages": json.dumps(children_ages, ensure_ascii=False),
        "children": json.dumps(children, ensure_ascii=False),
        "statuses": json.dumps(data.get("statuses", current.get("statuses") or []), ensure_ascii=False),
        "scenario_id": keep("scenario_id", data.get("scenario_id")),
        "scenario_specific": json.dumps(
            data.get("scenario_specific", current.get("scenario_specific") or {}),
            ensure_ascii=False,
        ),
        "full_name": keep("full_name", data.get("full_name")),
        "phone": keep("phone", data.get("phone")),
        "about": keep("about", data.get("about")),
        "gender": keep("gender", data.get("gender")),
        "updated_at": now_iso(),
    }

    conn.execute(
        """
        INSERT INTO profiles (
            user_id, region, age, employment, marital_status, income,
            children_count, children_ages, children, statuses, scenario_id,
            scenario_specific, full_name, phone, about, gender, updated_at
        )
        VALUES (
            :user_id, :region, :age, :employment, :marital_status, :income,
            :children_count, :children_ages, :children, :statuses, :scenario_id,
            :scenario_specific, :full_name, :phone, :about, :gender, :updated_at
        )
        ON CONFLICT(user_id) DO UPDATE SET
            region = excluded.region,
            age = excluded.age,
            employment = excluded.employment,
            marital_status = excluded.marital_status,
            income = excluded.income,
            children_count = excluded.children_count,
            children_ages = excluded.children_ages,
            children = excluded.children,
            statuses = excluded.statuses,
            scenario_id = excluded.scenario_id,
            scenario_specific = excluded.scenario_specific,
            full_name = excluded.full_name,
            phone = excluded.phone,
            about = excluded.about,
            gender = excluded.gender,
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
    result["children"] = json.loads(result.get("children") or "[]")
    result["scenario_specific"] = json.loads(result.get("scenario_specific") or "{}")

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

    # Нормализуем формат: обрезаем миллисекунды, приводим к виду now_iso()
    normalized = remind_at.replace("Z", "").split(".")[0] + "Z"

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
        (user_id, task_id, normalized),
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


def upsert_profile_meta(
    user_id: str,
    full_name: str | None = None,
    phone: str | None = None,
    region: str | None = None,
    about: str | None = None,
):
    existing = get_profile(user_id) or {}
    merged = dict(existing)
    if full_name is not None:
        merged["full_name"] = full_name
    if phone is not None:
        merged["phone"] = phone
    if region is not None:
        merged["region"] = region
    if about is not None:
        merged["about"] = about
    merged["user_id"] = user_id
    upsert_profile(user_id, merged)


def get_profile_meta(user_id: str) -> dict | None:
    profile = get_profile(user_id)
    if not profile:
        return None
    return {
        "user_id": profile["user_id"],
        "full_name": profile.get("full_name"),
        "phone": profile.get("phone"),
        "region": profile.get("region"),
        "about": profile.get("about"),
        "updated_at": profile.get("updated_at"),
    }


def delete_reminder(reminder_id: int, user_id: str) -> bool:
    conn = get_conn()
    cur = conn.execute(
        "DELETE FROM reminders WHERE id = ? AND user_id = ?",
        (reminder_id, user_id),
    )
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


def add_feedback(measure_id: str, vote: int, user_id: str | None = None):
    """Сохраняет голос пользователя (vote = 1 или -1)."""
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO benefit_feedback (measure_id, user_id, vote, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (measure_id, user_id, vote, now_iso()),
    )
    conn.commit()
    conn.close()


def get_feedback_stats(measure_id: str) -> dict:
    """Возвращает количество 👍 и 👎 для меры."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT vote, COUNT(*) as cnt
        FROM benefit_feedback
        WHERE measure_id = ?
        GROUP BY vote
        """,
        (measure_id,),
    ).fetchall()
    conn.close()

    up = 0
    down = 0
    for row in rows:
        if row["vote"] == 1:
            up = row["cnt"]
        elif row["vote"] == -1:
            down = row["cnt"]

    return {"up": up, "down": down}
