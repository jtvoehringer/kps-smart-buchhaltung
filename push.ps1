# push.ps1 - Aenderungen committen und nach GitHub pushen (Vercel baut danach automatisch).
#
#   .\push.ps1 "Kurze Beschreibung der Aenderung"
#   .\push.ps1 "Release 1.3.1: Fix im Bericht" -Version 1.3.1     # hebt zusaetzlich die Versionsnummer
#   .\push.ps1                                                     # fragt nach der Nachricht
#
# Einmalig noetig, falls PowerShell Skripte blockiert:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param(
  [string]$Message,
  [string]$Version
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if ($Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version bitte als x.y.z angeben, z. B. 1.3.1" }
  foreach ($datei in @('package.json', 'package-lock.json')) {
    $inhalt = Get-Content $datei -Raw
    # nur die Eintraege des Projekts selbst (Root + packages[""]), nicht die Abhaengigkeiten
    $inhalt = [regex]::Replace($inhalt, '("name":\s*"kps-smart-buchhaltung",\s*"version":\s*")[^"]+(")', "`${1}$Version`${2}")
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $datei), $inhalt)
  }
  Write-Host "Version auf $Version gesetzt." -ForegroundColor Cyan
}

if (-not $Message) { $Message = Read-Host "Commit-Nachricht" }
if (-not $Message) { $Message = "Update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "Nichts zu committen - pushe nur, was schon committet ist." -ForegroundColor Yellow
} else {
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "Commit fehlgeschlagen." }
}

git push origin HEAD
if ($LASTEXITCODE -ne 0) { throw "Push fehlgeschlagen." }

$sha = (git rev-parse --short HEAD).Trim()
Write-Host ""
Write-Host "Fertig: $sha ist auf GitHub. Vercel baut jetzt (ca. 30-60 s):" -ForegroundColor Green
Write-Host "  https://kps-smart-buchhaltung-lime.vercel.app"
