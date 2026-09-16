<#
.SYNOPSIS
Замеряет, на чём быстрее разбирается документ: на процессоре или на GPU.

.DESCRIPTION
Наличие видеокарты не означает, что на ней будет быстрее. У docling часть
конвейера (сборка таблиц) на GPU не ускоряется, а под WSL2 карта делится
с рабочим столом. На домашней машине с RTX 3080 Ti замер дал 845 с на GPU
против 420 с на 24-ядерном процессоре при одинаковом результате разбора.

Скрипт по очереди поднимает docling на каждом устройстве, прогоняет один
и тот же файл и печатает время. Берите документ, похожий на рабочий:
скан PDF грузит OCR, а «цифровой» PDF или xlsx — почти нет.

.PARAMETER File
Документ для замера. Обязателен.

.PARAMETER Apply
Записать победителя в .env как VTBIH_DEVICE, чтобы deploy подхватывал его сам.

.EXAMPLE
.\scripts\bench-docling.ps1 -File "C:\договоры\скан.pdf" -Apply
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$File,
  [switch]$Apply,
  [int]$TimeoutMin = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$api = 'http://localhost:8080'
$DoclingImage = 'ghcr.io/docling-project/docling-serve:latest'

if (-not (Test-Path $File)) { throw "Файл не найден: $File" }
$File = (Resolve-Path $File).Path
$sizeMb = [Math]::Round((Get-Item $File).Length / 1MB, 1)

function Get-CurrentMode {
  $line = Get-Content "$root\.env" -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^\s*VTBIH_DEVICE\s*=' } | Select-Object -Last 1
  if ($line) { return ($line -split '=', 2)[1].Trim().Trim('"').ToLower() }
  return 'cpu'
}

function Test-GpuVisible {
  if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) { return $false }
  $out = (Get-Content -Raw "$root\scripts\gpu-check.py" |
    docker run --rm -i --gpus all $DoclingImage python - 2>$null)
  return [bool]($out | Where-Object { $_ -match '^AVAILABLE\s+1$' })
}

function Start-Docling([string]$device) {
  $files = @('-f', 'docker-compose.yml')
  if ($device -eq 'gpu') {
    $files += @('-f', 'docker-compose.gpu.yml')
  } else {
    $cores = [Math]::Max(2, [Math]::Min(8, (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors))
    $env:DOCLING_NUM_THREADS = "$cores"
  }
  docker compose @files up -d --force-recreate docling | Out-Null

  # ждём, пока конвертер начнёт отвечать
  for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 2
    try {
      $h = Invoke-RestMethod -Uri "$api/api/health" -TimeoutSec 10
      if ($h.pipeline.docling.ok) { return }
    } catch { }
  }
  throw "Конвертер не поднялся на устройстве $device"
}

function Measure-Conversion([string]$device) {
  $body = @{ name = "Замер $device"; industry = 'transport'; country = 'Россия' } | ConvertTo-Json -Compress
  $project = Invoke-RestMethod -Uri "$api/api/projects" -Method Post `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
  $id = $project.id

  $watch = [Diagnostics.Stopwatch]::StartNew()
  & curl.exe -s -o NUL -X POST "$api/api/projects/$id/file" -F "file=@`"$File`"" | Out-Null

  $deadline = (Get-Date).AddMinutes($TimeoutMin)
  $result = [ordered]@{ device = $device; seconds = $null; chars = $null; error = $null }

  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    $p = Invoke-RestMethod -Uri "$api/api/projects/$id" -TimeoutSec 20
    $doc = $p.documents[0]
    if ($doc.markdownReady -eq $true) {
      $result.seconds = [Math]::Round($watch.Elapsed.TotalSeconds)
      $result.chars = $doc.markdownChars
      break
    }
    if ($p.status -eq 'error') {
      $result.error = $p.pipelineMessage
      break
    }
    Write-Host ("    {0,5:N0} с — {1}" -f $watch.Elapsed.TotalSeconds, $doc.status)
  }
  if (-not $result.seconds -and -not $result.error) { $result.error = 'не уложился в отведённое время' }

  try { Invoke-RestMethod -Uri "$api/api/projects/$id" -Method Delete -TimeoutSec 20 | Out-Null } catch { }
  return [pscustomobject]$result
}

$initial = Get-CurrentMode
Write-Host "Замер разбора: $(Split-Path -Leaf $File), $sizeMb МБ"
Write-Host "Текущая настройка: $initial"
Write-Host ''

$devices = @('cpu')
if (Test-GpuVisible) {
  $devices += 'gpu'
} else {
  Write-Host 'GPU в контейнере недоступен — замерю только процессор' -ForegroundColor Yellow
}

$results = @()
foreach ($device in $devices) {
  Write-Host "--- $device ---"
  Start-Docling $device
  $results += Measure-Conversion $device
}

Write-Host ''
Write-Host '=== Результат ==='
$results | Format-Table -AutoSize device, seconds, chars, error

$ok = $results | Where-Object { $_.seconds }
if ($ok.Count -eq 0) {
  Write-Host 'Ни один прогон не удался — смотрите docker compose logs docling' -ForegroundColor Red
} else {
  $best = ($ok | Sort-Object seconds)[0]
  Write-Host "Быстрее: $($best.device) — $($best.seconds) с" -ForegroundColor Green
  if ($ok.Count -eq 2) {
    $slow = ($ok | Sort-Object seconds)[1]
    $gain = [Math]::Round($slow.seconds / $best.seconds, 2)
    Write-Host "Разница: x$gain против $($slow.device) ($($slow.seconds) с)"
  }

  if ($Apply) {
    $envPath = "$root\.env"
    $lines = @(Get-Content $envPath -ErrorAction SilentlyContinue)
    $lines = $lines | Where-Object { $_ -notmatch '^\s*VTBIH_DEVICE\s*=' }
    $lines += "VTBIH_DEVICE=$($best.device)"
    Set-Content -Path $envPath -Value $lines -Encoding utf8
    Write-Host "В .env записано VTBIH_DEVICE=$($best.device)"
    $initial = $best.device
  }
}

Write-Host ''
Write-Host "Возвращаю конвертер на «$initial»"
Start-Docling $initial
Write-Host 'Готово.'
