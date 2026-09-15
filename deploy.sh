#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан .env из .env.example"
fi

echo "Сборка и запуск VTBIH (API + Docling)..."
docker compose up --build -d

echo
echo "Готово. Интерфейс: http://localhost:8080"
echo "Проверка LLM:    http://localhost:8080/api/health"
echo "Остановка:       docker compose down"
