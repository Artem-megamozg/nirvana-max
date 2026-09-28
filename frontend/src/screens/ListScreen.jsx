// ============================================================
// ListScreen — список найденных мер поддержки
// ============================================================
// Карточки с названием, суммой и кратким описанием.
// Клик по карточке открывает DetailScreen.
// ============================================================

import { Flex, Button, Typography } from '@maxhub/max-ui'

export default function ListScreen({ benefits, onClick }) {
  if (benefits.length === 0) {
    return (
      <Flex direction="column" gap="l" style={{ padding: '24px' }}>
        <Typography.Title level={2}>Ничего не найдено</Typography.Title>
        <Typography.Text>
          По твоим ответам мер не нашлось. Попробуй изменить категорию
          или обратись в МФЦ.
        </Typography.Text>
      </Flex>
    )
  }

  return (
    <Flex direction="column" gap="l" style={{ padding: '24px' }}>
      <Typography.Title level={2}>
        Найдено мер: {benefits.length}
      </Typography.Title>

      {benefits.map((b) => (
        <div
          key={b.id}
          onClick={() => onClick(b)}
          style={{
            padding: '16px',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            cursor: 'pointer',
          }}
        >
          <Typography.Title level={3}>{b.title}</Typography.Title>
          <Typography.Text style={{ color: '#059669', fontWeight: 'bold' }}>
            {b.amount}
          </Typography.Text>
          <Typography.Text size="small" style={{ display: 'block', marginTop: '8px' }}>
            {b.conditions.join(' · ')}
          </Typography.Text>
        </div>
      ))}
    </Flex>
  )
}
