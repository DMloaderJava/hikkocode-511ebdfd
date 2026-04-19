# Hikkocode - AI Code Builder

[![GitHub Repo](https://img.shields.io/badge/GitHub-DMloaderJava/hikkocode--511ebdfd-blue?logo=github)](https://github.com/DMloaderJava/hikkocode-511ebdfd)

## Описание

Hikkocode - это мощный AI-инструмент для создания кода с помощью автономных агентов. Включает файловый браузер, живой предпросмотр, панель задач агента, интеграцию с GitHub и Supabase.

## Основные возможности

- 🛠️ **AI Agent Builder**: Создавайте задачи для AI-агентов, генерируйте код автоматически
- 📁 **File Explorer**: Управление файлами проекта в реальном времени
- 👁️ **Live Preview**: Мгновенный предпросмотр изменений в браузере
- 💬 **Chat Panel**: Интерактивное общение с AI-агентами
- 📤 **GitHub Integration**: Публикация проектов напрямую в GitHub
- 🔄 **Version History**: История версий и откаты
- 🎨 **Shadcn UI**: Современный UI компоненты на TailwindCSS

## Быстрый старт

```bash
bun install
bun dev
```

Откройте [http://localhost:5173](http://localhost:5173)

## Структура проекта

```
src/
├── components/builder/     # Основные компоненты билдера
├── lib/agentApi.ts         # API для AI агентов
├── integrations/supabase/  # Бэкенд интеграция
└── pages/Builder.tsx       # Главная страница билдера
```

## Технологии

- React 18 + Vite + TypeScript
- Shadcn UI + TailwindCSS
- React Router + Tanstack Query
- Supabase (бэкенд)
- Bun (package manager)

## Разработка

```bash
# Линтинг
bun lint

# Тесты
bun test

# Билд
bun build
```

## Лицензия

MIT

