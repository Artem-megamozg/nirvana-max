// ============================================================
// App.jsx — корневой компонент мини-приложения Nirvana MAX
// ============================================================
// Это каркас. Сюда веб-разработчик будет добавлять экраны,
// навигацию и логику под кейс «Забота о людях».
// ============================================================

import { useState, useEffect } from 'react'
import { Panel, Container, Flex, Button, Typography } from '@maxhub/max-ui'

export default function App() {
  // ----------------------------------------------------------
  // Состояние: информация о пользователе из MAX Bridge
  // ----------------------------------------------------------
  const [user, setUser] = useState(null)
  const [platform, setPlatform] = useState('unknown')

  // ----------------------------------------------------------
  // useEffect: при загрузке приложения читаем данные из MAX Bridge
  // ----------------------------------------------------------
  // window.WebApp появляется после загрузки max-web-app.js.
  // Если приложение открыто не в MAX (например, в браузере),
  // window.WebApp может быть undefined — это нормально.
  // ----------------------------------------------------------
  useEffect(() => {
    if (window.WebApp) {
      // initDataUnsafe — объект с данными пользователя (id, имя, язык)
      // Документация: https://dev.max.ru/docs/webapps/bridge
      setUser(window.WebApp.initDataUnsafe?.user || null)
      setPlatform(window.WebApp.platform || 'unknown')
    }
  }, [])

  // ----------------------------------------------------------
  // Обработчик кнопки — заглушка для проверки
  // ----------------------------------------------------------
  const handleTest = () => {
    alert('Кнопка работает!')
  }

  // ----------------------------------------------------------
  // Разметка
  // ----------------------------------------------------------
  return (
    <Panel>
      <Container>
        <Flex direction="column" gap="l" style={{ padding: '24px' }}>
          {/* Заголовок */}
          <Typography.Title level={1}>
            Nirvana MAX
          </Typography.Title>

          {/* Статус подключения к MAX Bridge */}
          <Typography.Text>
            Платформа: {platform}
          </Typography.Text>

          {/* Информация о пользователе (если открыто в MAX) */}
          {user ? (
            <Typography.Text>
              Привет, {user.first_name}! (ID: {user.id})
            </Typography.Text>
          ) : (
            <Typography.Text>
              Приложение открыто вне MAX
            </Typography.Text>
          )}

          {/* Кнопка для проверки */}
          <Button onClick={handleTest}>
            Проверить
          </Button>

          {/* Подсказка для веб-разработчика */}
          <Typography.Text size="small" style={{ marginTop: '24px', opacity: 0.6 }}>
            Это каркас. Дальше — экраны и логика под кейс.
          </Typography.Text>
        </Flex>
      </Container>
    </Panel>
  )
}
