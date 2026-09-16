# VTBIH — аналитика концессий

Интерфейс финансового отдела + API. Документ → **Docling (Markdown)** → офисная **Qwen** → поля и метрики карточки.

## Документация

| Документ | Для кого | Word |
| --- | --- | --- |
| [Руководство пользователя](docs/user-guide.md) | сотрудники финотдела: загрузка, карточка, рейтинг, CRM, инфоповоды | `docs/VTBIH-Руководство-пользователя.docx` |
| [Развёртывание и эксплуатация](docs/deployment.md) | администратор: установка, `.env`, бэкап, обновление, диагностика | `docs/VTBIH-Развёртывание.docx` |
| [Архитектура](docs/architecture.md) | разработчик: компоненты, схемы, модель данных, ограничения | `docs/VTBIH-Архитектура.docx` |

Markdown — источник. Файлы `.docx` собираются из него скриптом `python scripts/md2docx.py`; схемы подставляются картинками из `docs/assets`. После правки документации пересоберите Word-версии, иначе они разойдутся с исходником.

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

Первый запуск качает образ Docling (15,6 ГБ) — это нормально. Карточки и настройки живут в PostgreSQL (том `vtbih-pg`), загруженные файлы — в `vtbih-data`. Старый файл `vtbih.db` больше не используется.

**Обязательный шаг после первой установки** — догрузить кириллическую модель OCR, иначе русские сканы падают на этапе Docling:

```bash
docker compose exec docling python -c "import easyocr; easyocr.Reader(['ru','en'], model_storage_directory='/opt/app-root/src/.cache/docling/models/EasyOcr', download_enabled=True, gpu=False)"
```

Модель ложится в том `vtbih-docling-models` и переживает обновления. Подробности — в [документации по развёртыванию](docs/deployment.md#шаг-3-кириллическая-модель-ocr-обязательно).

Разбор документов по умолчанию идёт **на процессоре**. GPU включается через `VTBIH_DEVICE=gpu` в `.env`, но сначала проверьте замером — карта ускоряет не весь конвейер, и на 24-ядерной машине процессор может выиграть:

```powershell
.\scripts\bench-docling.ps1 -File "путь\к\скану.pdf" -Apply
```

Остановка: `docker compose down`. Тома с данными не удаляются.

### Перенос на другую машину

Код едет через git, данные — нет: база, загруженные файлы и модель OCR лежат в томах Docker. Снимите слепок на первой машине и разверните на второй:

```powershell
.\scripts\backup-data.ps1                              # получится backup\vtbih-data-<дата>.zip
# перенесли архив, дальше на второй машине:
git pull
.\deploy.ps1
.\scripts\restore-data.ps1 -Archive <путь к zip>
```

Восстановление затирает базу принимающей машины, поэтому спрашивает подтверждение.

Материалы заказчика и коммерческие расчёты хранятся вне папки проекта: репозиторий публичный. Когда нужно перевезти проект целиком и без GitHub, `.\scripts\make-transfer.ps1` кладёт в один архив историю git, `.env` и слепок данных, а документы добавляются по желанию через `-Documents <путь>`. Подробности — в [документации по развёртыванию](docs/deployment.md#7-резервное-копирование-и-перенос-на-другую-машину).

## Сеть

```
SUMMARY_API_BASE_URL=http://192.168.215.74:9080/v1
SUMMARY_MODEL=Qwen/Qwen3.5-35B-A3B-FP8
```

Qwen снаружи офиса не отвечает. Если ключ появится — пропишите `SUMMARY_API_KEY` в `.env`.

## Пайплайн

Два независимых этапа — модель после конвертации **не** запускается сама.

1. `POST /api/projects/:id/file` — загрузка xlsx / pdf / docx / csv / md, до 40 МБ на файл.
2. Docling переводит каждый файл в Markdown (сложные таблицы сохраняются), результат лежит рядом как `<файл>.md`.
3. `POST /api/projects/:id/analyze` — по кнопке «Пересобрать поля» весь Markdown склеивается и уходит в Qwen (`/v1/chat/completions`, `stream=true`).
4. Модель в реальном времени заполняет карточку и метрики по настройкам мастера промпта; частичный JSON починяется на лету, поэтому поля появляются по мере ответа.

Прогресс обоих этапов идёт в браузер через SSE `GET /api/jobs/:id/stream`. Подробно — в [архитектуре](docs/architecture.md#5-конвейер-обработки-документа).

## Разработка без Docker

```bash
npm install
docker run --rm -p 5001:5001 ghcr.io/docling-project/docling-serve:latest
# в .env: DOCLING_URL=http://localhost:5001
npm run dev:api
npm run dev
```

UI: http://localhost:5173 (проксирует `/api` на 8080).

## Тесты

```bash
npm test          # 423 теста, Vitest
npm run test:watch
```

Тесты лежат в `tests/` (13 файлов на `server/`, 9 на `src/`), вне `src/` — чтобы не попадать под `include` в `tsconfig` и не ломать `npm run build`.

## API

Основное. Полный перечень 61 маршрута — в [справочнике API](docs/architecture.md#приложение-справочник-http-api).

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/health` | статус, доступность Docling и Qwen |
| GET/PUT | `/api/projects`, `/api/projects/:id` | карточки |
| POST | `/api/projects/:id/file` | файл → Markdown |
| POST | `/api/projects/:id/analyze` | разбор всех Markdown моделью |
| GET | `/api/jobs/:id/stream` | SSE прогресса |
| GET | `/api/projects/:id/markdown` | склеенный Markdown проекта |
| GET | `/api/projects/:id/jobs` | история обработок |
| GET/PUT | `/api/prompt` | мастер промпта |
| GET/PUT | `/api/settings/llm` | выбор модели, только администратор |
| GET/PUT | `/api/media/config`, `POST /api/media/run` | мониторинг СМИ |
| GET/POST | `/api/crm/deals` | CRM |
