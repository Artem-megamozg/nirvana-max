import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ============================================================
// Vite config для Nirvana MAX Mini App
// ============================================================
// base: '/app/' — критически важно.
// Приложение будет открываться по адресу
// https://litvinskiy-developer.online/app/
// Без этой настройки Vite генерирует пути к ассетам от корня
// (/assets/...) и браузер получает 404 → белый экран.
// ============================================================
export default defineConfig({
  plugins: [react()],

  // Базовый путь для сборки и dev-сервера
  base: '/app/',

  build: {
    // Куда класть собранные файлы (относительно frontend/)
    outDir: '../web',
    // Очищать папку web/ перед сборкой
    emptyOutDir: true,
  },
})
