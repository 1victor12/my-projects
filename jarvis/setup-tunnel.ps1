# ===== One-time setup: Permanent Cloudflare Tunnel for JARVIS =====
# Run: powershell -ExecutionPolicy Bypass -File setup-tunnel.ps1
# Needs: cloudflared.exe (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
#        and a domain added to your free Cloudflare account.

$ErrorActionPreference = "Stop"

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) {
    $guess = "$PSScriptRoot\cloudflared.exe"
    if (Test-Path $guess) { $cloudflared = $guess }
}
if (-not $cloudflared) {
    Write-Host "ERROR: cloudflared not found." -ForegroundColor Red
    Write-Host "Download cloudflared-windows-amd64.exe, rename to cloudflared.exe,"
    Write-Host "put it in this folder ($PSScriptRoot), then run this script again."
    exit 1
}

$cfDir = "$env:USERPROFILE\.cloudflared"
if (-not (Test-Path $cfDir)) { New-Item -ItemType Directory -Path $cfDir | Out-Null }

Write-Host "Step 1/4: Login (a browser will open -> pick your domain)" -ForegroundColor Cyan
& $cloudflared tunnel login
if ($LASTEXITCODE -ne 0) { Write-Host "Login failed."; exit 1 }

$tunnelName = "jarvis"
Write-Host "Step 2/4: Creating tunnel '$tunnelName'..." -ForegroundColor Cyan
& $cloudflared tunnel create $tunnelName
if ($LASTEXITCODE -ne 0) { Write-Host "Create failed (if it says already exists, that is OK)."; }

$cred = Get-ChildItem $cfDir -Filter "$tunnelName*.json" | Select-Object -First 1
if (-not $cred) { Write-Host "ERROR: credentials file not found in $cfDir"; exit 1 }
$tunnelId = $cred.BaseName

$hostname = Read-Host "Step 3/4: Enter full address you want (e.g. jarvis.yourdomain.com)"
& $cloudflared tunnel route dns $tunnelName $hostname
if ($LASTEXITCODE -ne 0) { Write-Host "DNS route failed."; exit 1 }

Write-Host "Writing config.yml ..." -ForegroundColor Cyan
@"
tunnel: $tunnelId
credentials-file: $cfDir\$($cred.Name)
ingress:
  - service: https://localhost:8124
    originRequest:
      noTLSVerify: true
  - service: http_status:404
"@ | Out-File -Encoding ascii "$cfDir\config.yml"

Write-Host ""
Write-Host "DONE! Your permanent JARVIS address: https://$hostname" -ForegroundColor Green
Write-Host ""
Write-Host "From now on just double-click 'Start JARVIS Remote.vbs' -"
Write-Host "it starts JARVIS + the tunnel together."
