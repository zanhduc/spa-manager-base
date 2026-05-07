param(
  [string]$BridgeExePath = "",
  [string]$BridgeExeName = "soanhang-print-bridge.exe",
  [string]$InstallDir = "$env:ProgramData\SoanHangPrintBridge",
  [string]$ServiceName = "SoanHangPrintBridge",
  [string]$DisplayName = "SoanHang Print Bridge",
  [string]$BridgeArgs = "--port 15321",
  [string]$HealthUrl = "http://127.0.0.1:15321/health",
  [string]$PrintersUrl = "http://127.0.0.1:15321/printers",
  [switch]$AllowLan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Ensure-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw "Vui long mo PowerShell bang quyen Administrator roi chay lai."
  }
}

function Resolve-BridgeExe {
  param([string]$InputPath, [string]$ExeName)
  if ($InputPath -and (Test-Path -LiteralPath $InputPath)) {
    return (Resolve-Path -LiteralPath $InputPath).Path
  }
  $scriptDir = Split-Path -Parent $PSCommandPath
  $candidate = Join-Path $scriptDir $ExeName
  if (Test-Path -LiteralPath $candidate) {
    return (Resolve-Path -LiteralPath $candidate).Path
  }
  throw "Khong tim thay bridge exe. Dat file '$ExeName' cung thu muc voi script, hoac truyen -BridgeExePath."
}

function Remove-ServiceIfExists {
  param([string]$Name)
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($null -eq $service) {
    return
  }
  Write-Step "Dich vu $Name da ton tai, tien hanh cap nhat."
  if ($service.Status -ne "Stopped") {
    Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  & sc.exe delete $Name | Out-Null
  Start-Sleep -Seconds 2
}

function Install-Service {
  param(
    [string]$Name,
    [string]$SvcDisplayName,
    [string]$ExePath,
    [string]$Args
  )
  $binPath = "`"$ExePath`" $Args".Trim()
  & sc.exe create $Name binPath= $binPath start= auto DisplayName= "`"$SvcDisplayName`"" | Out-Null
  & sc.exe description $Name "Bridge in tu dong cho Soan Hang - Cong No" | Out-Null
}

function Ensure-FirewallRule {
  param(
    [string]$Name,
    [switch]$AllowLan
  )
  $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
  if ($existing) {
    Remove-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue | Out-Null
  }
  if ($AllowLan) {
    New-NetFirewallRule -DisplayName $Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort 15321 | Out-Null
    Write-Ok "Da mo firewall port 15321 (LAN duoc phep truy cap)."
    return
  }
  New-NetFirewallRule -DisplayName $Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort 15321 -RemoteAddress LocalSubnet | Out-Null
  Write-Ok "Da mo firewall port 15321 cho mang noi bo."
}

function Test-Bridge {
  param([string]$Url, [string]$Printers)
  $health = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 4
  Write-Ok "Health OK: $($health | ConvertTo-Json -Compress)"
  try {
    $data = Invoke-RestMethod -Uri $Printers -Method Get -TimeoutSec 4
    $list = @()
    if ($data -is [System.Array]) {
      $list = $data
    } elseif ($data.printers) {
      $list = @($data.printers)
    }
    Write-Ok "Printers: $($list.Count)"
    if ($list.Count -gt 0) {
      $top = $list | Select-Object -First 3
      Write-Host ("       " + ($top -join ", "))
    }
  } catch {
    Write-Warn "Khong doc duoc /printers: $($_.Exception.Message)"
  }
}

try {
  Ensure-Admin
  $sourceExe = Resolve-BridgeExe -InputPath $BridgeExePath -ExeName $BridgeExeName
  $targetExe = Join-Path $InstallDir $BridgeExeName

  Write-Step "Tao thu muc cai dat: $InstallDir"
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  Write-Step "Copy bridge exe vao thu muc cai dat"
  Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force

  Remove-ServiceIfExists -Name $ServiceName
  Write-Step "Tao Windows service: $ServiceName"
  Install-Service -Name $ServiceName -SvcDisplayName $DisplayName -ExePath $targetExe -Args $BridgeArgs

  Write-Step "Khoi dong service"
  Start-Service -Name $ServiceName
  Start-Sleep -Seconds 3

  Ensure-FirewallRule -Name "SoanHang Print Bridge 15321" -AllowLan:$AllowLan
  Test-Bridge -Url $HealthUrl -Printers $PrintersUrl

  Write-Host ""
  Write-Ok "Hoan tat cai dat bridge."
  Write-Host "App web se tu dong dung endpoint: http://127.0.0.1:15321"
  Write-Host "Neu bridge cua ban khong dung tham so '--port 15321', chay lai script voi -BridgeArgs phu hop."
} catch {
  Write-Host ""
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Goi y kiem tra nhanh:"
  Write-Host "1) Bridge exe co chay duoc thu cong khong"
  Write-Host "2) Bridge co endpoint /health va /printers khong"
  Write-Host "3) BridgeArgs co dung voi executable khong"
  exit 1
}
