#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

DOCLING_IMAGE='ghcr.io/docling-project/docling-serve:latest'

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан .env из .env.example"
fi

# Устройство разбора документов. По умолчанию процессор: наличие видеокарты
# НЕ означает, что на ней будет быстрее. Замер на RTX 3080 Ti: матричное
# умножение в 48 раз быстрее процессора, а реальный PDF — 845 с на GPU
# против 420 с на 24-ядерном процессоре, потому что сборка таблиц в docling
# на GPU не ускоряется. Проверять нужно замером на реальном документе.
device_mode() {
  if [ -n "${VTBIH_DEVICE:-}" ]; then
    echo "${VTBIH_DEVICE}" | tr '[:upper:]' '[:lower:]' | xargs
    return
  fi
  local line
  line=$(grep -E '^[[:space:]]*VTBIH_DEVICE[[:space:]]*=' .env 2>/dev/null | tail -n1 || true)
  if [ -n "$line" ]; then
    echo "${line#*=}" | tr -d '"' | tr '[:upper:]' '[:lower:]' | xargs
    return
  fi
  echo cpu
}

gpu_visible() {
  if ! command -v nvidia-smi >/dev/null 2>&1; then
    echo "  nvidia-smi не найден — дискретной NVIDIA нет"
    return 1
  fi
  echo "  проверяю, доедет ли карта до контейнера..."
  local out
  out=$(docker run --rm -i --gpus all "$DOCLING_IMAGE" python - < scripts/gpu-check.py 2>/dev/null || true)
  if [ -z "$out" ]; then
    echo "  Docker не отдаёт карту контейнеру"
    return 1
  fi
  local device speedup
  device=$(echo "$out" | awk '/^DEVICE /{ $1=""; sub(/^ /,""); print }')
  speedup=$(echo "$out" | awk '/^SPEEDUP /{ print $2 }')
  [ -n "$device" ] && echo "  карта: $device"
  [ -n "$speedup" ] && echo "  справочно, матричное умножение: x$speedup"
  if ! echo "$out" | grep -q '^AVAILABLE 1$'; then
    echo "  карта в контейнере не считает"
    return 1
  fi
  return 0
}

MODE=$(device_mode)
echo "Устройство разбора документов: запрошено «$MODE»"

USE_GPU=0
if [ "$MODE" = "gpu" ]; then
  if gpu_visible; then USE_GPU=1; else echo "  откатываюсь на процессор"; fi
elif [ "$MODE" != "cpu" ]; then
  echo "  значение «$MODE» не распознано, использую процессор"
fi

FILES=(-f docker-compose.yml)
if [ "$USE_GPU" -eq 1 ]; then
  FILES+=(-f docker-compose.gpu.yml)
  echo "Итог: GPU (CUDA)"
else
  if [ -z "${DOCLING_NUM_THREADS:-}" ]; then
    CORES=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)
    [ "$CORES" -gt 8 ] && CORES=8
    [ "$CORES" -lt 2 ] && CORES=2
    export DOCLING_NUM_THREADS="$CORES"
  fi
  echo "Итог: процессор, потоков $DOCLING_NUM_THREADS"
fi

echo
echo "Сборка и запуск VTBIH (API + PostgreSQL + Docling)..."
docker compose "${FILES[@]}" up --build -d

echo
echo "Готово. Интерфейс:  http://localhost:8080"
echo "Проверка служб:     http://localhost:8080/api/health"
echo "Остановка:          docker compose down"
echo
echo 'Сменить устройство: VTBIH_DEVICE=gpu в .env (или VTBIH_DEVICE=gpu ./deploy.sh)'
