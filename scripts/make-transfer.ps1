<#
.SYNOPSIS
Собирает один архив для переноса проекта на другую машину без GitHub.

.DESCRIPTION
Складывает вместе всё, что нужно второй машине:

  code.bundle          — история git целиком (все ветки и коммиты)
  private\             — .env с адресами и ключами, которого в репозитории нет
  data\vtbih-data-*.zip — слепок базы, загруженных файлов и модели OCR
  ЧИТАЙ-МЕНЯ.txt       — порядок действий на принимающей машине

Пользоваться так: собрали архив, перенесли флешкой, на второй машине
выполнили шаги из ЧИТАЙ-МЕНЯ.txt.

.PARAMETER Out
Куда положить архив. По умолчанию — папка backup в корне проекта.

.PARAMETER Documents
Папка с документами заказчика и коммерческими расчётами. Они лежат вне
проекта, потому что репозиторий публичный. Если путь указан, содержимое
поедет в архиве отдельной папкой private\documents.

.PARAMETER SkipData
Собрать только код и приватные файлы, без слепка базы.

.EXAMPLE
.\scripts\make-transfer.ps1

.EXAMPLE
.\scripts\make-transfer.ps1 -Documents D:\VTBIH-документы -Out E:\
#>
[CmdletBinding()]
param(
  [string]$Out,
  [string]$Documents,
  [switch]$SkipData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# git пишет прогресс в stderr; при $ErrorActionPreference = 'Stop'
# Windows PowerShell считает это ошибкой и обрывает скрипт.
function Invoke-Git {
  $ErrorActionPreference = 'Continue'
  $lines = & git @args 2>&1 | ForEach-Object { "$_" }
  return [pscustomobject]@{ Code = $LASTEXITCODE; Text = ($lines -join "`n") }
}

if (-not $Out) { $Out = Join-Path $root 'backup' }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$stage = Join-Path $Out "vtbih-transfer-$stamp"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

try {
  $dirty = (Invoke-Git status --porcelain).Text.Trim()
  if ($dirty) {
    Write-Host 'Внимание: есть незакоммиченные правки — в bundle они не попадут:' -ForegroundColor Yellow
    Write-Host $dirty
    Write-Host ''
  }

  Write-Host 'Упаковываю историю git…'
  $bundle = Invoke-Git bundle create (Join-Path $stage 'code.bundle') --all
  if ($bundle.Code -ne 0) { throw "git bundle не собрался: $($bundle.Text)" }

  # Через git не едет .env, а документы заказчика вообще лежат вне проекта:
  # репозиторий публичный, и выкладывать их туда нельзя.
  $privateDir = Join-Path $stage 'private'
  New-Item -ItemType Directory -Force -Path $privateDir | Out-Null
  $carried = @()
  if (Test-Path (Join-Path $root '.env')) {
    Copy-Item (Join-Path $root '.env') (Join-Path $privateDir 'env.txt')
    $carried += '.env (в архиве лежит как private\env.txt)'
  }
  if ($Documents) {
    if (-not (Test-Path -LiteralPath $Documents)) { throw "Папка с документами не найдена: $Documents" }
    $privateDocs = Join-Path $privateDir 'documents'
    New-Item -ItemType Directory -Force -Path $privateDocs | Out-Null
    # Именно -Path: -LiteralPath не раскрывает шаблон и копирование молча
    # не находит ни одного файла.
    Copy-Item -Path (Join-Path $Documents '*') -Destination $privateDocs -Recurse -Force
    $count = @(Get-ChildItem $privateDocs -Recurse -File).Count
    $carried += "документы из $Documents ($count файлов)"
  }

  if (-not $SkipData) {
    Write-Host 'Снимаю слепок данных…'
    $dataDir = Join-Path $stage 'data'
    & (Join-Path $PSScriptRoot 'backup-data.ps1') -Out $dataDir
    # Судим по результату, а не по $LASTEXITCODE: после дочернего скрипта там
    # остаётся код последней запущенной в нём внешней команды.
    if (-not (Get-ChildItem $dataDir -Filter 'vtbih-data-*.zip' -ErrorAction SilentlyContinue)) {
      throw 'Слепок данных не снялся'
    }
  }

  $head = (Invoke-Git log -1 --format='%h %s').Text
  @(
    'ПЕРЕНОС VTBIH НА ДРУГУЮ МАШИНУ'
    "собрано: $(Get-Date -Format 'yyyy-MM-dd HH:mm') на машине $env:COMPUTERNAME"
    "последний коммит: $head"
    ''
    'ЧТО ВНУТРИ'
    '  code.bundle           — вся история git'
    '  private\env.txt       — .env, которого в репозитории нет'
    '  private\documents\    — документы заказчика и расчёты (если вкладывали)'
    '  data\vtbih-data-*.zip — база, загруженные файлы, модель OCR'
    ''
    'ЕСЛИ ПРОЕКТ НА ПРИНИМАЮЩЕЙ МАШИНЕ УЖЕ ЕСТЬ'
    '  1. Скопируйте code.bundle рядом с проектом, затем в папке проекта:'
    '       git pull <путь>\code.bundle main'
    '  2. private\env.txt положите в корень проекта под именем .env'
    '     (существующий .env не затирайте, если в нём свои адреса — сверьте).'
    '     private\documents\ — НЕ в папку проекта: держите их рядом, на диске,'
    '     иначе они попадут в публичный репозиторий.'
    '  3. .\deploy.ps1'
    '  4. .\scripts\restore-data.ps1 -Archive <путь>\data\vtbih-data-<дата>.zip'
    ''
    'ЕСЛИ ПРОЕКТА ЕЩЁ НЕТ'
    '  1. git clone <путь>\code.bundle VTBIH'
    '  2. cd VTBIH, дальше пункты 2-4 выше'
    ''
    'ВАЖНО'
    '  Шаг 4 затирает базу принимающей машины. Если там есть нужные карточки,'
    '  сначала снимите её слепок: .\scripts\backup-data.ps1'
    ''
    '  Архив содержит документы заказчика, расчёт трудозатрат и хеши паролей.'
    '  Репозиторий на GitHub публичный, поэтому в него это не выкладывается.'
  ) | Set-Content -Path (Join-Path $stage 'ЧИТАЙ-МЕНЯ.txt') -Encoding utf8

  $zip = "$stage.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip

  $sizeMb = [Math]::Round((Get-Item $zip).Length / 1MB, 1)
  Write-Host ''
  Write-Host "Готово: $zip ($sizeMb МБ)" -ForegroundColor Green
  if ($carried.Count) {
    Write-Host 'Вне git перенесены:'
    $carried | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host 'Порядок действий на второй машине — в ЧИТАЙ-МЕНЯ.txt внутри архива.'
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
