import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  completeTask,
  createReminder,
  createTask,
  explainMeasure,
  getHistory,
  getMaxUser,
  getMeasure,
  getProfile,
  getRecommendations,
  getReminders,
  getScenarios,
  getTasks,
  getUserId,
  saveProfile,
  updateChecklist,
} from './api'

const SCREENS = {
  HOME: 'home',
  SCENARIOS: 'scenarios',
  PROFILE: 'profile',
  MY_PROFILE: 'my_profile',
  RESULTS: 'results',
  MEASURE: 'measure',
  ROUTE: 'route',
  REMINDERS: 'reminders',
}

const emptyProfile = {
  region: '',
  age: '',
  employment: '',
  marital_status: '',
  income: '',
  children_count: 0,
  children_ages: '',
  statuses: [],
}

function haptic(type = 'light') {
  try {
    window.WebApp?.HapticFeedback?.impactOccurred(type)
  } catch {
    // Ignore unsupported clients.
  }
}

function openExternal(url) {
  if (!url) {
    return
  }

  try {
    if (window.WebApp?.openLink) {
      window.WebApp.openLink(url)
      return
    }
  } catch {
    // Fallback below.
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function formatDate(value) {
  if (!value) {
    return 'Без срока'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function reminderIso(hours = 24) {
  return new Date(
    Date.now() + hours * 60 * 60 * 1000
  ).toISOString()
}

function App() {
  const userId = useMemo(
    () => getUserId(),
    []
  )

  const maxUser = useMemo(
    () => getMaxUser(),
    []
  )

  const [screen, setScreen] = useState(
    SCREENS.HOME
  )

  const [previousScreens, setPreviousScreens] =
    useState([])

  const [scenarios, setScenarios] = useState([])
  const [profile, setProfile] = useState(null)
  const [profileMeta, setProfileMeta] = useState(null)
  const [profileForm, setProfileForm] =
    useState(emptyProfile)

  const [selectedScenario, setSelectedScenario] =
    useState(null)

  const [recommendations, setRecommendations] =
    useState([])

  const [selectedMeasure, setSelectedMeasure] =
    useState(null)

  const [tasks, setTasks] = useState([])
  const [reminders, setReminders] = useState([])
  const [history, setHistory] = useState([])

  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] =
    useState(false)

  const [error, setError] = useState('')

  const [explanation, setExplanation] =
    useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    const backButton =
      window.WebApp?.BackButton

    if (!backButton) {
      return undefined
    }

    const isRoot =
      screen === SCREENS.HOME

    if (isRoot) {
      backButton.hide()
      return undefined
    }

    backButton.show()

    const callback = () => {
      goBack()
    }

    backButton.onClick(callback)

    return () => {
      backButton.offClick(callback)
    }
  }, [screen, previousScreens])

  async function loadInitialData() {
    try {
      setLoading(true)
      setError('')

      const [
        scenariosData,
        profileData,
        tasksData,
        remindersData,
        historyData,
        metaData,
      ] = await Promise.all([
        getScenarios(),
        getProfile(userId),
        getTasks(userId),
        getReminders(userId),
        getHistory(userId),
        fetch(`/api/profile/${encodeURIComponent(userId)}/meta`)
          .then((r) => r.json())
          .catch(() => ({ exists: false, meta: null })),
      ])

      if (metaData?.meta) {
        setProfileMeta(metaData.meta)
      }

      setScenarios(
        scenariosData?.items || []
      )

      if (profileData?.profile) {
        const serverProfile =
          profileData.profile

        setProfile(serverProfile)

        setProfileForm({
          region:
            serverProfile.region || '',
          age:
            serverProfile.age || '',
          employment:
            serverProfile.employment || '',
          marital_status:
            serverProfile.marital_status || '',
          income:
            serverProfile.income || '',
          children_count:
            serverProfile.children_count || 0,
          children_ages:
            (
              serverProfile.children_ages ||
              []
            ).join(', '),
          statuses:
            serverProfile.statuses || [],
        })
      }

      setTasks(tasksData?.items || [])
      setReminders(
        remindersData?.items || []
      )
      setHistory(
        historyData?.items || []
      )
    } catch (err) {
      setError(
        err.message ||
        'Не удалось загрузить данные.'
      )
    } finally {
      setLoading(false)
    }
  }

  function navigate(nextScreen) {
    setPreviousScreens((current) => [
      ...current,
      screen,
    ])

    setScreen(nextScreen)
    setError('')
    haptic()
  }

  function goBack() {
    setPreviousScreens((current) => {
      if (!current.length) {
        setScreen(SCREENS.HOME)
        return []
      }

      const next = [...current]
      const previous =
        next.pop() || SCREENS.HOME

      setScreen(previous)

      return next
    })

    setError('')
  }

  function goHome() {
    setPreviousScreens([])
    setScreen(SCREENS.HOME)
    setError('')
    setSelectedMeasure(null)
    setExplanation('')
  }

  function selectScenario(scenario) {
    setSelectedScenario(scenario)

    setProfileForm((current) => ({
      ...current,
    }))

    navigate(SCREENS.PROFILE)
  }

  async function submitProfile() {
    if (!selectedScenario) {
      setError(
        'Сначала выберите жизненную ситуацию.'
      )
      return
    }

    if (!profileForm.region.trim()) {
      setError('Укажите регион.')
      return
    }

    if (!profileForm.age) {
      setError('Укажите возраст.')
      return
    }

    if (!profileForm.employment) {
      setError('Укажите занятость.')
      return
    }

    if (
      selectedScenario.id === 'family' &&
      profileForm.children_count < 1
    ) {
      setError(
        'Для семейного сценария укажите хотя бы одного ребёнка.'
      )
      return
    }

    try {
      setActionLoading(true)
      setError('')

      const payload = {
        user_id: userId,
        region:
          profileForm.region.trim(),
        age:
          Number(profileForm.age),
        employment:
          profileForm.employment,
        marital_status:
          profileForm.marital_status,
        income:
          profileForm.income === ''
            ? null
            : Number(profileForm.income),
        children_count:
          Number(
            profileForm.children_count || 0
          ),
        children_ages:
          profileForm.children_ages
            ? profileForm.children_ages
                .split(/[,\s]+/)
                .map((value) =>
                  value.trim()
                )
                .filter(Boolean)
            : [],
        statuses:
          profileForm.statuses,
        scenario_id:
          selectedScenario.id,
      }

      const saved = await saveProfile(
        payload
      )

      setProfile(saved.profile)

      const result =
        await getRecommendations(
          userId,
          selectedScenario.id
        )

      setRecommendations(
        result?.benefits || []
      )

      const [
        taskData,
        reminderData,
        historyData,
      ] = await Promise.all([
        getTasks(userId),
        getReminders(userId),
        getHistory(userId),
      ])

      setTasks(taskData?.items || [])
      setReminders(
        reminderData?.items || []
      )
      setHistory(
        historyData?.items || []
      )

      navigate(SCREENS.RESULTS)
    } catch (err) {
      setError(
        err.message ||
        'Не удалось сохранить профиль.'
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function openMeasure(measure) {
    try {
      setActionLoading(true)
      setError('')
      setExplanation('')
      setSelectedMeasure(null)

      const details =
        await getMeasure(
          measure.id,
          userId
        )

      setSelectedMeasure(details)

      navigate(SCREENS.MEASURE)
    } catch (err) {
      setError(
        err.message ||
        'Не удалось загрузить меру.'
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function toggleChecklist(
    item
  ) {
    if (!selectedMeasure) {
      return
    }

    try {
      await updateChecklist(
        selectedMeasure.id,
        item.id,
        userId,
        !item.completed
      )

      const refreshed =
        await getMeasure(
          selectedMeasure.id,
          userId
        )

      setSelectedMeasure(refreshed)
      haptic('light')
    } catch (err) {
      setError(
        err.message ||
        'Не удалось обновить чек-лист.'
      )
    }
  }

  async function makeTask() {
    if (!selectedMeasure) {
      return
    }

    try {
      setActionLoading(true)

      await createTask({
        user_id: userId,
        title:
          `Оформить: ${selectedMeasure.title}`,
        description:
          selectedMeasure.how_to_apply ||
          'Продолжить оформление меры поддержки.',
        scenario_id:
          selectedMeasure.scenario,
        measure_id:
          selectedMeasure.id,
        priority:
          selectedMeasure.priority || 3,
      })

      const tasksData =
        await getTasks(userId)

      setTasks(
        tasksData?.items || []
      )

      navigate(SCREENS.ROUTE)
    } catch (err) {
      setError(
        err.message ||
        'Не удалось создать задачу.'
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function addReminder(taskId = null, hours = 24) {
    try {
      setActionLoading(true)

      await createReminder({
        user_id: userId,
        task_id: taskId,
        remind_at: reminderIso(hours),
      })

      const reminderData =
        await getReminders(userId)

      setReminders(
        reminderData?.items || []
      )

      haptic('success')
    } catch (err) {
      setError(
        err.message ||
        'Не удалось создать напоминание.'
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function markTaskDone(
    taskId
  ) {
    try {
      await completeTask(
        taskId,
        userId
      )

      const tasksData =
        await getTasks(userId)

      setTasks(
        tasksData?.items || []
      )

      haptic('success')
    } catch (err) {
      setError(
        err.message ||
        'Не удалось завершить задачу.'
      )
    }
  }

  async function explainCurrentMeasure() {
    if (!selectedMeasure) {
      return
    }

    try {
      setActionLoading(true)
      setError('')

      const result =
        await explainMeasure(
          userId,
          selectedMeasure.id
        )

      setExplanation(
        result?.text ||
        'Не удалось подготовить объяснение.'
      )
    } catch (err) {
      setError(
        err.message ||
        'Не удалось подготовить объяснение.'
      )
    } finally {
      setActionLoading(false)
    }
  }

  function editProfile() {
    if (
      profile?.scenario_id &&
      scenarios.length
    ) {
      const scenario =
        scenarios.find(
          (item) =>
            item.id ===
            profile.scenario_id
        )

      if (scenario) {
        setSelectedScenario(
          scenario
        )
      }
    }

    navigate(SCREENS.PROFILE)
  }

  function openProfileTab() {
    navigate(SCREENS.MY_PROFILE)
  }

  function routeToMeasure(measureId) {
    const measure =
      recommendations.find(
        (item) => item.id === measureId
      )

    if (measure) {
      openMeasure(measure)
    }
  }

  const profileCompletion =
    useMemo(() => {
      // 7 полей: 5 из анкеты + 2 из meta
      const total = 7

      // Анкетные поля
      const baseFields = [
        profile?.region,
        profile?.age,
        profile?.employment,
        profile?.income,
      ]

      let completed =
        baseFields.filter(Boolean).length

      if (
        profile?.children_count !==
        undefined
      ) {
        completed += 1
      }

      // Meta-поля
      if (profileMeta?.full_name) {
        completed += 1
      }

      if (profileMeta?.phone) {
        completed += 1
      }

      return Math.min(
        100,
        Math.round((completed / total) * 100)
      )
    }, [profile, profileMeta])

  if (loading) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="app">
        <Header
          screen={screen}
          maxUser={maxUser}
          onHome={goHome}
        />

        {error && (
          <ErrorBanner
            message={error}
            onClose={() => setError('')}
          />
        )}

        {screen === SCREENS.HOME && (
          <HomeScreen
            profile={profile}
            profileCompletion={
              profileCompletion
            }
            scenarios={scenarios}
            tasks={tasks}
            reminders={reminders}
            onStart={() =>
              navigate(
                SCREENS.SCENARIOS
              )
            }
            onProfile={editProfile}
            onRoute={() =>
              navigate(
                SCREENS.ROUTE
              )
            }
            onReminders={() =>
              navigate(
                SCREENS.REMINDERS
              )
            }
          />
        )}

        {screen === SCREENS.MY_PROFILE && (
          <MyProfileScreen
            maxUser={maxUser}
            profile={profile}
            profileMeta={profileMeta}
            userId={userId}
            onBack={goHome}
            onSaved={(meta) => setProfileMeta(meta)}
          />
        )}

        {screen === SCREENS.SCENARIOS && (
          <ScenarioScreen
            scenarios={scenarios}
            onSelect={selectScenario}
          />
        )}

        {screen === SCREENS.PROFILE && (
          <ProfileScreen
            form={profileForm}
            setForm={setProfileForm}
            scenario={
              selectedScenario
            }
            onSubmit={submitProfile}
            loading={actionLoading}
          />
        )}

        {screen === SCREENS.RESULTS && (
          <ResultsScreen
            recommendations={
              recommendations
            }
            scenario={
              selectedScenario
            }
            profile={profile}
            onOpen={openMeasure}
            onRoute={() =>
              navigate(
                SCREENS.ROUTE
              )
            }
            onProfile={editProfile}
            onBackToScenarios={() =>
              navigate(SCREENS.SCENARIOS)
            }
          />
        )}

        {screen === SCREENS.MEASURE && (
          <MeasureScreen
            measure={
              selectedMeasure
            }
            explanation={
              explanation
            }
            loading={
              actionLoading
            }
            onToggle={
              toggleChecklist
            }
            onExplain={
              explainCurrentMeasure
            }
            onTask={makeTask}
            onReminder={(hours) =>
              addReminder(null, hours)
            }
            onOfficial={() =>
              openExternal(
                selectedMeasure?.source_url
              )
            }
          />
        )}

        {screen === SCREENS.ROUTE && (
          <RouteScreen
            tasks={tasks}
            history={history}
            recommendations={
              recommendations
            }
            onComplete={
              markTaskDone
            }
            onReminder={addReminder}
            onMeasure={
              routeToMeasure
            }
            onHome={goHome}
          />
        )}

        {screen === SCREENS.REMINDERS && (
          <RemindersScreen
            reminders={reminders}
            onAdd={() =>
              addReminder()
            }
            loading={
              actionLoading
            }
          />
        )}

        <BottomNav
          screen={screen}
          onHome={goHome}
          onRoute={() =>
            navigate(
              SCREENS.ROUTE
            )
          }
          onReminders={() =>
            navigate(
              SCREENS.REMINDERS
            )
          }
          onProfile={openProfileTab}
        />
      </div>
    </AppShell>
  )
}

function AppShell({ children }) {
  return (
    <main className="shell">
      {children}
    </main>
  )
}

function Header({
  screen,
  maxUser,
  onHome,
}) {
  const showLogo =
    screen === SCREENS.HOME

  return (
    <header className="topbar">
      <button
        className="brand-button"
        onClick={onHome}
      >
        <div className="brand-mark">
          N
        </div>

        <div>
          <div className="brand-title">
            Nirvana
          </div>

          <div className="brand-subtitle">
            ваш маршрут помощи
          </div>
        </div>
      </button>

      <div className="user-pill">
        <span className="user-dot" />

        <span>
          {maxUser?.first_name ||
            'Пользователь'}
        </span>
      </div>
    </header>
  )
}

function ErrorBanner({
  message,
  onClose,
}) {
  return (
    <div className="error-banner">
      <div>
        <strong>
          Не получилось
        </strong>

        <div>{message}</div>
      </div>

      <button onClick={onClose}>
        ×
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="loading-page">
      <div className="loading-orb">
        N
      </div>

      <div className="spinner" />

      <div className="loading-title">
        Загружаем Nirvana
      </div>

      <div className="loading-text">
        Подготавливаем ваш маршрут
      </div>
    </div>
  )
}

function HomeScreen({
  profile,
  profileCompletion,
  scenarios,
  tasks,
  reminders,
  onStart,
  onProfile,
  onRoute,
  onReminders,
}) {
  const pendingTasks =
    tasks.filter(
      (item) =>
        item.status !== 'completed'
    )

  const nextReminder =
    reminders.find(
      (item) => item.active
    )

  return (
    <section className="content">
      <div className="hero">
        <div className="hero-glow" />

        <div className="eyebrow">
          ПЕРСОНАЛЬНЫЙ ПОМОЩНИК
        </div>

        <h1>
          Разберёмся,
          <br />
          что делать дальше.
        </h1>

        <p>
          Nirvana помогает пройти
          жизненную ситуацию:
          понять доступную поддержку,
          подготовить документы и
          не пропустить следующий шаг.
        </p>

        <button
          className="primary-button large"
          onClick={onStart}
        >
          Начать проверку
          <span>→</span>
        </button>
      </div>

      {profile && profileCompletion < 100 ? (
        <button
          className="profile-progress card"
          onClick={onProfile}
        >
          <div className="section-heading">
            <div>
              <span className="muted-label">
                МОЙ ПРОФИЛЬ
              </span>

              <h3>
                Заполнено на {profileCompletion}%
              </h3>
            </div>

            <span className="progress-value">
              {profileCompletion}%
            </span>
          </div>

          <div className="progress-bar">
            <div
              style={{
                width: `${profileCompletion}%`,
              }}
            />
          </div>

          <div className="card-footer">
            Дополнить профиль
            <span>→</span>
          </div>
        </button>
      ) : null}

      <div className="section-block">
        <div className="section-heading">
          <div>
            <span className="muted-label">
              СЦЕНАРИИ
            </span>

            <h2>
              Что происходит?
            </h2>
          </div>

          <button
            className="text-button"
            onClick={onStart}
          >
            Все →
          </button>
        </div>

        <div className="scenario-grid compact">
          {scenarios.map(
            (scenario) => (
              <button
                key={scenario.id}
                className="scenario-card"
                onClick={onStart}
              >
                <span className="scenario-icon">
                  {scenario.icon}
                </span>

                <span className="scenario-title">
                  {scenario.title}
                </span>

                <span className="scenario-arrow">
                  →
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {(pendingTasks.length > 0 || nextReminder) && (
        <div className="home-status">
          {pendingTasks.length > 0 && (
            <span className="status-chip">
              ✓ {pendingTasks.length}{' '}
              {pendingTasks.length === 1
                ? 'задача'
                : 'задач'}{' '}
              в маршруте
            </span>
          )}
          {nextReminder && (
            <span className="status-chip">
              ◷ есть напоминание
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function ScenarioScreen({
  scenarios,
  onSelect,
}) {
  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">
          ШАГ 1
        </span>

        <h1>
          Выберите ситуацию
        </h1>

        <p>
          Это поможет построить
          именно ваш маршрут, а не
          показать длинный список
          всего подряд.
        </p>
      </div>

      <div className="scenario-list">
        {scenarios.map(
          (scenario) => (
            <button
              key={scenario.id}
              className="big-scenario-card"
              onClick={() =>
                onSelect(scenario)
              }
            >
              <span className="big-scenario-icon">
                {scenario.icon}
              </span>

              <span className="big-scenario-copy">
                <strong>
                  {scenario.title}
                </strong>

                <span>
                  {scenario.description}
                </span>
              </span>

              <span className="big-scenario-arrow">
                →
              </span>
            </button>
          )
        )}
      </div>

      <InfoBlock>
        Дальше мы зададим несколько
        вопросов и используем их
        только для построения вашего
        маршрута.
      </InfoBlock>
    </section>
  )
}

function ProfileScreen({
  form,
  setForm,
  scenario,
  onSubmit,
  loading,
}) {
  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const family =
    scenario?.id === 'family'

  const medical =
    scenario?.id === 'medical'

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">
          ШАГ 2
        </span>

        <div className="selected-scenario">
          <span>
            {scenario?.icon}
          </span>

          {scenario?.title}
        </div>

        <h1>
          Немного о вас
        </h1>

        <p>
          Заполним профиль один раз.
          Потом его можно использовать
          повторно в других сценариях.
        </p>
      </div>

      <div className="form-card">
        <Field
          label="Регион"
          value={form.region}
          placeholder="Например, Москва"
          onChange={(value) =>
            update('region', value)
          }
        />

        <div className="field-grid">
          <Field
            label="Возраст"
            type="number"
            value={form.age}
            placeholder="30"
            onChange={(value) =>
              update('age', value)
            }
          />

          <SelectField
            label="Занятость"
            value={form.employment}
            options={[
              'работаю',
              'не работаю',
              'учусь',
              'работаю и учусь',
            ]}
            onChange={(value) =>
              update(
                'employment',
                value
              )
            }
          />
        </div>

        <Field
          label="Доход на члена семьи"
          type="number"
          value={form.income}
          placeholder="Например, 25000"
          onChange={(value) =>
            update('income', value)
          }
        />

        {family && (
          <>
            <div className="field-grid">
              <Field
                label="Количество детей"
                type="number"
                value={
                  form.children_count
                }
                min="0"
                onChange={(value) =>
                  update(
                    'children_count',
                    value
                  )
                }
              />

              <Field
                label="Возраст детей"
                value={
                  form.children_ages
                }
                placeholder="4, 8"
                onChange={(value) =>
                  update(
                    'children_ages',
                    value
                  )
                }
              />
            </div>

            <SelectField
              label="Семейное положение"
              value={
                form.marital_status
              }
              options={[
                'женат/замужем',
                'не женат/не замужем',
              ]}
              onChange={(value) =>
                update(
                  'marital_status',
                  value
                )
              }
            />
          </>
        )}

        {medical && (
          <InfoBlock>
            Мы не ставим диагнозы и не
            интерпретируем результаты
            обследований. Здесь мы
            строим только
            административный маршрут.
          </InfoBlock>
        )}
      </div>

      <button
        className="primary-button full"
        onClick={onSubmit}
        disabled={loading}
      >
        {loading
          ? 'Сохраняем...'
          : 'Построить мой маршрут'}
        {!loading && (
          <span>→</span>
        )}
      </button>
    </section>
  )
}

function ResultsScreen({
  recommendations,
  scenario,
  profile,
  onOpen,
  onRoute,
  onProfile,
  onBackToScenarios,
}) {
  return (
    <section className="content">
      <div className="result-hero">
        <div className="success-icon">
          ✓
        </div>

        <div>
          <span className="eyebrow">
            ГОТОВО
          </span>

          <h1>
            Ваш маршрут собран
          </h1>

          <p>
            {recommendations.length
              ? `Найдено ${recommendations.length} элементов для сценария «${scenario?.title}».`
              : 'Пока не нашли подходящих мер, но можем расширить ваш профиль.'}
          </p>
        </div>
      </div>

      {profile && (
        <div className="profile-summary card">
          <div className="section-heading">
            <div>
              <span className="muted-label">
                ВАШ ПРОФИЛЬ
              </span>

              <h3>
                {profile.region}
              </h3>
            </div>

            <button
              className="text-button"
              onClick={onProfile}
            >
              Изменить
            </button>
          </div>

          <div className="summary-tags">
            {profile.children_count >
              0 && (
              <span>
                👨‍👩‍👧 {profile.children_count}{' '}
                детей
              </span>
            )}

            {profile.employment && (
              <span>
                💼 {profile.employment}
              </span>
            )}

            {profile.age && (
              <span>
                {profile.age} лет
              </span>
            )}
          </div>
        </div>
      )}

      <div className="section-heading results-heading">
        <div>
          <span className="muted-label">
            ПОДХОДИТ ВАМ
          </span>

          <h2>
            Что найдено
          </h2>
        </div>
      </div>

      {recommendations.length ? (
        <div className="measure-list">
          {recommendations.map(
            (measure, index) => (
              <button
                key={measure.id}
                className="measure-card"
                onClick={() =>
                  onOpen(measure)
                }
              >
                <div className="measure-number">
                  {String(
                    index + 1
                  ).padStart(2, '0')}
                </div>

                <div className="measure-copy">
                  <div className="measure-topline">
                    <span className="status-badge">
                      Подходит
                    </span>

                    {measure.priority <=
                      1 && (
                      <span className="priority-badge">
                        Важно
                      </span>
                    )}
                  </div>

                  <strong>
                    {measure.title}
                  </strong>

                  <span>
                    {measure.short_description}
                  </span>

                  <small>
                    Почему подходит →
                  </small>
                </div>

                <div className="measure-arrow">
                  →
                </div>
              </button>
            )
          )}
        </div>
      ) : (
        <div className="empty-card">
          <div className="empty-icon">
            ○
          </div>

          <h3>
            Пока ничего не найдено
          </h3>

          <p>
            Попробуйте дополнить
            профиль — от этого зависит
            точность маршрута.
          </p>

          <div className="empty-actions">
            <button
              className="secondary-button"
              onClick={onProfile}
            >
              Дополнить профиль
            </button>
            <button
              className="link-button"
              onClick={onBackToScenarios}
            >
              Сменить ситуацию
            </button>
          </div>
        </div>
      )}

      <button
        className="route-preview"
        onClick={onRoute}
      >
        <div>
          <span className="muted-label">
            СЛЕДУЮЩЕЕ
          </span>

          <strong>
            Собрать всё в один маршрут
          </strong>

          <span>
            Документы, действия и
            напоминания
          </span>
        </div>

        <span>
          →
        </span>
      </button>
    </section>
  )
}

function MeasureScreen({
  measure,
  explanation,
  loading,
  onToggle,
  onExplain,
  onTask,
  onReminder,
  onOfficial,
}) {
  if (!measure) {
    return null
  }

  const checklist =
    measure.checklist || []

  const completed =
    checklist.filter(
      (item) => item.completed
    ).length

  const progress =
    checklist.length
      ? Math.round(
          (completed /
            checklist.length) *
            100
        )
      : 0

  return (
    <section className="content">
      <div className="detail-hero">
        <div className="detail-tag">
          {measure.kind ===
          'support'
            ? 'МЕРА ПОДДЕРЖКИ'
            : 'ШАГ МАРШРУТА'}
        </div>

        <h1>
          {measure.title}
        </h1>

        <p>
          {measure.short_description}
        </p>

        {measure.amount && (
          <div className="amount-block">
            {measure.amount}
          </div>
        )}
      </div>

      <div className="why-card card">
        <div className="muted-label">
          ПОЧЕМУ ЭТО В ВАШЕМ МАРШРУТЕ
        </div>

        {measure.match?.reasons?.length ? (
          <div className="bullet-list">
            {measure.match.reasons.map(
              (reason) => (
                <div
                  key={reason}
                  className="bullet-row success"
                >
                  <span>✓</span>
                  {reason}
                </div>
              )
            )}
          </div>
        ) : (
          <p>
            Мера добавлена в маршрут
            на основании вашей
            ситуации и выбранного
            сценария.
          </p>
        )}
      </div>

      <div className="section-block">
        <div className="section-heading">
          <div>
            <span className="muted-label">
              ПОДГОТОВКА
            </span>

            <h2>
              Что подготовить
            </h2>
          </div>

          <strong className="completion">
            {progress}%
          </strong>
        </div>

        <div className="progress-bar detail">
          <div
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="checklist">
          {checklist.map(
            (item) => (
              <button
                key={item.id}
                className={`check-row ${
                  item.completed
                    ? 'completed'
                    : ''
                }`}
                onClick={() =>
                  onToggle(item)
                }
              >
                <span className="check-circle">
                  {item.completed
                    ? '✓'
                    : ''}
                </span>

                <span>
                  {item.title}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {measure.missing?.length ? (
        <div className="warning-card">
          <div className="warning-title">
            Нужно проверить
          </div>

          {measure.missing.map(
            (item) => (
              <div
                key={item}
                className="warning-row"
              >
                ⚠ {item}
              </div>
            )
          )}
        </div>
      ) : null}

      <div className="section-block">
        <div className="section-heading">
          <div>
            <span className="muted-label">
              ПОНЯТНОЕ ОБЪЯСНЕНИЕ
            </span>

            <h2>
              Почему именно мне?
            </h2>
          </div>
        </div>

        {!explanation ? (
          <button
            className="secondary-button full"
            onClick={onExplain}
            disabled={loading}
          >
            {loading
              ? 'Готовим объяснение...'
              : 'Объяснить простыми словами'}
          </button>
        ) : (
          <div className="explanation-card">
            {explanation}
          </div>
        )}
      </div>

      <div className="action-stack">
        <button
          className="primary-button full"
          onClick={onTask}
          disabled={loading}
        >
          Добавить в мой маршрут
          <span>→</span>
        </button>

        <div className="reminder-options">
          <div className="muted-label">НАПОМНИТЬ</div>
          <div className="reminder-buttons">
            <button
              className="secondary-button"
              onClick={() => onReminder(1)}
              disabled={loading}
            >
              Через час
            </button>
            <button
              className="secondary-button"
              onClick={() => onReminder(24)}
              disabled={loading}
            >
              Завтра
            </button>
            <button
              className="secondary-button"
              onClick={() => onReminder(72)}
              disabled={loading}
            >
              Через 3 дня
            </button>
          </div>
        </div>

        {measure.source_url && (
          <button
            className="link-button full"
            onClick={onOfficial}
          >
            Открыть официальный источник
            ↗
          </button>
        )}
      </div>

      <div className="source-note">
        Источник: {measure.source_name}
        <br />
        Статус данных:{' '}
        {measure.data_status ===
        'model'
          ? 'модельные данные MVP'
          : 'проверенные данные'}
      </div>
    </section>
  )
}

function RouteScreen({
  tasks,
  history,
  recommendations,
  onComplete,
  onReminder,
  onMeasure,
  onHome,
}) {
  const pending =
    tasks.filter(
      (item) =>
        item.status !== 'completed'
    )

  const completed =
    tasks.filter(
      (item) =>
        item.status === 'completed'
    )

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">
          МОЙ МАРШРУТ
        </span>

        <h1>
          Не потеряем следующий шаг.
        </h1>

        <p>
          Здесь собраны ваши текущие
          действия и история работы
          с Nirvana.
        </p>
      </div>

      <div className="route-stats">
        <div>
          <strong>
            {pending.length}
          </strong>

          <span>
            активных задач
          </span>
        </div>

        <div>
          <strong>
            {completed.length}
          </strong>

          <span>
            завершено
          </span>
        </div>
      </div>

      {pending.length ? (
        <div className="task-list">
          {pending.map(
            (task) => (
              <div
                key={task.id}
                className="task-card"
              >
                <div className="task-check">
                  <button
                    onClick={() =>
                      onComplete(
                        task.id
                      )
                    }
                  >
                    ✓
                  </button>
                </div>

                <div className="task-content">
                  <span className="task-status">
                    Следующий шаг
                  </span>

                  <strong>
                    {task.title}
                  </strong>

                  <p>
                    {task.description}
                  </p>

                  {task.due_date && (
                    <span className="task-date">
                      До:{' '}
                      {formatDate(
                        task.due_date
                      )}
                    </span>
                  )}

                  <div className="task-actions">
                    <button
                      className="small-button"
                      onClick={() =>
                        onReminder(
                          task.id
                        )
                      }
                    >
                      ◷ Напомнить
                    </button>

                    {recommendations.some(
                      (item) =>
                        item.id ===
                        task.measure_id
                    ) && (
                      <button
                        className="small-button ghost"
                        onClick={() =>
                          onMeasure(
                            task.measure_id
                          )
                        }
                      >
                        Открыть
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="empty-card">
          <div className="empty-icon success">
            ✓
          </div>

          <h3>
            Активных задач нет
          </h3>

          <p>
            Вы можете пройти новый
            сценарий и собрать маршрут.
          </p>

          <button
            className="primary-button"
            onClick={onHome}
          >
            Вернуться домой
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="section-block">
          <div className="section-heading">
            <div>
              <span className="muted-label">
                ИСТОРИЯ
              </span>

              <h2>
                Что уже сделали
              </h2>
            </div>
          </div>

          <div className="history-list">
            {history
              .filter((event) =>
                ![
                  'reminder_created',
                  'bot_started',
                ].includes(event.event_type)
              )
              .slice(0, 8)
              .map((event) => (
                <div
                  key={event.id}
                  className="history-row"
                >
                  <span>
                    ✓
                  </span>

                  <div>
                    <strong>
                      {historyLabel(
                        event.event_type
                      )}
                    </strong>

                    <small>
                      {formatDate(
                        event.created_at
                      )}
                    </small>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}

function RemindersScreen({
  reminders,
  onAdd,
  loading,
}) {
  const active =
    reminders.filter(
      (item) =>
        item.active
    )

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">
          НАПОМИНАНИЯ
        </span>

        <h1>
          Nirvana сама напомнит.
        </h1>

        <p>
          Напоминания приходят в
          чат MAX, чтобы не нужно было
          снова искать нужный сервис.
        </p>
      </div>

      <button
        className="secondary-button full"
        onClick={onAdd}
        disabled={loading}
      >
        Добавить напоминание на завтра
      </button>

      <div className="reminder-list">
        {active.length ? (
          active.map((reminder) => (
            <div
              key={reminder.id}
              className="reminder-card"
            >
              <div className="reminder-icon">
                ◷
              </div>

              <div>
                <strong>
                  Напоминание
                </strong>

                <span>
                  {formatDate(
                    reminder.remind_at
                  )}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-card">
            <div className="empty-icon">
              ◷
            </div>

            <h3>
              Пока нет активных
              напоминаний
            </h3>

            <p>
              Добавьте его прямо из
              карточки нужного шага.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function BottomNav({
  screen,
  onHome,
  onRoute,
  onReminders,
  onProfile,
}) {
  const items = [
    {
      id: SCREENS.HOME,
      icon: '⌂',
      title: 'Главная',
      onClick: onHome,
    },
    {
      id: SCREENS.ROUTE,
      icon: '✓',
      title: 'Маршрут',
      onClick: onRoute,
    },
    {
      id: SCREENS.REMINDERS,
      icon: '◷',
      title: 'Напоминания',
      onClick: onReminders,
    },
    {
      id: SCREENS.MY_PROFILE,
      icon: '◇',
      title: 'Профиль',
      onClick: onProfile,
    },
  ]

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.id}
          className={
            screen === item.id
              ? 'active'
              : ''
          }
          onClick={item.onClick}
        >
          <span>
            {item.icon}
          </span>

          <small>
            {item.title}
          </small>
        </button>
      ))}
    </nav>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  min,
}) {
  return (
    <label className="field">
      <span>
        {label}
      </span>

      <input
        type={type}
        value={value}
        min={min}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}) {
  return (
    <label className="field">
      <span>
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      >
        <option value="">
          Выберите
        </option>

        {options.map(
          (option) => (
            <option
              key={option}
              value={option}
            >
              {option}
            </option>
          )
        )}
      </select>
    </label>
  )
}

function InfoBlock({
  children,
}) {
  return (
    <div className="info-block">
      <span>i</span>

      <p>
        {children}
      </p>
    </div>
  )
}

function historyLabel(
  type
) {
  const labels = {
    bot_started:
      'Запустили Nirvana',
    profile_updated:
      'Обновили профиль',
    recommendations_requested:
      'Получили персональный результат',
    task_created:
      'Добавили задачу в маршрут',
    task_completed:
      'Завершили задачу',
    reminder_created:
      'Создали напоминание',
  }

  return (
    labels[type] ||
    'Действие в Nirvana'
  )
}


function MyProfileScreen({
  maxUser,
  profile,
  profileMeta,
  userId,
  onBack,
  onSaved,
}) {
  const [form, setForm] = useState({
    full_name:
      profileMeta?.full_name ||
      maxUser?.first_name ||
      '',
    phone: profileMeta?.phone || '',
    region:
      profileMeta?.region ||
      profile?.region ||
      '',
    about: profileMeta?.about || '',
  })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
    setSavedAt(null)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        `/api/profile/${encodeURIComponent(userId)}/meta`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
      const data = await res.json()
      if (data?.meta) {
        onSaved?.(data.meta)
      }
      setSavedAt(new Date())
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">
          МОЙ ПРОФИЛЬ
        </span>

        <h1>
          Личные данные
        </h1>

        <p>
          Эти данные не влияют на подбор мер —
          они нужны только для вашего удобства
          и чтобы не вводить их каждый раз.
        </p>
      </div>

      <div className="profile-avatar-block">
        <div className="profile-avatar">
          {form.full_name?.[0]?.toUpperCase() || 'N'}
        </div>
        <div className="profile-avatar-name">
          <strong>
            {form.full_name || 'Без имени'}
          </strong>
          <span>
            ID: {userId}
          </span>
        </div>
      </div>

      <div className="form-card">
        <Field
          label="Имя и фамилия"
          value={form.full_name}
          placeholder="Иван Иванов"
          onChange={(value) => update('full_name', value)}
        />

        <Field
          label="Телефон"
          type="tel"
          value={form.phone}
          placeholder="+7 999 123-45-67"
          onChange={(value) => update('phone', value)}
        />

        <Field
          label="Регион"
          value={form.region}
          placeholder="Например, Москва"
          onChange={(value) => update('region', value)}
        />

        <label className="field">
          <span>О себе</span>
          <textarea
            value={form.about}
            placeholder="Коротко о вашей ситуации"
            rows={3}
            onChange={(e) => update('about', e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="error-banner">
          <div>
            <strong>Не получилось</strong>
            <div>{error}</div>
          </div>
        </div>
      )}

      <button
        className="primary-button full"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </button>

      {savedAt && (
        <div className="saved-note">
          ✓ Сохранено в {savedAt.toLocaleTimeString('ru-RU')}
        </div>
      )}

      <button
        className="link-button full"
        onClick={onBack}
      >
        ← На главную
      </button>
    </section>
  )
}

export default App
