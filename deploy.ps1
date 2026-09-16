#requires -Version 5
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$DoclingImage = 'ghcr.io/docling-project/docling-serve:latest'

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Создан .env из .env.example'
}

# Устройство разбора документов. По умолчанию процессор: наличие видеокарты
# НЕ означает, что на ней будет быстрее. Замер на RTX 3080 Ti: матричное
# умножение в 48 раз быстрее процессора, а реальный PDF — 845 с на GPU
# против 420 с на 24-ядерном процессоре, потому что сборка таблиц в docling
# на GPU не ускоряется. Какое устройство выигрывает на конкретной машине,
# показывает замер: scripts\bench-docling.ps1 -File <документ> -Apply
function Get-DeviceMode {
  if ($env:VTBIH_DEVICE) { return $env:VTBIH_DEVICE.Trim().ToLower() }
  $line = Get-Content '.env' -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^\s*VTBIH_DEVICE\s*=' } |
    Select-Object -Last 1
  if ($line) { return ($line -split '=', 2)[1].Trim().Trim('"').ToLower() }
  return 'cpu'
}

function Test-GpuVisible {
  if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    Write-Host '  nvidia-smi не найден — дискретной NVIDIA нет'
    return $false
  }
  Write-Host '  проверяю, доедет ли карта до контейнера...'
  $lines = (Get-Content -Raw "$PSScriptRoot\scripts\gpu-check.py" |
    docker run --rm -i --gpus all $DoclingImage python - 2>$null)
  if (-not $lines) {
    Write-Host '  Docker не отдаёт карту контейнеру'
    return $false
  }
  $ok = $false
  foreach ($line in $lines) {
    if ($line -match '^AVAILABLE\s+1$') { $ok = $true }
    if ($line -match '^DEVICE\s+(.+)$') { Write-Host "  карта: $($Matches[1])" }
    if ($line -match '^SPEEDUP\s+([\d.]+)$') { Write-Host "  справочно, матричное умножение: x$($Matches[1])" }
  }
  if (-not $ok) { Write-Host '  карта в контейнере не считает' }
  return $ok
}

$mode = Get-DeviceMode
Write-Host "Устройство разбора документов: запрошено «$mode»"

$useGpu = $false
if ($mode -eq 'gpu') {
  $useGpu = Test-GpuVisible
  if (-not $useGpu) { Write-Host '  откатываюсь на процессор' -ForegroundColor Yellow }
} elseif ($mode -ne 'cpu') {
  Write-Host "  значение «$mode» не распознано, использую процессор" -ForegroundColor Yellow
}

$files = @('-f', 'docker-compose.yml')
if ($useGpu) {
  $files += @('-f', 'docker-compose.gpu.yml')
  Write-Host 'Итог: GPU (CUDA)' -ForegroundColor Green
} else {
  if (-not $env:DOCLING_NUM_THREADS) {
    $cores = [Math]::Max(2, [Math]::Min(8, (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors))
    $env:DOCLING_NUM_THREADS = "$cores"
  }
  Write-Host "Итог: процессор, потоков $($env:DOCLING_NUM_THREADS)" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Сборка и запуск VTBIH (API + PostgreSQL + Docling)...'
docker compose @files up --build -d

Write-Host ''
Write-Host 'Готово. Интерфейс:  http://localhost:8080'
Write-Host 'Проверка служб:     http://localhost:8080/api/health'
Write-Host 'Остановка:          docker compose down'
Write-Host ''
Write-Host 'Сменить устройство:  VTBIH_DEVICE=gpu в .env (или $env:VTBIH_DEVICE перед запуском)'
Write-Host 'Что быстрее именно здесь: .\scripts\bench-docling.ps1 -File <документ> -Apply'
