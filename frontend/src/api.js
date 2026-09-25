const API = ''

async function request(url, options = {}) {
  const response = await fetch(`${API}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const text = await response.text()

  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    throw new Error(
      data?.detail ||
      data?.message ||
      `HTTP ${response.status}`
    )
  }

  return data
}

export function getUserId() {
  const maxUser =
    window.WebApp?.initDataUnsafe?.user

  if (maxUser?.id) {
    return String(maxUser.id)
  }

  let demoUser = localStorage.getItem('nirvana_demo_user')

  if (!demoUser) {
    demoUser =
      `demo-${Math.random().toString(36).slice(2, 10)}`

    localStorage.setItem(
      'nirvana_demo_user',
      demoUser
    )
  }

  return demoUser
}

export function getMaxUser() {
  return window.WebApp?.initDataUnsafe?.user || null
}

export async function getScenarios() {
  return request('/api/scenarios')
}

export async function getProfile(userId) {
  return request(
    `/api/profile?user_id=${encodeURIComponent(userId)}`
  )
}

export async function saveProfile(data) {
  return request('/api/profile', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getRecommendations(
  userId,
  scenarioId
) {
  return request('/api/recommendations', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      scenario_id: scenarioId,
    }),
  })
}

export async function getMeasure(
  measureId,
  userId
) {
  return request(
    `/api/measures/${encodeURIComponent(
      measureId
    )}?user_id=${encodeURIComponent(userId)}`
  )
}

export async function updateChecklist(
  measureId,
  itemId,
  userId,
  completed
) {
  return request(
    `/api/checklist/${encodeURIComponent(
      measureId
    )}/${encodeURIComponent(itemId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        completed,
      }),
    }
  )
}

export async function getTasks(userId) {
  return request(
    `/api/tasks?user_id=${encodeURIComponent(userId)}`
  )
}

export async function createTask(data) {
  return request('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function completeTask(taskId, userId) {
  return request(
    `/api/tasks/${encodeURIComponent(
      taskId
    )}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
      }),
    }
  )
}

export async function getReminders(userId) {
  return request(
    `/api/reminders?user_id=${encodeURIComponent(userId)}`
  )
}

export async function createReminder(data) {
  return request('/api/reminders', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getHistory(userId) {
  return request(
    `/api/history?user_id=${encodeURIComponent(userId)}`
  )
}

export async function explainMeasure(
  userId,
  measureId
) {
  return request('/api/explain', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      measure_id: measureId,
    }),
  })
}
