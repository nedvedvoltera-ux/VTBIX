#requires -Version 5
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example'
}

Write-Host 'Building and starting VTBIH (API + Docling)...'
docker compose up --build -d

Write-Host ''
Write-Host 'Ready. Open  http://localhost:8080'
Write-Host 'Health check http://localhost:8080/api/health'
Write-Host 'Stop with    docker compose down'
