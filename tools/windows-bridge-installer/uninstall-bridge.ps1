param(
  [string]$ServiceName = "SoanHangPrintBridge",
  [string]$InstallDir = "$env:ProgramData\SoanHangPrintBridge",
  [switch]$PurgeFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw "Vui long mo PowerShell bang quyen Administrator roi chay lai."
  }
}

try {
  Ensure-Admin
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -ne "Stopped") {
      Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    & sc.exe delete $ServiceName | Out-Null
    Write-Host "[OK] Da go service $ServiceName" -ForegroundColor Green
  } else {
    Write-Host "[INFO] Service khong ton tai: $ServiceName" -ForegroundColor Yellow
  }

  Remove-NetFirewallRule -DisplayName "SoanHang Print Bridge 15321" -ErrorAction SilentlyContinue | Out-Null
  Write-Host "[OK] Da xoa firewall rule (neu co)." -ForegroundColor Green

  if ($PurgeFiles -and (Test-Path -LiteralPath $InstallDir)) {
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
    Write-Host "[OK] Da xoa file cai dat: $InstallDir" -ForegroundColor Green
  }
} catch {
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
