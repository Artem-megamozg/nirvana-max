import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

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
    age: int | float | str | None = None

    @field_validator("age", mode="before")
    @classmethod
    def _normalize_age(cls, v):
        if v is None or v == "":
            return None
        try:
            # Приводим к целому числу
            return int(float(v))
        except (ValueError, TypeError):
            return None


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
    buttons: list | None = None,
):
    """
    Отправляет сообщение пользователю в MAX.

    Параметры:
    - include_app_button=True: добавить кнопку «Открыть Nirvana» (open_app)
    - buttons=[[{type, text, payload}], ...]: произвольные inline-кнопки

    Важно: кнопка open_app НЕ принимает поле webApp — URL мини-приложения
    привязывается к боту в кабинете MAX for Developers, а не в кнопке.
    """
    if not MAX_TOKEN:
        print("MAX_TOKEN is not configured")
        return

    payload: dict = {"text": text}

    final_buttons = []

    if buttons:
        # Кнопки, переданные явно (callback, link и т.п.)
        final_buttons = buttons

    if include_app_button:
        final_buttons = final_buttons + [
            [
                {
                    "type": "open_app",
                    "text": "Открыть Nirvana",
                    "web_app": MAX_BOT_USERNAME,
                }
            ]
        ]

    if final_buttons:
        payload["attachments"] = [
            {
                "type": "inline_keyboard",
                "payload": {"buttons": final_buttons},
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global reminder_worker_task

    init_db()
    reload_catalog()

    reminder_worker_task = asyncio.create_task(reminder_loop())

    # Регистрируем команды в меню MAX
    asyncio.create_task(register_bot_commands())

    # Запускаем еженедельный дайджест (временно отключено)
    # digest_task = asyncio.create_task(weekly_digest_loop())

    yield

    if reminder_worker_task:
        reminder_worker_task.cancel()
        try:
            await reminder_worker_task
        except asyncio.CancelledError:
            pass

    # digest_task отключён
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

@app.post("/api/_debug")
async def debug_endpoint(data: dict):
    print("=== MINI-APP DEBUG ===")
    print(data)
    print("=======================")
    return {"ok": True}


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


# ---------- Ответы на команды ----------

def build_help_reply() -> str:
    return (
        "🤖 Что умеет Nirvana\n\n"
        "Я помогаю разобраться, какие меры поддержки вам положены, "
        "и не потерять следующий шаг.\n\n"
        "В мини-приложении:\n"
        "• профиль с вашими данными\n"
        "• подбор мер под вашу ситуацию\n"
        "• чек-лист документов по каждой мере\n"
        "• маршрут с задачами и напоминаниями\n\n"
        "Команды в боте:\n"
        "/start — начать работу\n"
        "/help — эта справка\n"
        "/scenario — быстрый выбор ситуации\n"
        "/status — мои задачи и напоминания\n\n"
        "Откройте приложение, чтобы продолжить →"
    )


def build_status_reply(user_id: str) -> str:
    profile = get_profile(user_id)
    if not profile:
        return (
            "Пока не вижу ваш профиль.\n\n"
            "Откройте приложение и заполните данные — "
            "тогда я смогу показать ваш маршрут."
        )

    tasks = get_tasks(user_id) or []
    pending = [t for t in tasks if t.get("status") != "completed"]

    reminders = get_reminders(user_id) or []
    active_reminders = [r for r in reminders if r.get("active")]

    lines = ["📊 Ваш статус", ""]

    if pending:
        lines.append(f"📋 Активных задач: {len(pending)}")
        for t in pending[:3]:
            lines.append(f"   • {t.get('title', '—')}")
        if len(pending) > 3:
            lines.append(f"   … и ещё {len(pending) - 3}")
    else:
        lines.append("📋 Активных задач нет")

    lines.append("")

    if active_reminders:
        lines.append(f"⏰ Активных напоминаний: {len(active_reminders)}")
        next_reminder = active_reminders[0]
        remind_at = next_reminder.get("remind_at", "")
        lines.append(f"   ближайшее: {remind_at}")
    else:
        lines.append("⏰ Активных напоминаний нет")

    lines.append("")
    lines.append("Откройте приложение для подробностей →")

    return "\n".join(lines)


# ---------- Регистрация команд в MAX ----------

async def register_bot_commands():
    """Регистрирует команды бота в меню MAX (один раз при старте)."""
    if not MAX_TOKEN:
        return
    commands = [
        {"name": "start", "description": "Начать работу с Nirvana"},
        {"name": "help", "description": "Что умеет бот и приложение"},
        {"name": "scenario", "description": "Выбрать жизненную ситуацию"},
        {"name": "status", "description": "Мои задачи и напоминания"},
    ]
    try:
        async with httpx.AsyncClient(
            timeout=15,
            verify=CA_BUNDLE if CA_BUNDLE else True,
        ) as client:
            r = await client.patch(
                f"{MAX_API}/me/commands",
                headers={
                    "Authorization": MAX_TOKEN,
                    "Content-Type": "application/json",
                },
                json={"commands": commands},
            )
            print("REGISTER COMMANDS:", r.status_code, r.text[:200])
    except Exception as e:
        print("REGISTER COMMANDS ERROR:", repr(e))


# ---------- Проактивные ответы ----------

def build_start_reply(user_id: str) -> str:
    """
    Возвращает текст для ответа на /start.
    Если профиль есть — персонализированное приветствие,
    если нет — стандартное.
    """
    profile = get_profile(user_id)

    if not profile:
        return (
            "Привет! 👋\n\n"
            "Я помогу разобраться, какие меры поддержки вам положены, "
            "что подготовить и какой следующий шаг.\n\n"
            "Начнём с короткого профиля."
        )

    tasks = get_tasks(user_id) or []
    pending = [t for t in tasks if t.get("status") != "completed"]

    reminders = get_reminders(user_id) or []
    active_reminders = [r for r in reminders if r.get("active")]

    full_name = profile.get("full_name") or ""
    first_name = full_name.split()[0] if full_name else ""

    lines = []
    if first_name:
        lines.append(f"С возвращением, {first_name}! 👋")
    else:
        lines.append("С возвращением! 👋")

    lines.append("")

    if pending:
        word = "задача" if len(pending) == 1 else "задач"
        lines.append(f"📋 У вас {len(pending)} активных {word} в маршруте.")

    if active_reminders:
        word = "напоминание" if len(active_reminders) == 1 else "напоминания"
        lines.append(f"⏰ Активных {word}: {len(active_reminders)}.")

    if not pending and not active_reminders:
        lines.append("Активных задач и напоминаний нет. Готовы построить новый маршрут?")
    else:
        lines.append("Продолжим?")

    return "\n".join(lines)


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
                reply = build_start_reply(str(user_id))
                await send_message(
                    str(user_id),
                    reply,
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
                if text in {"/start", "начать", "nirvana", "start"}:
                    reply = build_start_reply(str(user_id))
                    await send_message(
                        str(user_id),
                        reply,
                        include_app_button=True,
                    )
                elif text in {"/help", "help", "помощь"}:
                    reply = build_help_reply()
                    await send_message(
                        str(user_id),
                        reply,
                        include_app_button=True,
                    )
                elif text in {"/status", "status", "статус", "мой статус"}:
                    reply = build_status_reply(str(user_id))
                    await send_message(
                        str(user_id),
                        reply,
                        include_app_button=True,
                    )
                elif text in {"/scenario", "scenario", "сценарий"}:
                    await send_message(
                        str(user_id),
                        (
                            "Какая у вас ситуация?\n\n"
                            "Выберите — подскажу, какой сценарий открыть:"
                        ),
                        include_app_button=False,
                        buttons=[
                            [
                                {"type": "callback", "text": "👨‍👩‍👧 Семья и дети", "payload": "scenario_family"},
                            ],
                            [
                                {"type": "callback", "text": "🏠 Переезд", "payload": "scenario_relocation"},
                            ],
                            [
                                {"type": "callback", "text": "⚕️ Медицинский маршрут", "payload": "scenario_medical"},
                            ],
                            [
                                {"type": "callback", "text": "Открыть приложение", "payload": "open_app"},
                            ],
                        ],
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
        callback = update.get("callback") or {}
        user = callback.get("user") or {}
        user_id = user.get("user_id")
        payload = callback.get("payload") or ""

        if user_id:
            try:
                if payload == "scenario_family":
                    await send_message(
                        str(user_id),
                        (
                            "👨‍👩‍👧 Сценарий «Семья и дети»\n\n"
                            "Открою приложение сразу на этом сценарии — "
                            "заполните данные, и я подберу меры, которые "
                            "положены вашей семье."
                        ),
                        buttons=[
                            [
                                {
                                    "type": "open_app",
                                    "text": "Открыть сценарий",
                                    "web_app": f"{MAX_BOT_USERNAME}?startapp=family",
                                }
                            ]
                        ],
                    )
                elif payload == "scenario_relocation":
                    await send_message(
                        str(user_id),
                        (
                            "🏠 Сценарий «Переезд»\n\n"
                            "Открою приложение сразу на этом сценарии — "
                            "выберите его, чтобы получить маршрут после переезда."
                        ),
                        buttons=[
                            [
                                {
                                    "type": "open_app",
                                    "text": "Открыть сценарий",
                                    "web_app": f"{MAX_BOT_USERNAME}?startapp=relocation",
                                }
                            ]
                        ],
                    )
                elif payload == "scenario_medical":
                    await send_message(
                        str(user_id),
                        (
                            "⚕️ Сценарий «Медицинский маршрут»\n\n"
                            "Открою приложение сразу на этом сценарии. "
                            "Здесь мы строим только административный маршрут: "
                            "куда обратиться и что подготовить. Не заменяем врача."
                        ),
                        buttons=[
                            [
                                {
                                    "type": "open_app",
                                    "text": "Открыть сценарий",
                                    "web_app": f"{MAX_BOT_USERNAME}?startapp=medical",
                                }
                            ]
                        ],
                    )
                else:
                    await send_message(
                        str(user_id),
                        "Откройте Nirvana, чтобы продолжить.",
                        include_app_button=True,
                    )
            except Exception as error:
                print("SEND ERROR (message_callback):", repr(error))

    return {"ok": True}
