<#
.SYNOPSIS
Разворачивает слепок данных, снятый scripts\backup-data.ps1, на этой машине.

.DESCRIPTION
Заменяет содержимое базы и папки загрузок тем, что лежит в архиве.
Данные, которые были на этой машине, будут потеряны — скрипт спросит
подтверждение, если не передан -Force.

Порядок на второй машине:
  1. git pull            — забрать код
  2. .\deploy.ps1        — собрать и поднять контейнеры
  3. .\scripts\restore-data.ps1 -Archive <файл>   — залить данные

.PARAMETER Archive
Zip-архив из backup-data.ps1. Если не указан — берётся самый свежий из папки backup.

.PARAMETER Force
Не спрашивать подтверждение на замену данных.

.EXAMPLE
.\scripts\restore-data.ps1 -Archive E:\vtbih-data-20260916-1640.zip
#>
[CmdletBinding()]
param(
  [string]$Archive,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$project = 'vtbih'
$dataVolume = "${project}_${project}-data"
$modelVolume = "${project}_${project}-docling-models"

# docker печатает служебные сообщения в stderr. При $ErrorActionPreference = 'Stop'
# Windows PowerShell считает их ошибкой и обрывает скрипт на ровном месте,
# поэтому все вызовы идут через эту обёртку.
function Invoke-Docker {
  # Без param-блока: иначе PowerShell пытается связать ключи вида -d
  # как параметры самой функции.
  $ErrorActionPreference = 'Continue'
  $lines = & docker @args 2>&1 | ForEach-Object { "$_" }
  return [pscustomobject]@{ Code = $LASTEXITCODE; Text = ($lines -join "`n") }
}

function To-DockerPath([string]$path) { return $path.Replace('\', '/') }

function Wait-Postgres {
  for ($i = 1; $i -le 30; $i++) {
    if ((Invoke-Docker compose exec -T postgres pg_isready -U vtbih -d vtbih).Code -eq 0) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

if (-not $Archive) {
  $latest = Get-ChildItem (Join-Path $root 'backup') -Filter 'vtbih-data-*.zip' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { throw 'Архив не найден. Укажите путь: -Archive <файл>' }
  $Archive = $latest.FullName
}
if (-not (Test-Path $Archive)) { throw "Архив не найден: $Archive" }
$Archive = (Resolve-Path $Archive).Path

# Распаковываем внутри проекта, а не в %TEMP%: путь профиля Windows может
# содержать русские буквы, и монтирование такой папки в контейнер срывается.
$stage = Join-Path $root "backup\.restore-$(Get-Date -Format 'HHmmss')"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
  Expand-Archive -Path $Archive -DestinationPath $stage -Force

  $manifest = Join-Path $stage 'MANIFEST.txt'
  if (Test-Path $manifest) {
    Write-Host '--- что разворачиваем ---'
    Get-Content $manifest | Write-Host
    Write-Host ''
  }

  $dump = Join-Path $stage 'db.sql'
  if (-not (Test-Path $dump)) { throw 'В архиве нет db.sql' }

  if (-not $Force) {
    $answer = Read-Host 'Текущие проекты и настройки на этой машине будут заменены. Продолжить? (да/нет)'
    if ($answer -notmatch '^(да|y|yes)$') { Write-Host 'Отменено.'; return }
  }

  Write-Host 'Поднимаю базу…'
  Invoke-Docker compose up -d postgres | Out-Null
  if (-not (Wait-Postgres)) { throw 'PostgreSQL не поднялся' }

  # API останавливаем, чтобы он не держал соединения и не пересоздавал схему
  # прямо во время заливки дампа.
  Invoke-Docker compose stop api | Out-Null

  Write-Host 'Чищу схему и заливаю дамп…'
  $wipe = Invoke-Docker compose exec -T postgres psql -U vtbih -d vtbih -v ON_ERROR_STOP=1 `
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  if ($wipe.Code -ne 0) { throw "Не удалось очистить схему: $($wipe.Text)" }

  $put = Invoke-Docker compose cp $dump postgres:/tmp/vtbih.sql
  if ($put.Code -ne 0) { throw "Не удалось передать дамп в контейнер: $($put.Text)" }
  $load = Invoke-Docker compose exec -T postgres psql -U vtbih -d vtbih -v ON_ERROR_STOP=1 -f /tmp/vtbih.sql
  if ($load.Code -ne 0) { throw "psql не смог применить дамп: $($load.Text)" }
  Invoke-Docker compose exec -T postgres rm -f /tmp/vtbih.sql | Out-Null

  $uploads = Join-Path $stage 'uploads.tar.gz'
  if (Test-Path $uploads) {
    Write-Host 'Восстанавливаю загруженные файлы…'
    $untar = Invoke-Docker run --rm -v "${dataVolume}:/dst" -v "$(To-DockerPath $stage):/in:ro" alpine `
      sh -c 'rm -rf /dst/uploads && tar xzf /in/uploads.tar.gz -C /dst'
    if ($untar.Code -ne 0) { throw "Не удалось развернуть файлы проектов: $($untar.Text)" }
  }

  $ocr = Join-Path $stage 'ocr-cyrillic.tar.gz'
  if (Test-Path $ocr) {
    Write-Host 'Ставлю модель OCR для русского текста…'
    # Том с моделями наполняется из образа при первом запуске контейнера,
    # поэтому сначала поднимаем конвертер, потом кладём кириллическую модель.
    Invoke-Docker compose up -d docling | Out-Null
    $unocr = Invoke-Docker run --rm -v "${modelVolume}:/m" -v "$(To-DockerPath $stage):/in:ro" alpine `
      tar xzf /in/ocr-cyrillic.tar.gz -C /m
    if ($unocr.Code -ne 0) { Write-Host "Модель OCR не встала: $($unocr.Text)" -ForegroundColor Yellow }
  }

  Write-Host 'Поднимаю приложение…'
  Invoke-Docker compose up -d | Out-Null

  $ok = $false
  for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      if (Invoke-RestMethod -Uri 'http://localhost:8080/api/health' -TimeoutSec 10) { $ok = $true; break }
    } catch { }
  }

  Write-Host ''
  if ($ok) {
    Write-Host 'Готово. Откройте http://localhost:8080 — проекты должны быть на месте.' -ForegroundColor Green
  } else {
    Write-Host 'Данные залиты, но API не ответил. Смотрите: docker compose logs api' -ForegroundColor Yellow
  }
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
