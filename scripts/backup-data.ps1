<#
.SYNOPSIS
Снимает переносимый слепок данных: база, загруженные файлы, кириллическая модель OCR.

.DESCRIPTION
Код возит git, а данные живут в томах Docker и через git не переносятся.
Скрипт складывает в один zip то, чего нет в репозитории:

  db.sql              — дамп PostgreSQL (проекты, записки, промпты, настройки, CRM, пользователи)
  uploads.tar.gz      — исходные файлы проектов и собранный по ним Markdown
  ocr-cyrillic.tar.gz — модель EasyOCR для русского текста (в образе конвертера её нет)

Полученный архив копируете на вторую машину и разворачиваете
через scripts\restore-data.ps1.

.PARAMETER Out
Куда положить архив. По умолчанию — папка backup в корне проекта (она в .gitignore).

.PARAMETER SkipOcrModel
Не вкладывать модель OCR: экономит около 13 МБ, если на второй машине она уже есть.

.EXAMPLE
.\scripts\backup-data.ps1

.EXAMPLE
.\scripts\backup-data.ps1 -Out E:\ -SkipOcrModel
#>
[CmdletBinding()]
param(
  [string]$Out,
  [switch]$SkipOcrModel
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$project = 'vtbih'
$pgVolume = "${project}_${project}-pg"
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

function Assert-Volume([string]$name) {
  if ((Invoke-Docker volume inspect $name).Code -ne 0) {
    throw "Тома $name нет. Поднимите систему: .\deploy.ps1"
  }
}

function To-DockerPath([string]$path) { return $path.Replace('\', '/') }

function Wait-Postgres {
  for ($i = 1; $i -le 30; $i++) {
    if ((Invoke-Docker compose exec -T postgres pg_isready -U vtbih -d vtbih).Code -eq 0) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

if (-not $Out) { $Out = Join-Path $root 'backup' }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$stage = Join-Path $Out "vtbih-data-$stamp"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
  Assert-Volume $pgVolume
  Assert-Volume $dataVolume

  Write-Host 'Поднимаю базу…'
  Invoke-Docker compose up -d postgres | Out-Null
  if (-not (Wait-Postgres)) { throw 'PostgreSQL не отвечает' }

  # Дамп пишем файлом внутри контейнера и забираем через docker compose cp:
  # перенаправление вывода pg_dump средствами PowerShell портит кодировку.
  Write-Host 'Снимаю базу…'
  $dump = Invoke-Docker compose exec -T postgres pg_dump -U vtbih -d vtbih --clean --if-exists -f /tmp/vtbih.sql
  if ($dump.Code -ne 0) { throw "pg_dump не отработал: $($dump.Text)" }
  $copy = Invoke-Docker compose cp postgres:/tmp/vtbih.sql (Join-Path $stage 'db.sql')
  if ($copy.Code -ne 0) { throw "Не удалось забрать дамп: $($copy.Text)" }
  Invoke-Docker compose exec -T postgres rm -f /tmp/vtbih.sql | Out-Null

  Write-Host 'Упаковываю загруженные файлы…'
  $tar = Invoke-Docker run --rm -v "${dataVolume}:/src:ro" -v "$(To-DockerPath $stage):/out" alpine `
    tar czf /out/uploads.tar.gz -C /src .
  if ($tar.Code -ne 0) { throw "Не удалось упаковать том с файлами: $($tar.Text)" }

  if (-not $SkipOcrModel) {
    Assert-Volume $modelVolume
    $probe = Invoke-Docker run --rm -v "${modelVolume}:/m:ro" alpine `
      sh -c 'test -f /m/EasyOcr/cyrillic_g2.pth && echo yes'
    if ($probe.Text -match 'yes') {
      Write-Host 'Упаковываю модель OCR…'
      $ocr = Invoke-Docker run --rm -v "${modelVolume}:/m:ro" -v "$(To-DockerPath $stage):/out" alpine `
        tar czf /out/ocr-cyrillic.tar.gz -C /m EasyOcr/cyrillic_g2.pth
      if ($ocr.Code -ne 0) { throw "Не удалось упаковать модель OCR: $($ocr.Text)" }
    } else {
      Write-Host 'Модели OCR в томе нет — пропускаю' -ForegroundColor Yellow
    }
  }

  $commit = & git rev-parse --short HEAD 2>&1 | Select-Object -First 1
  $version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
  @(
    'Слепок данных VTBIH'
    "снят: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    "машина: $env:COMPUTERNAME"
    "версия приложения: $version"
    "коммит кода: $commit"
    ''
    'Разворачивать на второй машине после git pull и deploy:'
    '  .\scripts\restore-data.ps1 -Archive <путь к этому zip>'
  ) | Set-Content -Path (Join-Path $stage 'MANIFEST.txt') -Encoding utf8

  $zip = "$stage.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip

  $sizeMb = [Math]::Round((Get-Item $zip).Length / 1MB, 1)
  Write-Host ''
  Write-Host "Готово: $zip ($sizeMb МБ)" -ForegroundColor Green
  Write-Host 'Перенесите архив на вторую машину и разверните: .\scripts\restore-data.ps1 -Archive <файл>'
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
