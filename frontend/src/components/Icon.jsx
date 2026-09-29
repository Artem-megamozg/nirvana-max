// Единая иконочная система вместо эмодзи. Обводка одной толщины,
// закруглённые концы, currentColor — цвет всегда наследуется от
// родителя, поэтому одна и та же иконка работает и в тёмной кнопке,
// и на светлой карточке без отдельной раскраски на каждый случай.
const PATHS = {
  // --- Категории сценариев и мер ---
  family: (
    <>
      <circle cx="8.5" cy="7" r="2.6" />
      <circle cx="17" cy="8" r="2.1" />
      <path d="M3.5 20c.4-3.4 2.4-5.2 5-5.2s4.6 1.8 5 5.2" />
      <path d="M14.8 20c.3-2.6 1.6-4.1 3.7-4.1s3.2 1.4 3.5 3.5" />
    </>
  ),
  housing: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a.7.7 0 0 0 .7.7H10v-5.6a2 2 0 0 1 4 0v5.6h3.3a.7.7 0 0 0 .7-.7V10" />
    </>
  ),
  medical: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  education: (
    <>
      <path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" />
      <path d="M7 11.6v4.1c0 1.1 2.2 2.3 5 2.3s5-1.2 5-2.3v-4.1" />
      <path d="M20 10v5" />
    </>
  ),
  senior: (
    <>
      <circle cx="12" cy="6.3" r="2.5" />
      <path d="M7 20c.2-3.6 2-6.4 5-6.4s4.8 2.8 5 6.4" />
      <path d="M9 20.4h6" />
    </>
  ),
  money: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="2.5" />
      <circle cx="12" cy="12.5" r="2.3" />
      <path d="M6.5 7V5.6c0-.6.5-1 1-.8l10 2.2" />
    </>
  ),
  documents: (
    <>
      <path d="M7 3.5h7.2L18 7.3V20a.7.7 0 0 1-.7.7H7A.7.7 0 0 1 6.3 20V4.2c0-.4.3-.7.7-.7Z" />
      <path d="M14 3.5V7h3.7" />
      <path d="M9 12h6M9 15h6M9 18h3.5" />
    </>
  ),
  transport: (
    <>
      <rect x="3.5" y="5.5" width="17" height="11.5" rx="2.5" />
      <path d="M3.5 11h17" />
      <circle cx="7.3" cy="19.3" r="1.3" />
      <circle cx="16.7" cy="19.3" r="1.3" />
      <path d="M6.5 8.3h11" />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="4.6" r="1.8" />
      <path d="M12 8v4.2l4.3 2.1M12 12.2l-3.4 1.6" />
      <path d="M8.6 13.8A5.6 5.6 0 1 0 17 17.4" />
    </>
  ),

  // --- Управляющие иконки интерфейса ---
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M8.3 12.3 10.8 14.8 15.8 9.2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 21 19.2H3L12 4Z" />
      <path d="M12 10.3v3.6M12 16.7h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s6.5-6.1 6.5-11.2a6.5 6.5 0 1 0-13 0c0 5.1 6.5 11.2 6.5 11.2Z" />
      <circle cx="12" cy="10.2" r="2.3" />
    </>
  ),
  lock: (
    <>
      <rect x="5.2" y="10.5" width="13.6" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  thumbsUp: (
    <>
      <path d="M8 20.3H5.6a1 1 0 0 1-1-1v-7.6a1 1 0 0 1 1-1h2.4" />
      <path d="M8 11.7 11.3 4c1.5 0 2.5 1.2 2.2 2.6l-.8 3.6h4.6c1.3 0 2.2 1.3 1.8 2.5l-1.9 5.7a2 2 0 0 1-1.9 1.4H8v-8.1Z" />
    </>
  ),
  thumbsDown: (
    <>
      <path d="M16 3.7h2.4a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H16" />
      <path d="M16 12.3 12.7 20c-1.5 0-2.5-1.2-2.2-2.6l.8-3.6H6.7c-1.3 0-2.2-1.3-1.8-2.5l1.9-5.7A2 2 0 0 1 8.7 4.2H16v8.1Z" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.8 12 5l8 6.8" />
      <path d="M6 10.5v8.8c0 .4.3.7.7.7H17.3a.7.7 0 0 0 .7-.7v-8.8" />
    </>
  ),
  route: (
    <>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="18.5" cy="18" r="2" />
      <path d="M5.5 8v3a3 3 0 0 0 3 3h7a3 3 0 0 1 3 3v1" strokeDasharray="1.5 3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.3V12l3.2 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5 20c.6-4.2 3-6.4 7-6.4s6.4 2.2 7 6.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11v5.2M12 7.8h.01" />
    </>
  ),
  chat: (
    <>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" />
      <path d="M8.5 10.5h7M8.5 13.5h4" />
    </>
  ),
  send: (
    <>
      <path d="M20.5 3.5 10.5 13.5" />
      <path d="M20.5 3.5 14 20.5l-3.5-7-7-3.5 17-6.5Z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="M9 5.5 16 12l-7 6.5" />,
  chevronLeft: <path d="M15 5.5 8 12l7 6.5" />,
  external: (
    <>
      <path d="M9.5 5H19v9.5" />
      <path d="M19 5 10 14" />
      <path d="M14.5 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5" />
    </>
  ),
}

const CATEGORY_ALIASES = {
  family: 'family',
  relocation: 'housing',
  medical: 'medical',
  students: 'education',
  seniors: 'senior',
}

// Каталог мер и сценариев исторически хранит эмодзи в поле icon —
// подстраховка на случай не мигрированных данных, чтобы старое
// значение не рендерилось как знак вопроса, а падало на осмысленную
// иконку по умолчанию.
export function resolveIconName(rawIcon) {
  if (rawIcon && PATHS[rawIcon]) return rawIcon
  if (rawIcon && CATEGORY_ALIASES[rawIcon]) return CATEGORY_ALIASES[rawIcon]
  return 'documents'
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className = '', style }) {
  const key = resolveIconName(name)
  const content = PATHS[key]

  return (
    <svg
      className={`icon icon-${key}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {content}
    </svg>
  )
}

export default Icon
