"""
Скрипт наполнения БД демо-данными.

Запуск:
    docker compose exec nirvana-max python seed.py

Создаёт 3 демо-профиля с задачами, напоминаниями и историей,
чтобы жюри сразу видело работающий продукт.
"""
import json
from datetime import datetime, timezone, timedelta

from storage import (
    init_db,
    upsert_profile,
    create_task,
    create_reminder,
    add_history,
    get_conn,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def future_iso(days: int = 1) -> str:
    return (
        datetime.now(timezone.utc) + timedelta(days=days)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")


DEMO_PROFILES = [
    {
        "user_id": "demo_family",
        "profile": {
            "region": "Ставропольский край",
            "age": 32,
            "employment": "работаю",
            "marital_status": "женат/замужем",
            "income": 22000,
            "children": [
                {"name": "Маша", "age": 4},
                {"name": "Петя", "age": 7},
            ],
            "statuses": [],
            "scenario_id": "family",
            "full_name": "Анна Петрова",
            "phone": "+79991234567",
            "about": "Мама двоих детей, работаю. Хочу проверить, какие выплаты положены.",
        },
        "tasks": [
            {
                "title": "Оформить: Единое пособие",
                "description": "Через Госуслуги, СФР или МФЦ. Проверить доход и документы.",
                "scenario_id": "family",
                "measure_id": "family_unified_allowance",
                "priority": 1,
            },
            {
                "title": "Оформить: Ежемесячная выплата из маткапитала",
                "description": "Проверить остаток маткапитала и подать заявление через СФР.",
                "scenario_id": "family",
                "measure_id": "family_maternity_capital_monthly",
                "priority": 2,
            },
        ],
        "reminders": [
            {"days_ahead": 1, "task_index": 0},
        ],
        "history": [
            ("profile_updated", {"scenario_id": "family"}),
            ("recommendations_requested", {"scenario_id": "family", "count": 4}),
        ],
    },
    {
        "user_id": "demo_large",
        "profile": {
            "region": "Москва",
            "age": 41,
            "employment": "работаю",
            "marital_status": "женат/замужем",
            "income": 35000,
            "children": [
                {"name": "Иван", "age": 12},
                {"name": "Катя", "age": 8},
                {"name": "Миша", "age": 3},
            ],
            "statuses": [],
            "scenario_id": "family",
            "full_name": "Сергей Иванов",
            "phone": "+79997654321",
            "about": "Многодетный отец, ищу все доступные льготы для семьи.",
        },
        "tasks": [
            {
                "title": "Оформить: Региональный материнский капитал",
                "description": "Через органы соцзащиты Москвы. Проверить документы.",
                "scenario_id": "family",
                "measure_id": "family_regional_maternity_capital",
                "priority": 1,
            },
            {
                "title": "Оформить: Компенсация ЖКХ многодетным",
                "description": "Через МФЦ. Скидка от 30% на коммунальные услуги.",
                "scenario_id": "family",
                "measure_id": "family_large_utility_compensation",
                "priority": 2,
            },
        ],
        "reminders": [
            {"days_ahead": 3, "task_index": 0},
        ],
        "history": [
            ("profile_updated", {"scenario_id": "family"}),
            ("recommendations_requested", {"scenario_id": "family", "count": 6}),
        ],
    },
    {
        "user_id": "demo_relocation",
        "profile": {
            "region": "Краснодарский край",
            "age": 28,
            "employment": "работаю",
            "marital_status": "не женат/не замужем",
            "income": 45000,
            "children": [],
            "statuses": [],
            "scenario_id": "relocation",
            "full_name": "Мария Сидорова",
            "phone": "+79995554433",
            "about": "Переехала в Краснодар. Нужно оформить документы и прикрепиться к поликлинике.",
        },
        "tasks": [
            {
                "title": "Прикрепление к поликлинике",
                "description": "Через Госуслуги или напрямую в поликлинику по новому месту жительства.",
                "scenario_id": "relocation",
                "measure_id": "relocation_medical_card",
                "priority": 1,
            },
            {
                "title": "Полис ОМС по новому региону",
                "description": "Переоформление полиса через страховую компанию.",
                "scenario_id": "relocation",
                "measure_id": "relocation_oms",
                "priority": 2,
            },
        ],
        "reminders": [
            {"days_ahead": 2, "task_index": 0},
        ],
        "history": [
            ("profile_updated", {"scenario_id": "relocation"}),
            ("recommendations_requested", {"scenario_id": "relocation", "count": 3}),
        ],
    },
]


def clear_demo_data():
    """Удаляет старые демо-данные, чтобы seed был идемпотентным."""
    conn = get_conn()
    for user_id in ["demo_family", "demo_large", "demo_relocation"]:
        conn.execute("DELETE FROM profiles WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM tasks WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM reminders WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM history WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM checklist_state WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    print("🧹 Старые демо-данные удалены")


def seed():
    init_db()
    clear_demo_data()

    print("🌱 Начинаю заполнение демо-данными...")

    for demo in DEMO_PROFILES:
        user_id = demo["user_id"]
        print(f"\n👤 {user_id}: {demo['profile']['full_name']}")

        # Профиль
        upsert_profile(user_id, demo["profile"])
        print(f"   ✓ профиль")

        # Задачи
        task_ids = []
        for t in demo["tasks"]:
            task_id = create_task(
                user_id=user_id,
                title=t["title"],
                description=t.get("description", ""),
                scenario_id=t.get("scenario_id"),
                measure_id=t.get("measure_id"),
                priority=t.get("priority", 3),
            )
            task_ids.append(task_id)
            print(f"   ✓ задача #{task_id}: {t['title'][:50]}")

        # Напоминания
        for r in demo["reminders"]:
            task_idx = r.get("task_index")
            task_id = task_ids[task_idx] if task_idx is not None and task_idx < len(task_ids) else None
            create_reminder(
                user_id=user_id,
                remind_at=future_iso(r["days_ahead"]),
                task_id=task_id,
            )
            print(f"   ✓ напоминание через {r['days_ahead']} дн.")

        # История
        for event_type, payload in demo["history"]:
            add_history(user_id, event_type, payload)
        print(f"   ✓ история: {len(demo['history'])} событий")

    print("\n✅ Готово! Демо-данные загружены.")
    print("\nДемо-профили:")
    for d in DEMO_PROFILES:
        print(f"  • {d['user_id']} — {d['profile']['full_name']}")


if __name__ == "__main__":
    seed()
