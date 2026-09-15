# VTBIH — аналитика концессий

Интерфейс финансового отдела + API. Документ → **Docling (Markdown)** → офисная **Qwen** → поля и метрики карточки.

## Деплой в офисе (Docker)

На машине в LAN `192.168.215.74`:

```bash
git pull
copy .env.example .env
.\deploy.ps1
```

Linux:

```bash
git pull
cp .env.example .env
chmod +x deploy.sh
./deploy.sh
```

Или без скрипта: `docker compose up --build -d`.

- Приложение: http://localhost:8080
- Проверка Qwen/Docling: http://localhost:8080/api/health  
  `pipeline.llm.ok` должен быть `true`, модель `Qwen/Qwen3.5-35B-A3B-FP8`.

Первый запуск качает образ Docling (несколько гигабайт) — это нормально. Данные SQLite и загруженные файлы живут в томе `vtbih-data`.

Остановка: `docker compose down`. Том с данными не удаляется.

## Сеть

```
SUMMARY_API_BASE_URL=http://192.168.215.74:9080/v1
SUMMARY_MODEL=Qwen/Qwen3.5-35B-A3B-FP8
```

Qwen снаружи офиса не отвечает. Если ключ появится — пропишите `SUMMARY_API_KEY` в `.env`.

## Пайплайн

1. Загрузка xlsx / pdf / docx.
2. Docling переводит файл в Markdown (сложные таблицы сохраняются).
3. Markdown уходит в Qwen (`/v1/chat/completions`).
4. Модель в реальном времени заполняет карточку и метрики из мастера промпта.

## Разработка без Docker

```bash
npm install
docker run --rm -p 5001:5001 ghcr.io/docling-project/docling-serve:latest
# в .env: DOCLING_URL=http://localhost:5001
npm run dev:api
npm run dev
```

UI: http://localhost:5173 (проксирует `/api` на 8080).

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/health` | статус, доступность Docling и Qwen |
| GET/PUT | `/api/projects`, `/api/projects/:id` | карточки |
| POST | `/api/projects/:id/file` | файл → Markdown → извлечение |
| POST | `/api/projects/:id/analyze` | повторный разбор последнего файла |
| GET | `/api/jobs/:id/stream` | SSE прогресса |
| GET | `/api/projects/:id/jobs` | история обработок |
| GET/PUT | `/api/prompt` | мастер промпта |
