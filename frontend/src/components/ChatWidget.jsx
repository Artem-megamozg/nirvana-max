import { useEffect, useRef, useState } from 'react'

import { sendChat } from '../api'
import { Icon } from './Icon'

const GREETING =
  'Здравствуйте! Я помощник Nirvana. Расскажу, как пользоваться сервисом и какие меры поддержки в нём есть.'

const HINTS = [
  'Как собрать маршрут?',
  'Какие меры есть для семей?',
  'Как поставить напоминание?',
]

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading, open])

  async function send(text) {
    const content = text.trim()
    if (!content || loading) return

    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setDraft('')
    setError('')
    setLoading(true)

    try {
      const { answer } = await sendChat(next)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (err) {
      setError(err.message || 'Не удалось получить ответ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Чат с помощником">
          <header className="chat-head">
            <div>
              <strong>Помощник Nirvana</strong>
              <span>отвечает только по сервису</span>
            </div>
            <button
              type="button"
              className="chat-close"
              onClick={() => setOpen(false)}
              aria-label="Закрыть чат"
            >
              <Icon name="close" size={18} />
            </button>
          </header>

          <div className="chat-list" ref={listRef}>
            <div className="chat-msg bot">{GREETING}</div>

            {messages.length === 0 && (
              <div className="chat-hints">
                {HINTS.map((hint) => (
                  <button key={hint} type="button" onClick={() => send(hint)}>
                    {hint}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`chat-msg ${m.role === 'user' ? 'user' : 'bot'}`}
              >
                {m.content}
              </div>
            ))}

            {loading && <div className="chat-msg bot chat-typing">Печатает…</div>}
            {error && <div className="chat-error">{error}</div>}
          </div>

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ваш вопрос"
              maxLength={1000}
              aria-label="Ваш вопрос"
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              aria-label="Отправить"
            >
              <Icon name="send" size={18} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className={`chat-fab${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Закрыть помощника' : 'Открыть помощника'}
      >
        <Icon name={open ? 'close' : 'chat'} size={24} />
        <span>Помощь</span>
      </button>
    </>
  )
}
