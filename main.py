import os
import ssl
import truststore
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles

load_dotenv()

MAX_TOKEN = os.getenv("MAX_TOKEN")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
MAX_API = "https://platform-api2.max.ru"

ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

app = FastAPI(title="Nirvana MAX")

app.mount("/app", StaticFiles(directory="web", html=True), name="app")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhook")
async def webhook(
    update: dict,
    x_max_bot_api_secret: str | None = Header(default=None),
):
    if x_max_bot_api_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid secret")

    update_type = update.get("update_type")

    if update_type == "bot_started":
        user = update.get("user") or {}
        user_id = user.get("user_id")
        if user_id:
            await send_message(
                user_id,
                "Привет!\n\n"
                "Бот Nirvana MAX работает.\n\n"
                "Открой мини-приложение через кнопку в MAX."
            )

    elif update_type == "message_created":
        message = update.get("message") or {}
        sender = message.get("sender") or {}
        if sender.get("is_bot"):
            return {"ok": True}
        user_id = sender.get("user_id")
        body = message.get("body") or {}
        text = body.get("text") or ""

        if user_id:
            if text.strip() == "/start":
                await send_message(
                    user_id,
                    "Привет!\n\n"
                    "Nirvana MAX запущен.\n\n"
                    "Открой мини-приложение через кнопку в MAX."
                )
            else:
                await send_message(user_id, f"Получил сообщение:\n{text}")

    return {"ok": True}


async def send_message(user_id: int, text: str):
    async with httpx.AsyncClient(timeout=15, verify=ssl_context) as client:
        response = await client.post(
            f"{MAX_API}/messages",
            params={"user_id": user_id},
            headers={
                "Authorization": MAX_TOKEN,
                "Content-Type": "application/json",
            },
            json={"text": text},
        )
        if response.status_code >= 400:
            print("MAX API ERROR:", response.status_code, response.text)
        response.raise_for_status()
