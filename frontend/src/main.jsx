import React from 'react'
import ReactDOM from 'react-dom/client'
import { MaxUI } from '@maxhub/max-ui'
import '@maxhub/max-ui/dist/styles.css'
import App from './App.jsx'

// MaxUI — провайдер библиотеки MAX UI.
// Он автоматически определяет платформу (ios/android) и тему (light/dark).
// resetBody сбрасывает margin у body, чтобы не писать глобальный CSS.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MaxUI resetBody>
      <App />
    </MaxUI>
  </React.StrictMode>,
)
