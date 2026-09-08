# VTBIH — аналитика концессий

Интерфейс финансового отдела + API для хранения проектов, загруженных файлов и результатов обработки LLM.

## Запуск для разработки

```bash
npm install
npm run dev:api
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:8080/api/health  
Vite проксирует `/api` на бэкенд.

## Хранение после LLM

`POST /api/projects/:id/file` принимает файл, кладёт его в `data/uploads/`, создаёт запись в `llm_jobs` и сохраняет извлечённые поля в карточку проекта.

Пока стоит эвристический разбор (имя файла + пояснения). Реальную модель подключают через:

```
LLM_API_URL=https://...
LLM_API_KEY=...
```

Контракт ответа: `{ extracted: { name, industry, country, region, budget }, ... }`.

## Продакшен

```bash
npm run build
npm start
```

Или Docker:

```bash
docker compose up --build
```

Откройте http://localhost:8080 — API отдаёт и собранный фронт.

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/health` | статус |
| GET/PUT | `/api/projects`, `/api/projects/:id` | карточки |
| POST | `/api/projects/:id/file` | файл + LLM-разбор |
| GET | `/api/projects/:id/jobs` | история обработок |
| GET/PUT | `/api/prompt` | мастер промпта |
