import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from rules import (
    build_recommendations,
    get_measure,
    get_scenario,
    get_scenarios,
    reload_catalog,
)
from storage import (
    add_history,
    complete_task,
    create_reminder,
    create_task,
    delete_reminder,
    get_checklist_state,
    get_due_reminders,
    get_history,
    get_profile,
    get_profile_meta,
    get_reminders,
    get_tasks,
    init_db,
    mark_reminder_sent,
    upsert_checklist,
    upsert_profile,
    upsert_profile_meta,
)

load_dotenv()

MAX_TOKEN = os.getenv("MAX_TOKEN")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
MAX_WEBAPP_URL = os.getenv(
    "MAX_WEBAPP_URL",
    "https://litvinskiy-developer.online/app/",
)
MAX_BOT_USERNAME = os.getenv("MAX_BOT_USERNAME", "t687_hakaton_max_bot")
MAX_API = "https://platform-api2.max.ru"

# Системный CA-бандл. В Dockerfile сертификаты Минцифры уже
# добавлены в /etc/ssl/certs через update-ca-certificates,
# поэтому системный бандл доверяет platform-api2.max.ru.
import os as _os
CA_BUNDLE = _os.environ.get(
    "SSL_CERT_FILE",
    "/etc/ssl/certs/ca-certificates.crt",
)
if not Path(CA_BUNDLE).exists():
    print(f"⚠️  CA-бандл не найден: {CA_BUNDLE}")
    CA_BUNDLE = None

reminder_worker_task = None


# ---------- Pydantic-модели ----------

class Child(BaseModel):
    name: str = ""
    age: int | None = None


class ProfileRequest(BaseModel):
    user_id: str
    region: str | None = None
    age: int | None = None
    employment: str | None = None
    marital_status: str | None = None
    income: float | None = None
    children_count: int = 0
    children_ages: list[int | str] = Field(default_factory=list)
    children: list[Child] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    scenario_id: str | None = None
    scenario_specific: dict = Field(default_factory=dict)
    full_name: str | None = None
    phone: str | None = None
    about: str | None = None


class RecommendationRequest(BaseModel):
    user_id: str | None = None
    category: str | None = None
    region: str | None = None
    income_below_pm: bool | None = None
    children_count: int | None = None
    scenario_id: str | None = None


class ChecklistRequest(BaseModel):
    user_id: str
    completed: bool


class TaskRequest(BaseModel):
    user_id: str
    title: str
    description: str = ""
    scenario_id: str | None = None
    measure_id: str | None = None
    due_date: str | None = None
    priority: int = 3


class ReminderRequest(BaseModel):
    user_id: str
    remind_at: str
    task_id: int | None = None


class CompleteTaskRequest(BaseModel):
    user_id: str


class ExplainRequest(BaseModel):
    user_id: str
    measure_id: str


class ProfileMetaRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    region: str | None = None
    about: str | None = None


# ---------- Отправка сообщений в MAX ----------

async def send_message(
    user_id: str,
    text: str,
    include_app_button: bool = False,
    app_url: str | None = None,
):
    """
    Отправляет сообщение пользователю в MAX.

    Важно: кнопка open_app НЕ принимает поле webApp — URL мини-приложения
    привязывается к боту в кабинете MAX for Developers, а не в кнопке.
    """
    if not MAX_TOKEN:
        print("MAX_TOKEN is not configured")
        return

    payload: dict = {"text": text}

    if include_app_button:
        payload["attachments"] = [
            {
                "type": "inline_keyboard",
                "payload": {
                    "buttons": [
                        [
                            {
                                "type": "open_app",
                                "text": "Открыть Nirvana",
                                "web_app": MAX_BOT_USERNAME,
                            }
                        ]
                    ]
                },
            }
        ]

    client_kwargs = {"timeout": 20}
    if CA_BUNDLE:
        client_kwargs["verify"] = CA_BUNDLE

    async with httpx.AsyncClient(**client_kwargs) as client:
        response = await client.post(
            f"{MAX_API}/messages",
            params={"user_id": user_id},
            headers={
                "Authorization": MAX_TOKEN,
                "Content-Type": "application/json",
            },
            json=payload,
        )

        if response.status_code >= 400:
            print("MAX API ERROR:", response.status_code, response.text)

        response.raise_for_status()


# ---------- Воркер напоминаний ----------

async def reminder_loop():
    print("REMINDER WORKER: старт")
    counter = 0
    while True:
        counter += 1
        due = []
        try:
            due = get_due_reminders()

            if due:
                print(f"REMINDER WORKER: нашёл {len(due)} к отправке")

            for reminder in due:
                print(f"REMINDER WORKER: отправляю id={reminder['id']} user={reminder['user_id']}")

                task_id = reminder.get("task_id")

                if task_id:
                    task_text = (
                        "⏰ Напоминание\n\n"
                        "Вы запланировали продолжить свой маршрут.\n\n"
                        "Откройте Nirvana и продолжите с нужного шага."
                    )
                else:
                    task_text = (
                        "⏰ Напоминание\n\n"
                        "Вы запланировали продолжить работу в Nirvana."
                    )

                try:
                    await send_message(
                        reminder["user_id"],
                        task_text,
                        include_app_button=True,
                    )
                    mark_reminder_sent(reminder["id"])
                    print(f"REMINDER WORKER: отправлено id={reminder['id']}")
                except Exception as error:
                    print("REMINDER SEND ERROR:", repr(error))

            if counter % 10 == 0:
                print(f"REMINDER WORKER: жив, итерация {counter}, due={len(due)}")

        except Exception as error:
            print("REMINDER WORKER ERROR:", repr(error))

        await asyncio.sleep(30)


async def lifespan(app: FastAPI):
    global reminder_worker_task

    init_db()
    reload_catalog()

    reminder_worker_task = asyncio.create_task(reminder_loop())

    yield

    if reminder_worker_task:
        reminder_worker_task.cancel()

        try:
            await reminder_worker_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Nirvana MAX",
    version="2.0.0",
    lifespan=lifespan,
)

app.mount(
    "/app",
    StaticFiles(directory="web", html=True),
    name="app",
)


# ---------- Сервисные роуты ----------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "nirvana-max",
        "version": "2.0.0",
    }


@app.get("/api/scenarios")
async def scenarios():
    return {"items": get_scenarios()}


# ---------- Профиль ----------

@app.get("/api/profile")
async def profile(user_id: str = Query(...)):
    result = get_profile(user_id)

    if result is None:
        return {"exists": False, "profile": None}

    return {"exists": True, "profile": result}


@app.post("/api/profile")
async def save_profile(data: ProfileRequest):
    payload = data.model_dump()

    upsert_profile(data.user_id, payload)

    add_history(
        data.user_id,
        "profile_updated",
        {"scenario_id": data.scenario_id},
    )

    return {
        "ok": True,
        "profile": get_profile(data.user_id),
    }


# ---------- Рекомендации ----------

@app.get("/api/profile/{user_id}/meta")
async def profile_meta(user_id: str):
    meta = get_profile_meta(user_id)
    if meta is None:
        return {"exists": False, "meta": None}
    return {"exists": True, "meta": meta}


@app.post("/api/profile/{user_id}/meta")
async def save_profile_meta(user_id: str, data: ProfileMetaRequest):
    upsert_profile_meta(
        user_id,
        full_name=data.full_name,
        phone=data.phone,
        region=data.region,
        about=data.about,
    )
    return {"ok": True, "meta": get_profile_meta(user_id)}


@app.post("/api/recommendations")
async def recommendations(data: RecommendationRequest):
    profile = None

    if data.user_id:
        profile = get_profile(data.user_id)

    if profile is None:
        profile = {
            "region": data.region,
            "income_below_pm": bool(data.income_below_pm),
            "children_count": data.children_count or 0,
        }

    scenario_id = data.scenario_id

    if scenario_id is None and data.category:
        category_map = {
            "семьи с детьми": "family",
            "семья": "family",
            "переезд": "relocation",
            "медицина": "medical",
        }

        scenario_id = category_map.get(data.category.lower())

    items = build_recommendations(
        profile=profile,
        scenario_id=scenario_id,
    )

    if data.user_id:
        add_history(
            data.user_id,
            "recommendations_requested",
            {
                "scenario_id": scenario_id,
                "count": len(items),
            },
        )

    return {
        "benefits": items,
        "source": "model_data",
        "scenario_id": scenario_id,
        "count": len(items),
    }


# ---------- Меры и чек-листы ----------

@app.get("/api/measures/{measure_id}")
async def measure(measure_id: str, user_id: str | None = None):
    item = get_measure(measure_id)

    if item is None:
        raise HTTPException(status_code=404, detail="Measure not found")

    result = dict(item)

    if user_id:
        state = get_checklist_state(user_id, measure_id)
    else:
        state = {}

    checklist = []

    default_items = [
        {
            "id": f"{measure_id}_passport",
            "title": "Паспорт / основной документ",
            "required": True,
        },
        {
            "id": f"{measure_id}_children",
            "title": "Документы на детей",
            "required": item.get("scenario") == "family",
        },
        {
            "id": f"{measure_id}_income",
            "title": "Подтверждение дохода при необходимости",
            "required": "доход" in " ".join(item.get("conditions", [])).lower(),
        },
    ]

    for checklist_item in default_items:
        checklist.append(
            {
                **checklist_item,
                "completed": state.get(checklist_item["id"], False),
            }
        )

    result["checklist"] = checklist

    return result


@app.get("/api/checklist/{measure_id}")
async def checklist(measure_id: str, user_id: str = Query(...)):
    item = get_measure(measure_id)

    if item is None:
        raise HTTPException(status_code=404, detail="Measure not found")

    state = get_checklist_state(user_id, measure_id)

    items = [
        {
            "id": f"{measure_id}_passport",
            "title": "Паспорт / основной документ",
            "required": True,
        },
        {
            "id": f"{measure_id}_children",
            "title": "Документы на детей",
            "required": item.get("scenario") == "family",
        },
        {
            "id": f"{measure_id}_income",
            "title": "Подтверждение дохода при необходимости",
            "required": "доход" in " ".join(item.get("conditions", [])).lower(),
        },
    ]

    for item_data in items:
        item_data["completed"] = state.get(item_data["id"], False)

    return {
        "measure_id": measure_id,
        "items": items,
    }


@app.post("/api/checklist/{measure_id}/{item_id}")
async def checklist_update(
    measure_id: str,
    item_id: str,
    data: ChecklistRequest,
):
    upsert_checklist(
        data.user_id,
        measure_id,
        item_id,
        data.completed,
    )

    return {
        "ok": True,
        "measure_id": measure_id,
        "item_id": item_id,
        "completed": data.completed,
    }


# ---------- Задачи ----------

@app.post("/api/tasks")
async def create_task_api(data: TaskRequest):
    task_id = create_task(
        user_id=data.user_id,
        title=data.title,
        description=data.description,
        scenario_id=data.scenario_id,
        measure_id=data.measure_id,
        due_date=data.due_date,
        priority=data.priority,
        deep_link=MAX_WEBAPP_URL,
    )

    add_history(
        data.user_id,
        "task_created",
        {"task_id": task_id},
    )

    return {"ok": True, "task_id": task_id}


@app.get("/api/tasks")
async def tasks(user_id: str = Query(...)):
    return {"items": get_tasks(user_id)}


@app.post("/api/tasks/{task_id}/complete")
async def task_complete(task_id: int, data: CompleteTaskRequest):
    complete_task(task_id, data.user_id)

    add_history(
        data.user_id,
        "task_completed",
        {"task_id": task_id},
    )

    return {
        "ok": True,
        "task_id": task_id,
        "status": "completed",
    }


# ---------- Напоминания ----------

@app.post("/api/reminders")
async def reminder(data: ReminderRequest):
    try:
        datetime.fromisoformat(data.remind_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="remind_at must be ISO-8601",
        )

    reminder_id = create_reminder(
        user_id=data.user_id,
        remind_at=data.remind_at,
        task_id=data.task_id,
    )

    add_history(
        data.user_id,
        "reminder_created",
        {
            "reminder_id": reminder_id,
            "task_id": data.task_id,
        },
    )

    return {"ok": True, "reminder_id": reminder_id}


@app.get("/api/reminders")
async def reminders(user_id: str = Query(...)):
    return {"items": get_reminders(user_id)}


@app.delete("/api/reminders/{reminder_id}")
async def reminder_delete(reminder_id: int, user_id: str = Query(...)):
    deleted = delete_reminder(reminder_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"ok": True, "id": reminder_id}


# ---------- История и дашборд ----------

@app.get("/api/history")
async def history(user_id: str = Query(...)):
    return {"items": get_history(user_id)}


@app.get("/api/dashboard")
async def dashboard(user_id: str = Query(...)):
    profile = get_profile(user_id)

    recommendations_data = []

    if profile:
        recommendations_data = build_recommendations(
            profile,
            profile.get("scenario_id"),
        )

    return {
        "profile": profile,
        "recommendations": recommendations_data,
        "tasks": get_tasks(user_id),
        "reminders": get_reminders(user_id),
        "history": get_history(user_id),
    }


# ---------- Объяснение меры ----------

@app.post("/api/explain")
async def explain(data: ExplainRequest):
    item = get_measure(data.measure_id)

    if item is None:
        raise HTTPException(status_code=404, detail="Measure not found")

    profile = get_profile(data.user_id)

    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    recommendations = build_recommendations(
        profile,
        item.get("scenario"),
    )

    target = next(
        (c for c in recommendations if c["id"] == item["id"]),
        None,
    )

    if target is None:
        explanation = (
            "По текущим данным мера поддержки "
            "не попала в персональную выдачу."
        )
    else:
        reasons = target["match"]["reasons"]

        if reasons:
            reason_text = ", ".join(reasons)
            explanation = (
                f"Мера подходит вам, потому что {reason_text.lower()}."
            )
        else:
            explanation = (
                "Мера находится в вашем маршруте, "
                "но для точной проверки нужны дополнительные данные."
            )

    return {"text": explanation, "source": "rules_engine"}


# ---------- Вебхук MAX ----------

@app.post("/webhook")
async def webhook(
    request: Request,
    x_max_bot_api_secret: str | None = Header(default=None),
):
    update = await request.json()

    # Проверка секрета (если задан)
    if WEBHOOK_SECRET and x_max_bot_api_secret != WEBHOOK_SECRET:
        print("WEBHOOK: invalid secret, header =", x_max_bot_api_secret)
        raise HTTPException(status_code=403, detail="Invalid secret")

    update_type = update.get("update_type")
    print("WEBHOOK: update_type =", update_type)

    if update_type == "bot_started":
        user = update.get("user") or {}
        user_id = user.get("user_id")

        if user_id:
            add_history(str(user_id), "bot_started")

            try:
                await send_message(
                    str(user_id),
                    (
                        "Привет! 👋\n\n"
                        "Я помогу разобраться, какая поддержка "
                        "доступна именно в вашей ситуации, "
                        "что подготовить и какой следующий шаг.\n\n"
                        "Начнём с короткой персональной проверки."
                    ),
                    include_app_button=True,
                )
            except Exception as error:
                print("SEND ERROR (bot_started):", repr(error))

    elif update_type == "message_created":
        message = update.get("message") or {}
        sender = message.get("sender") or {}

        if sender.get("is_bot"):
            return {"ok": True}

        user_id = sender.get("user_id")
        body = message.get("body") or {}
        text = (body.get("text") or "").strip().lower()

        if user_id:
            try:
                if text in {"/start", "начать", "помощь", "nirvana"}:
                    await send_message(
                        str(user_id),
                        (
                            "Откройте Nirvana — "
                            "там можно пройти персональную проверку."
                        ),
                        include_app_button=True,
                    )
                elif text in {
                    "профиль",
                    "мой профиль",
                    "маршрут",
                    "мой маршрут",
                    "напоминания",
                }:
                    await send_message(
                        str(user_id),
                        "Откройте Nirvana, чтобы продолжить.",
                        include_app_button=True,
                    )
                else:
                    await send_message(
                        str(user_id),
                        (
                            "Я работаю через персональный маршрут.\n\n"
                            "Откройте приложение — "
                            "там можно заполнить профиль и получить "
                            "персональный результат."
                        ),
                        include_app_button=True,
                    )
            except Exception as error:
                print("SEND ERROR (message_created):", repr(error))

    elif update_type == "message_callback":
        # На всякий случай — обработаем callback-кнопки, если они появятся
        callback = update.get("callback") or {}
        user = callback.get("user") or {}
        user_id = user.get("user_id")

        if user_id:
            try:
                await send_message(
                    str(user_id),
                    "Откройте Nirvana, чтобы продолжить.",
                    include_app_button=True,
                )
            except Exception as error:
                print("SEND ERROR (message_callback):", repr(error))

    return {"ok": True}
