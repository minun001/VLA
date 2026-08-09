$ErrorActionPreference = "Stop"
$WebRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $WebRoot ".deploy\server.pid"

if (-not (Test-Path -LiteralPath $PidFile)) {
  Write-Host "No local deployment PID file found."
  exit 0
}

$ServerPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
if ($ServerPid -and (Get-Process -Id $ServerPid -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $ServerPid
  Write-Host "Stopped local deployment process: $ServerPid"
} else {
  Write-Host "No running deployment process found for PID: $ServerPid"
}
