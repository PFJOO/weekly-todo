# pc-refresh.ps1
# Refreshes the cafe new-menu data FROM THIS PC and pushes it to GitHub.
# Why: Twosome and Compose block GitHub's cloud servers, but accept a home PC.
# It works on its OWN copy of the repo (never touches your working folder):
#   %LOCALAPPDATA%\CafeMenuBot\repo
# Log: %LOCALAPPDATA%\CafeMenuBot\refresh.log
# (Kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 text in scripts.)
param(
  [string]$Base = (Join-Path $env:LOCALAPPDATA 'CafeMenuBot'),
  [string]$NodePath = '',
  [string]$GitPath = ''
)

$Repo = Join-Path $Base 'repo'
$Log  = Join-Path $Base 'refresh.log'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:GIT_TERMINAL_PROMPT = '0'   # never wait for a password prompt (nobody is watching)
$env:GCM_INTERACTIVE = 'never'   # Git Credential Manager: fail instead of opening a login window
$ErrorActionPreference = 'Continue'

function Write-Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
}

function Invoke-Native([string]$exe, [string[]]$cmdArgs) {
  $text = & $exe @cmdArgs 2>&1 | ForEach-Object { "$_" }
  return @{ Code = $LASTEXITCODE; Out = (($text -join "`n").Trim()) }
}

if (-not (Test-Path $Base)) { New-Item -ItemType Directory -Force -Path $Base | Out-Null }
if ((Test-Path $Log) -and ((Get-Item $Log).Length -gt 1MB)) { Move-Item -Force $Log ($Log + '.old') }

if (-not $NodePath) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c) { $NodePath = $c.Source } }
if (-not $GitPath)  { $c = Get-Command git  -ErrorAction SilentlyContinue; if ($c) { $GitPath  = $c.Source } }

Write-Log '--- start ---'
if (-not $NodePath -or -not (Test-Path $NodePath)) { Write-Log 'ERROR: Node.js not found. Reinstall with install-pc-schedule.ps1'; exit 2 }
if (-not $GitPath  -or -not (Test-Path $GitPath))  { Write-Log 'ERROR: Git not found. Reinstall with install-pc-schedule.ps1'; exit 2 }
if (-not (Test-Path (Join-Path $Repo '.git')))      { Write-Log 'ERROR: repo copy is missing. Run install-pc-schedule.ps1 again'; exit 2 }

Set-Location $Repo
$done = $false
for ($try = 1; ($try -le 2) -and (-not $done); $try++) {
  # Start from a clean copy of GitHub's latest state (this copy holds no work of yours).
  $r = Invoke-Native $GitPath @('fetch', '-q', 'origin')
  if ($r.Code -ne 0) { Write-Log ('ERROR fetch (internet or login problem?): ' + $r.Out); exit 1 }
  $r = Invoke-Native $GitPath @('reset', '--hard', '-q', 'origin/main')
  if ($r.Code -ne 0) { Write-Log ('ERROR reset: ' + $r.Out); exit 1 }

  $r = Invoke-Native $NodePath @('scripts/fetch-menus.mjs')
  Write-Log ('collector exit=' + $r.Code)
  foreach ($line in ($r.Out -split "`n")) { if ($line.Trim()) { Write-Log ('  ' + $line.Trim()) } }
  if ($r.Code -ne 0) { Write-Log 'ERROR: collector failed'; exit 1 }

  $s = Invoke-Native $GitPath @('status', '--porcelain', 'data/menus.json')
  if (-not $s.Out) { Write-Log 'no change - nothing to upload'; $done = $true; break }

  $r = Invoke-Native $GitPath @('add', 'data/menus.json')
  $r = Invoke-Native $GitPath @('commit', '-q', '-m', 'Auto update (PC): cafe menu data')
  if ($r.Code -ne 0) { Write-Log ('ERROR commit: ' + $r.Out); exit 1 }

  $r = Invoke-Native $GitPath @('push', '-q', 'origin', 'main')
  if ($r.Code -eq 0) { Write-Log 'pushed to GitHub'; $done = $true }
  else { Write-Log ('push failed (attempt ' + $try + '): ' + $r.Out) }   # e.g. GitHub changed in between -> retry once
}

if (-not $done) { Write-Log 'ERROR: could not upload (not logged in to GitHub? run the refresh .bat file in the project folder once by hand)'; exit 1 }
Write-Log '--- done ---'
exit 0
