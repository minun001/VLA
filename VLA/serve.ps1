param(
  [int]$Port = 8090
)

$ErrorActionPreference = "Stop"
$WebRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DeployDir = Join-Path $WebRoot ".deploy"
$PidFile = Join-Path $DeployDir "server.pid"
$OutLog = Join-Path $DeployDir "server.out.log"
$ErrLog = Join-Path $DeployDir "server.err.log"

New-Item -ItemType Directory -Force -Path $DeployDir | Out-Null

if (Test-Path -LiteralPath $PidFile) {
  $ExistingPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
  if ($ExistingPid -and (Get-Process -Id $ExistingPid -ErrorAction SilentlyContinue)) {
    Write-Host "Existing local deployment is already running: http://127.0.0.1:$Port/"
    exit 0
  }
}

$Process = Start-Process `
  -FilePath "python" `
  -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", "$WebRoot") `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

Set-Content -LiteralPath $PidFile -Value $Process.Id
Start-Sleep -Seconds 1

$Response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
Write-Host "Local deployment started: http://127.0.0.1:$Port/"
Write-Host "PID: $($Process.Id)"
Write-Host "HTTP status: $($Response.StatusCode)"
