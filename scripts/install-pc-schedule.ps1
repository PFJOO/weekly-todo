# install-pc-schedule.ps1
# Sets up a Windows scheduled task that runs pc-refresh.ps1 every N hours (default 3)
# while you are logged in. No admin rights and no stored password needed.
#
# Install / reinstall :  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-pc-schedule.ps1
# Remove              :  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-pc-schedule.ps1 -Uninstall
# (Kept ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 text in scripts.)
param(
  [int]$EveryHours = 3,
  [string]$TaskName = 'CafeNewMenuRefresh',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$Base = Join-Path $env:LOCALAPPDATA 'CafeMenuBot'
$RepoCopy = Join-Path $Base 'repo'
$Job = Join-Path $Base 'pc-refresh.ps1'

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
  } else { Write-Host "Task '$TaskName' was not installed." }
  Write-Host "Files kept at: $Base  (delete this folder by hand if you do not need the log/copy)"
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$git  = (Get-Command git  -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js was not found. Install it from https://nodejs.org first.' }
if (-not $git)  { throw 'Git was not found. Install it from https://git-scm.com first.' }

# The URL of this project on GitHub (taken from the project folder you run this in).
$here = Split-Path -Parent $PSScriptRoot
$url = (& $git -C $here remote get-url origin).Trim()
if (-not $url) { throw 'Could not read the GitHub address (git remote origin).' }

New-Item -ItemType Directory -Force -Path $Base | Out-Null

# Own copy of the project, so the scheduled job never touches your working folder.
if (-not (Test-Path (Join-Path $RepoCopy '.git'))) {
  Write-Host "Copying the project from GitHub to $RepoCopy ..."
  & $git clone -q $url $RepoCopy
  if ($LASTEXITCODE -ne 0) { throw 'git clone failed (internet problem?).' }
} else {
  Write-Host 'Project copy already exists - keeping it.'
}

Copy-Item -Force (Join-Path $PSScriptRoot 'pc-refresh.ps1') $Job

$arg = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -NodePath "{1}" -GitPath "{2}"' -f $Job, $node, $git
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours $EveryHours)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Refreshes cafe new-menu data from this PC every few hours and pushes it to GitHub.' -Force | Out-Null

Write-Host ''
Write-Host "Installed scheduled task '$TaskName' (every $EveryHours hours while you are logged in)."
Write-Host "Log file : $(Join-Path $Base 'refresh.log')"
Write-Host 'Remove   : powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-pc-schedule.ps1 -Uninstall'
