// ============================================================
// FormScreen — анкета для подбора мер поддержки
// ============================================================
// 5 вопросов, только кнопки — без текстового ввода.
// В конце — кнопка «Подобрать».
// ============================================================

import { useState } from 'react'
import { Flex, Button, Typography } from '@maxhub/max-ui'

const CATEGORIES = [
  { value: 'семьи с детьми', label: 'Семьи с детьми' },
  { value: 'инвалидность', label: 'Инвалидность' },
  { value: 'пенсионеры', label: 'Пенсионеры' },
]

export default function FormScreen({ user, onSubmit }) {
  // ----------------------------------------------------------
  // Ответы анкеты
  // ----------------------------------------------------------
  const [category, setCategory] = useState('')
  const [region, setRegion] = useState('')
  const [incomeBelowPm, setIncomeBelowPm] = useState(null)
  const [childrenCount, setChildrenCount] = useState(0)

  // ----------------------------------------------------------
  // Отправка анкеты
  // ----------------------------------------------------------
  const handleSubmit = () => {
    onSubmit({
      category,
      region,
      income_below_pm: incomeBelowPm,
      children_count: childrenCount,
    })
  }

  return (
    <Flex direction="column" gap="l" style={{ padding: '24px' }}>
      <Typography.Title level={2}>
        {user ? `Привет, ${user.first_name}!` : 'Подбор мер поддержки'}
      </Typography.Title>

      <Typography.Text>
        Ответь на 3 вопроса — я подберу, что тебе положено.
      </Typography.Text>

      {/* Вопрос 1: категория */}
      <Typography.Text style={{ fontWeight: 'bold' }}>
        1. Кто ты?
      </Typography.Text>
      <Flex gap="s" wrap="wrap">
        {CATEGORIES.map((c) => (
          <Button
            key={c.value}
            onClick={() => setCategory(c.value)}
            variant={category === c.value ? 'primary' : 'secondary'}
          >
            {c.label}
          </Button>
        ))}
      </Flex>

      {/* Вопрос 2: доход */}
      <Typography.Text style={{ fontWeight: 'bold' }}>
        2. Доход ниже 1,5 ПМ на члена семьи?
      </Typography.Text>
      <Flex gap="s">
        <Button
          onClick={() => setIncomeBelowPm(true)}
          variant={incomeBelowPm === true ? 'primary' : 'secondary'}
        >
          Да
        </Button>
        <Button
          onClick={() => setIncomeBelowPm(false)}
          variant={incomeBelowPm === false ? 'primary' : 'secondary'}
        >
          Нет
        </Button>
      </Flex>

      {/* Вопрос 3: дети (только для семей с детьми) */}
      {category === 'семьи с детьми' && (
        <>
          <Typography.Text style={{ fontWeight: 'bold' }}>
            3. Сколько детей?
          </Typography.Text>
          <Flex gap="s">
            {[1, 2, 3, 4].map((n) => (
              <Button
                key={n}
                onClick={() => setChildrenCount(n)}
                variant={childrenCount === n ? 'primary' : 'secondary'}
              >
                {n === 4 ? '4+' : n}
              </Button>
            ))}
          </Flex>
        </>
      )}

      {/* Кнопка «Подобрать» */}
      <Button
        onClick={handleSubmit}
        disabled={!category || incomeBelowPm === null}
        style={{ marginTop: '16px' }}
      >
        Подобрать меры
      </Button>
    </Flex>
  )
}
