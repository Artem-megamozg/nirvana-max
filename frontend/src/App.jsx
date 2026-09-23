// ============================================================
// App.jsx — корневой компонент мини-приложения Nirvana MAX
// ============================================================
// Каркас. Здесь веб-разработчик будет добавлять экраны,
// навигацию и логику под кейс «Забота о людях».
//
// ВАЖНО: alert(), confirm(), prompt() в webview MAX
// на iOS блокируются — вместо них используем React-состояние.
// ============================================================

import { useState, useEffect } from 'react'
import { Panel, Container, Flex, Button, Typography } from '@maxhub/max-ui'

export default function App() {
  // ----------------------------------------------------------
  // Состояние: данные из MAX Bridge
  // ----------------------------------------------------------
  const [user, setUser] = useState(null)
  const [platform, setPlatform] = useState('unknown')

  // ----------------------------------------------------------
  // Состояние: сообщение под кнопкой (вместо alert)
  // ----------------------------------------------------------
  const [message, setMessage] = useState('')

  // ----------------------------------------------------------
  // Состояние: счётчик нажатий — для проверки, что клик доходит
  // ----------------------------------------------------------
  const [count, setCount] = useState(0)

  // ----------------------------------------------------------
  // useEffect: читаем данные из MAX Bridge при загрузке
  // ----------------------------------------------------------
  useEffect(() => {
    if (window.WebApp) {
      setUser(window.WebApp.initDataUnsafe?.user || null)
      setPlatform(window.WebApp.platform || 'unknown')
    } else {
      setPlatform('браузер (WebApp не загружен)')
    }
  }, [])

  // ----------------------------------------------------------
  // Обработчик кнопки — обновляем состояние, не alert
  // ----------------------------------------------------------
  const handleTest = () => {
    setCount((c) => c + 1)
    setMessage(`Кнопка работает! Нажатий: ${count + 1}`)
  }

  // ----------------------------------------------------------
  // Разметка
  // ----------------------------------------------------------
  return (
    <Panel>
      <Container>
        <Flex direction="column" gap="l" style={{ padding: '24px' }}>
          <Typography.Title level={1}>Nirvana MAX</Typography.Title>

          <Typography.Text>Платформа: {platform}</Typography.Text>

          {user ? (
            <Typography.Text>
              Привет, {user.first_name}! (ID: {user.id})
            </Typography.Text>
          ) : (
            <Typography.Text>Приложение открыто вне MAX</Typography.Text>
          )}

          <Button onClick={handleTest}>Проверить</Button>

          {message && (
            <Typography.Text style={{ marginTop: '12px', color: 'green' }}>
              {message}
            </Typography.Text>
          )}

          <Typography.Text size="small" style={{ marginTop: '24px', opacity: 0.6 }}>
            Это каркас. Дальше — экраны и логика под кейс.
          </Typography.Text>
        </Flex>
      </Container>
    </Panel>
  )
}
