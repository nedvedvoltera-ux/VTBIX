#requires -Version 5
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Создан .env из .env.example'
}

Write-Host 'Сборка и запуск VTBIH (API + Docling)...'
docker compose up --build -d

Write-Host ''
Write-Host 'Готово. Интерфейс: http://localhost:8080'
Write-Host 'Проверка LLM:    http://localhost:8080/api/health'
Write-Host 'Остановка:       docker compose down'
