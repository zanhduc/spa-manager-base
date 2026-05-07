param(
  [string]$HealthUrl = "http://127.0.0.1:15321/health",
  [string]$PrintersUrl = "http://127.0.0.1:15321/printers",
  [string]$ServiceName = "SoanHangPrintBridge"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[INFO] Kiem tra service..." -ForegroundColor Cyan
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $svc) {
  Write-Host "[FAIL] Khong tim thay service $ServiceName" -ForegroundColor Red
  exit 1
}
Write-Host "[OK] Service status: $($svc.Status)" -ForegroundColor Green

Write-Host "[INFO] Kiem tra endpoint /health..." -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 4
  Write-Host "[OK] Health: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
  Write-Host "[FAIL] /health loi: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "[INFO] Kiem tra endpoint /printers..." -ForegroundColor Cyan
try {
  $data = Invoke-RestMethod -Uri $PrintersUrl -Method Get -TimeoutSec 4
  $list = @()
  if ($data -is [System.Array]) {
    $list = $data
  } elseif ($data.printers) {
    $list = @($data.printers)
  }
  Write-Host "[OK] Printers count: $($list.Count)" -ForegroundColor Green
  if ($list.Count -gt 0) {
    $list | ForEach-Object { Write-Host " - $_" }
  }
} catch {
  Write-Host "[FAIL] /printers loi: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "[OK] Bridge san sang." -ForegroundColor Green
