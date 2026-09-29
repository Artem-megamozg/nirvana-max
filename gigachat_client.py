"""
Клиент GigaChat для переписывания текстов.

Использует сертификат Минцифры (уже в /etc/ssl/certs),
поэтому verify_ssl_certs=False безопасен — соединение
идёт к Sber напрямую.
"""
import os
from pathlib import Path

GIGACHAT_AUTH_KEY = os.getenv("GIGACHAT_AUTH_KEY")

try:
    from gigachat import GigaChat
    from gigachat.models import Chat, Messages, MessagesRole
    from gigachat.exceptions import GigaChatException
    HAS_GIGACHAT = True
except ImportError:
    HAS_GIGACHAT = False


def is_enabled() -> bool:
    return bool(GIGACHAT_AUTH_KEY) and HAS_GIGACHAT


async def rewrite_text(prompt: str, system_prompt: str = "") -> str | None:
    """Отправляет запрос в GigaChat и возвращает ответ или None."""
    if not is_enabled():
        return None

    try:
        # Формируем сообщения через объекты Chat/Messages
        messages = []
        if system_prompt:
            messages.append(
                Messages(role=MessagesRole.SYSTEM, content=system_prompt)
            )
        messages.append(
            Messages(role=MessagesRole.USER, content=prompt)
        )

        chat = Chat(messages=messages)

        client = GigaChat(
            credentials=GIGACHAT_AUTH_KEY,
            verify_ssl_certs=False,
            model="GigaChat-2-Pro",
            timeout=30,
        )

        response = client.chat(chat)
        return response.choices[0].message.content

    except GigaChatException as e:
        print(f"GIGACHAT ERROR: {e}")
        return None
    except Exception as e:
        print(f"GIGACHAT UNEXPECTED: {e}")
        return None
