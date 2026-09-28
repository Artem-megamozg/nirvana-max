import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { REGIONS } from './data/regions'

import {
  completeTask,
  createReminder,
  createTask,
  deleteReminder,
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
  children: [],
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
  const [toast, setToast] = useState(null)

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
      ])

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

  function showToast(message, type = 'success') {
    setToast({ message, type })
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

    if (profile) {
      setProfileForm({
        region: profile.region || '',
        age: profile.age || '',
        employment: profile.employment || '',
        marital_status: profile.marital_status || '',
        income: profile.income || '',
        children:
          profile.children?.length
            ? profile.children
            : (profile.children_ages || []).map((age) => ({
                name: '',
                age,
              })),
        statuses: profile.statuses || [],
      })
    } else {
      setProfileForm(emptyProfile)
    }

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
        children: (profileForm.children || []).map((c) => ({
          name: c.name || '',
          age: c.age === '' || c.age == null ? null : Number(c.age),
        })),
        statuses:
          profileForm.statuses,
        scenario_id:
          selectedScenario.id,
        // Сохраняем meta-поля, чтобы они не затирались
        full_name: profile?.full_name || null,
        phone: profile?.phone || null,
        about: profile?.about || null,
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

      haptic('success')
      navigate(SCREENS.RESULTS)
    } catch (err) {
      setError(
        err.message ||
        'Не удалось сохранить профиль.'
      )
      showToast('Не удалось сохранить профиль', 'error')
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

      showToast('Добавлено в маршрут')
      navigate(SCREENS.ROUTE)
    } catch (err) {
      setError(
        err.message ||
        'Не удалось создать задачу.'
      )
      showToast('Не удалось добавить в маршрут', 'error')
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
      showToast('Напоминание добавлено')
    } catch (err) {
      setError(
        err.message ||
        'Не удалось создать напоминание.'
      )
      showToast('Не удалось создать напоминание', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  async function removeReminder(reminderId) {
    try {
      await deleteReminder(reminderId, userId)
      const reminderData = await getReminders(userId)
      setReminders(reminderData?.items || [])
      haptic('success')
      showToast('Напоминание удалено')
    } catch (err) {
      setError(err.message || 'Не удалось удалить напоминание')
      showToast('Не удалось удалить', 'error')
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
      showToast('Задача завершена')
    } catch (err) {
      setError(
        err.message ||
        'Не удалось завершить задачу.'
      )
      showToast('Не удалось завершить задачу', 'error')
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

    // Если меры нет в текущей выдаче — грузим карточку по id
    if (measure) {
      openMeasure(measure)
    } else {
      openMeasure({ id: measureId })
    }
  }

  const profileCompletion =
    useMemo(() => {
      const total = 7
      const baseFields = [
        profile?.region,
        profile?.age,
        profile?.employment,
        profile?.income,
      ]

      let completed = baseFields.filter(Boolean).length

      if (profile?.children_count !== undefined) {
        completed += 1
      }

      if (profile?.full_name) {
        completed += 1
      }

      if (profile?.phone) {
        completed += 1
      }

      return Math.min(100, Math.round((completed / total) * 100))
    }, [profile])

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
            onProfile={openProfileTab}
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
            onSelectScenario={selectScenario}
          />
        )}

        {screen === SCREENS.MY_PROFILE && (
          <MyProfileScreen
            maxUser={maxUser}
            profile={profile}
            userId={userId}
            onBack={goHome}
            onSaved={(updatedProfile) => {
              setProfile(updatedProfile)
            }}
            onToast={showToast}
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
            onOpenFullProfile={openProfileTab}
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
            onScenarios={() =>
              navigate(SCREENS.SCENARIOS)
            }
          />
        )}

        {screen === SCREENS.REMINDERS && (
          <RemindersScreen
            reminders={reminders}
            tasks={tasks}
            onAdd={() =>
              addReminder()
            }
            onDelete={removeReminder}
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

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
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
  onSelectScenario,
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
                onClick={() => onSelectScenario(scenario)}
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
  onOpenFullProfile,
}) {
  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const family = scenario?.id === 'family'
  const medical = scenario?.id === 'medical'

  // Определяем, что уже заполнено — один раз при рендере,
  // но поля НЕ скрываем при вводе
  const summary = [
    { key: 'region', label: 'Регион', value: form.region },
    { key: 'age', label: 'Возраст', value: form.age },
    { key: 'employment', label: 'Занятость', value: form.employment },
    { key: 'income', label: 'Доход', value: form.income },
  ]
  const hasChildren = (form.children || []).length > 0

  // ВАЖНО: замораживаем состояние при первом рендере.
  // Иначе при вводе последнего поля экран переключится на сводку,
  // и поле исчезнет прямо во время ввода.
  const [wasComplete] = useState(() =>
    Boolean(
      form.region &&
      form.age &&
      form.employment &&
      (!family || hasChildren)
    )
  )

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">ШАГ 2</span>

        <div className="selected-scenario">
          <span>{scenario?.icon}</span>
          {scenario?.title}
        </div>

        <h1>
          {wasComplete
            ? 'Проверим данные'
            : 'Заполним недостающее'}
        </h1>

        <p>
          {wasComplete
            ? 'Вот что мы о вас знаем. Если всё верно — построим маршрут.'
            : 'Заполните данные — часть могла быть заполнена в профиле.'}
        </p>
      </div>

      {wasComplete && (
        <div className="profile-summary-card">
          {summary.map((row) => (
            <div key={row.key} className="summary-row">
              <span className="summary-check">✓</span>
              <span className="summary-label">{row.label}:</span>
              <span className="summary-value">{row.value}</span>
            </div>
          ))}

          {family && hasChildren && (
            <div className="summary-row">
              <span className="summary-check">✓</span>
              <span className="summary-label">Дети:</span>
              <span className="summary-value">
                {(form.children || []).length}{' '}
                {(form.children || []).length === 1 ? 'ребёнок' : 'детей'}
              </span>
            </div>
          )}

          <button
            className="link-button full"
            onClick={onOpenFullProfile}
          >
            Что-то изменить →
          </button>
        </div>
      )}

      {!wasComplete && (
        <div className="form-card">
          <RegionAutocomplete
            value={form.region}
            onChange={(value) => update('region', value)}
          />

          <div className="field-grid">
            <Field
              label="Возраст"
              type="number"
              value={form.age}
              placeholder="30"
              onChange={(value) => update('age', value)}
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
              onChange={(value) => update('employment', value)}
            />
          </div>

          <Field
            label="Доход на члена семьи"
            type="number"
            value={form.income}
            placeholder="Например, 25000"
            onChange={(value) => update('income', value)}
          />

          {family && (
            <ChildrenEditor
              children={form.children || []}
              onChange={(next) => update('children', next)}
            />
          )}

          {family && (
            <SelectField
              label="Семейное положение"
              value={form.marital_status}
              options={['женат/замужем', 'не женат/не замужем']}
              onChange={(value) => update('marital_status', value)}
            />
          )}

          {medical && (
            <InfoBlock>
              Мы не ставим диагнозы и не интерпретируем
              результаты обследований. Здесь мы строим
              только административный маршрут.
            </InfoBlock>
          )}
        </div>
      )}

      <button
        className="primary-button full"
        onClick={onSubmit}
        disabled={loading}
      >
        {loading
          ? 'Строим маршрут...'
          : wasComplete
            ? 'Всё верно, строить маршрут'
            : 'Продолжить'}
        {!loading && <span>→</span>}
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

          {scenario?.id === 'family' && (
            <p className="empty-hint">
              В сценарии «Семья и дети» большинство мер требуют
              наличия детей. Если у вас их нет — посмотрите
              другие сценарии.
            </p>
          )}

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

      <SavingsBlock
        recommendations={recommendations}
        scenario={scenario}
      />

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

      <div
        className="why-card card"
        style={{ color: '#1a1a1a', background: '#f7f7fb' }}
      >
        <div
          className="muted-label"
          style={{ color: '#6b6b7b' }}
        >
          ПОЧЕМУ ЭТО В ВАШЕМ МАРШРУТЕ
        </div>

        {measure.match?.reasons?.length ? (
          <div className="bullet-list">
            {measure.match.reasons.map(
              (reason) => (
                <div
                  key={reason}
                  className="bullet-row success"
                  style={{ color: '#1a1a1a' }}
                >
                  <span style={{ color: '#22c55e' }}>✓</span>
                  {reason}
                </div>
              )
            )}
          </div>
        ) : (
          <p style={{ color: '#1a1a1a' }}>
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

      <div className="source-card">
        <div className="source-card-title">
          ИСТОЧНИК И АКТУАЛЬНОСТЬ
        </div>

        <div className="source-row">
          <span className="source-label">Источник</span>
          <span className="source-value">
            {measure.source_name || 'Не указан'}
          </span>
        </div>

        {measure.source_url && (
          <div className="source-row">
            <span className="source-label">Ссылка</span>
            <button
              className="source-link"
              onClick={() => openExternal(measure.source_url)}
            >
              {measure.source_url.replace(/^https?:\/\//, '').split('/')[0]} ↗
            </button>
          </div>
        )}

        <div className="source-row">
          <span className="source-label">Территория</span>
          <span className="source-value">
            {measure.territory || 'Не указана'}
          </span>
        </div>

        <div className="source-row">
          <span className="source-label">Актуальность</span>
          <span className="source-value">
            {measure.source_date || 'Не указана'}
          </span>
        </div>

        <div className="source-row">
          <span className="source-label">Статус данных</span>
          <span
            className={
              'source-status ' +
              (measure.data_status === 'model' ? 'model' : 'verified')
            }
          >
            {measure.data_status === 'model'
              ? 'модельные данные MVP'
              : 'проверенные данные'}
          </span>
        </div>

        <div className="source-disclaimer">
          Проверьте актуальность на официальном источнике перед подачей.
        </div>
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
  onScenarios,
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
                      className="small-button success"
                      onClick={() =>
                        onComplete(task.id)
                      }
                    >
                      ✓ Завершить
                    </button>

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

                    {task.measure_id && (
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
        <div className="empty-card done">
          <div className="empty-icon success">
            ✓
          </div>

          <h3>
            {completed.length
              ? 'Маршрут пройден'
              : 'Активных задач нет'}
          </h3>

          <p>
            {completed.length
              ? `Вы выполнили ${completed.length} ${completed.length === 1 ? 'задачу' : 'задач'}. Проверьте другие сценарии — там могут быть ещё меры.`
              : 'Вы можете пройти новый сценарий и собрать маршрут.'}
          </p>

          <div className="done-actions">
            <button
              className="primary-button"
              onClick={onScenarios}
            >
              Проверить другие ситуации
            </button>

            <button
              className="secondary-button"
              onClick={onHome}
            >
              На главную
            </button>
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="section-block">
          <div className="section-heading">
            <div>
              <span className="muted-label">
                ЗАВЕРШЕНО
              </span>

              <h2>
                {completed.length} задач
              </h2>
            </div>
          </div>

          <div className="task-list">
            {completed.map((task) => (
              <div
                key={task.id}
                className="task-card completed"
              >
                <div className="task-check">
                  <span className="check-done">✓</span>
                </div>

                <div className="task-content">
                  <span className="task-status muted">
                    Завершено
                  </span>

                  <strong>{task.title}</strong>

                  {task.description && (
                    <p>{task.description}</p>
                  )}

                  <div className="task-actions">
                    {task.measure_id && (
                      <button
                        className="small-button ghost"
                        onClick={() =>
                          onMeasure(task.measure_id)
                        }
                      >
                        Открыть
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
  onDelete,
  loading,
  tasks = [],
}) {
  const active = reminders.filter((item) => item.active)

  // Индекс задач для быстрого поиска по task_id
  const taskById = {}
  tasks.forEach((t) => {
    taskById[t.id] = t
  })

  function reminderTitle(reminder) {
    if (reminder.task_id) {
      const task = taskById[reminder.task_id]
      if (task) {
        return task.title
      }
      return 'Напоминание по задаче'
    }
    return 'Напоминание'
  }

  function reminderDescription(reminder) {
    if (reminder.task_id) {
      const task = taskById[reminder.task_id]
      if (task?.description) {
        return task.description
      }
      return 'Связано с задачей в маршруте'
    }
    return 'Общее напоминание'
  }

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">НАПОМИНАНИЯ</span>

        <h1>Nirvana сама напомнит.</h1>

        <p>
          Напоминания приходят в чат MAX, чтобы не нужно
          было снова искать нужный сервис.
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
              <div className="reminder-icon">◷</div>

              <div className="reminder-body">
                <strong>{reminderTitle(reminder)}</strong>

                <span className="reminder-description">
                  {reminderDescription(reminder)}
                </span>

                <span className="reminder-date">
                  Сработает: {formatDate(reminder.remind_at)}
                </span>
              </div>

              <button
                className="reminder-remove"
                onClick={() => onDelete(reminder.id)}
                aria-label="Удалить"
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="empty-card">
            <div className="empty-icon">◷</div>

            <h3>Пока нет активных напоминаний</h3>

            <p>
              Добавьте его прямо из карточки нужного шага
              или кнопкой выше.
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
  userId,
  onBack,
  onSaved,
  onToast,
}) {
  const [form, setForm] = useState(() => ({
    full_name: profile?.full_name || maxUser?.first_name || '',
    phone: profile?.phone || '',
    region: profile?.region || '',
    about: profile?.about || '',
    age: profile?.age || '',
    employment: profile?.employment || '',
    marital_status: profile?.marital_status || '',
    income: profile?.income || '',
    children:
      profile?.children?.length
        ? profile.children
        : (profile?.children_ages || []).map((age) => ({ name: '', age })),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Синхронизируем форму при обновлении profile извне
  useEffect(() => {
    if (!profile) return
    setForm({
      full_name: profile.full_name || maxUser?.first_name || '',
      phone: profile.phone || '',
      region: profile.region || '',
      about: profile.about || '',
      age: profile.age || '',
      employment: profile.employment || '',
      marital_status: profile.marital_status || '',
      income: profile.income || '',
      children:
        profile.children?.length
          ? profile.children
          : (profile.children_ages || []).map((age) => ({ name: '', age })),
    })
  }, [profile, maxUser])

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          full_name: form.full_name || null,
          phone: form.phone || null,
          region: form.region || null,
          about: form.about || null,
          age: form.age ? Number(form.age) : null,
          employment: form.employment || null,
          marital_status: form.marital_status || null,
          income: form.income === '' || form.income == null
            ? null
            : Number(form.income),
          children: (form.children || []).map((c) => ({
            name: c.name || '',
            age: c.age === '' || c.age == null ? null : Number(c.age),
          })),
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text}`)
      }

      const data = await res.json()
      if (data?.profile) {
        onSaved?.(data.profile)
      }
      onToast?.('Профиль сохранён')
    } catch (err) {
      setError(err.message || 'Не удалось сохранить')
      onToast?.('Не удалось сохранить профиль', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="content">
      <div className="page-heading">
        <span className="eyebrow">МОЙ ПРОФИЛЬ</span>
        <h1>Личные данные</h1>
        <p>
          Эти данные помогают не заполнять анкету каждый раз
          и точнее подбирать меры поддержки.
        </p>
      </div>

      <div className="profile-avatar-block">
        <div className="profile-avatar">
          {form.full_name?.[0]?.toUpperCase() || 'N'}
        </div>
        <div className="profile-avatar-name">
          <strong>{form.full_name || 'Без имени'}</strong>
          <span>ID: {userId}</span>
        </div>
      </div>

      <div className="form-card">
        <Field
          label="Имя и фамилия"
          value={form.full_name}
          placeholder="Иван Иванов"
          onChange={(v) => update('full_name', v)}
        />

        <Field
          label="Телефон"
          type="tel"
          value={form.phone}
          placeholder="+7 999 123-45-67"
          onChange={(v) => update('phone', v)}
        />

        <RegionAutocomplete
          value={form.region}
          onChange={(v) => update('region', v)}
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

        <div className="form-section-title">
          Данные для подбора мер
        </div>

        <div className="field-grid">
          <Field
            label="Возраст"
            type="number"
            value={form.age}
            placeholder="30"
            onChange={(v) => update('age', v)}
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
            onChange={(v) => update('employment', v)}
          />
        </div>

        <Field
          label="Доход на члена семьи"
          type="number"
          value={form.income}
          placeholder="Например, 25000"
          onChange={(v) => update('income', v)}
        />

        <ChildrenEditor
          children={form.children || []}
          onChange={(next) => update('children', next)}
        />

        <SelectField
          label="Семейное положение"
          value={form.marital_status}
          options={['женат/замужем', 'не женат/не замужем']}
          onChange={(v) => update('marital_status', v)}
        />
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

      <button
        className="link-button full"
        onClick={onBack}
      >
        ← На главную
      </button>
    </section>
  )
}



function ChildrenEditor({ children, onChange }) {
  function addChild() {
    onChange([...children, { name: '', age: '' }])
  }

  function removeChild(index) {
    const next = children.filter((_, i) => i !== index)
    onChange(next)
  }

  function updateChild(index, field, value) {
    const next = children.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    )
    onChange(next)
  }

  return (
    <div className="children-editor">
      <div className="children-header">
        <span>Дети</span>
        <div className="children-counter">
          <button
            type="button"
            className="counter-button"
            onClick={() =>
              children.length > 0 &&
              removeChild(children.length - 1)
            }
            disabled={children.length === 0}
          >
            −
          </button>
          <span className="counter-value">{children.length}</span>
          <button
            type="button"
            className="counter-button"
            onClick={addChild}
          >
            +
          </button>
        </div>
      </div>

      {children.length === 0 && (
        <div className="children-empty">
          Нажмите «+», чтобы добавить ребёнка
        </div>
      )}

      {children.map((child, index) => (
        <div key={index} className="child-row">
          <input
            type="text"
            className="child-input child-name"
            placeholder="Имя"
            value={child.name || ''}
            onChange={(e) =>
              updateChild(index, 'name', e.target.value)
            }
          />
          <input
            type="number"
            className="child-input child-age"
            placeholder="Возраст"
            value={child.age ?? ''}
            onChange={(e) =>
              updateChild(
                index,
                'age',
                e.target.value === ''
                  ? ''
                  : Number(e.target.value)
              )
            }
          />
          <button
            type="button"
            className="child-remove"
            onClick={() => removeChild(index)}
            aria-label="Удалить"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}


function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, 2500)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">
        {type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}
      </span>
      <span className="toast-text">{message}</span>
    </div>
  )
}



function RegionAutocomplete({ value, onChange, placeholder = 'Например, Москва' }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapperRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  // Клик вне — закрыть
  useEffect(() => {
    function handleClick(e) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.trim()
    ? REGIONS.filter((r) =>
        r.toLowerCase().includes(query.trim().toLowerCase())
      ).slice(0, 8)
    : REGIONS.slice(0, 8)

  function pick(region) {
    onChange(region)
    setQuery(region)
    setOpen(false)
  }

  function handleKey(e) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) pick(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="region-autocomplete" ref={wrapperRef}>
      <label className="field">
        <span>Регион</span>
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
        />
      </label>

      {open && filtered.length > 0 && (
        <div className="region-dropdown">
          {filtered.map((region, i) => (
            <button
              key={region}
              type="button"
              className={
                'region-option' +
                (i === highlight ? ' highlighted' : '')
              }
              onMouseDown={(e) => {
                e.preventDefault()
                pick(region)
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {region}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}



function SavingsBlock({ recommendations, scenario }) {
  if (!recommendations || recommendations.length === 0) {
    return null
  }

  // Оценки — гипотеза, зависит от числа мер
  const count = recommendations.length
  const savedMinutes = Math.min(15 + count * 8, 90)
  const savedTrips = Math.max(1, Math.round(count / 2))

  return (
    <div className="savings-block">
      <div className="savings-title">
        ЧТО ВЫ СЭКОНОМИЛИ
      </div>

      <div className="savings-list">
        <div className="savings-row">
          <span className="savings-icon">⏱</span>
          <div>
            <strong>~{savedMinutes} минут поиска</strong>
            <span>
              самостоятельное изучение источников заняло бы
              примерно столько времени
            </span>
          </div>
        </div>

        <div className="savings-row">
          <span className="savings-icon">📋</span>
          <div>
            <strong>{savedTrips} обращения в ведомства</strong>
            <span>
              готовый чек-лист документов экономит походы в МФЦ
            </span>
          </div>
        </div>

        <div className="savings-row">
          <span className="savings-icon">🎯</span>
          <div>
            <strong>{count} {count === 1 ? 'мера' : 'мер'} в маршруте</strong>
            <span>
              можно начинать оформление прямо сейчас
            </span>
          </div>
        </div>
      </div>

      <div className="savings-note">
        Оценка основана на количестве подобранных мер.
        Требует подтверждения на пилоте.
      </div>
    </div>
  )
}

export default App
