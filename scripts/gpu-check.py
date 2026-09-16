"""Проверка, видит ли контейнер видеокарту и считает ли на ней.

Запускается скриптами deploy.ps1 / deploy.sh внутри образа docling:
    docker run --rm -i --gpus all <образ> python - < scripts/gpu-check.py

Печатает:
    AVAILABLE 1|0     — можно ли вообще считать на карте
    DEVICE <имя>      — какая карта
    SPEEDUP <число>   — во сколько раз быстрее процессора на матричном умножении

ВАЖНО про SPEEDUP: это справочная величина, по ней НЕЛЬЗЯ решать,
включать ли GPU для разбора документов. На домашней машине с RTX 3080 Ti
матричное умножение шло в 48 раз быстрее процессора, а тот же PDF
конвертировался 845 с на GPU против 420 с на 24-ядерном процессоре:
у docling значительная часть конвейера (сборка таблиц) на GPU не ускоряется.
Решение принимается замером на реальном документе — scripts/bench-docling.ps1.
"""

import sys
import time

N = 4096
ROUNDS = 3


def unavailable() -> None:
    print("AVAILABLE 0")
    sys.exit(0)


try:
    import torch
except Exception:
    unavailable()

if not torch.cuda.is_available():
    unavailable()

print("AVAILABLE 1")
print(f"DEVICE {torch.cuda.get_device_name(0)}")

try:
    a = torch.randn(N, N)
    b = torch.randn(N, N)

    a @ b  # прогрев процессора
    start = time.time()
    for _ in range(ROUNDS):
        a @ b
    cpu = (time.time() - start) / ROUNDS

    a_gpu, b_gpu = a.cuda(), b.cuda()
    a_gpu @ b_gpu  # прогрев: первый запуск включает инициализацию cuBLAS
    torch.cuda.synchronize()
    start = time.time()
    for _ in range(ROUNDS):
        a_gpu @ b_gpu
    torch.cuda.synchronize()
    gpu = (time.time() - start) / ROUNDS

    if gpu > 0:
        print(f"SPEEDUP {cpu / gpu:.1f}")
except Exception as exc:
    print(f"ERROR {exc}", file=sys.stderr)
