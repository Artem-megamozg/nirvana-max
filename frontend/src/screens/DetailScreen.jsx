// ============================================================
// DetailScreen — детали одной меры поддержки
// ============================================================
// Показывает описание, условия, ссылку на Госуслуги.
// Кнопка «Назад» возвращает к списку.
// ============================================================

import { Flex, Button, Typography } from '@maxhub/max-ui'

export default function DetailScreen({ benefit, onBack }) {
  if (!benefit) {
    return null
  }

  return (
    <Flex direction="column" gap="l" style={{ padding: '24px' }}>
      <Button onClick={onBack} variant="secondary">
        ← Назад
      </Button>

      <Typography.Title level={2}>{benefit.title}</Typography.Title>

      <Typography.Text style={{ fontSize: '20px', color: '#059669', fontWeight: 'bold' }}>
        {benefit.amount}
      </Typography.Text>

      <Typography.Text style={{ fontWeight: 'bold' }}>
        Условия:
      </Typography.Text>
      <ul>
        {benefit.conditions.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>

      <Typography.Text style={{ fontWeight: 'bold' }}>
        Как оформить:
      </Typography.Text>
      <Typography.Text>{benefit.how_to_apply}</Typography.Text>

      <Typography.Text size="small" style={{ opacity: 0.6 }}>
        Источник: {benefit.source}
      </Typography.Text>

      <Button onClick={() => window.WebApp?.openLink(benefit.apply_url)}>
        Оформить на Госуслугах
      </Button>
    </Flex>
  )
}
