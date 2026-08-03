$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot'
$env:ANDROID_HOME = 'C:\Android'
$env:CAPACITOR_EXPORT = '1'

$apiDir = Join-Path $root 'src\app\api'
$apiBackup = Join-Path $env:TEMP 'nexlog_api_backup'
$apiMoved = $false

Write-Host '==> Preparando build estatico (movendo rotas API)'
if (Test-Path $apiDir) {
  if (Test-Path $apiBackup) { Remove-Item $apiBackup -Recurse -Force }
  Move-Item $apiDir $apiBackup
  $apiMoved = $true
}

try {
  Write-Host '==> Build estatico (next build)'
  npm run build
  if (-not (Test-Path (Join-Path $root 'out\index.html'))) { throw 'Build estatico nao gerou out/index.html' }

  Write-Host '==> Capacitor sync android'
  npx cap sync android
} finally {
  if ($apiMoved -and (Test-Path $apiBackup)) {
    Move-Item $apiBackup $apiDir
    Write-Host '==> Rotas API restauradas'
  }
}

Write-Host '==> Compilando APK (Gradle)'
Set-Location (Join-Path $root 'android')

$gradlew = Join-Path $root 'android\gradlew.bat'
& $gradlew assembleDebug --no-daemon 2>&1 | Select-Object -Last 30

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (Test-Path $apk) {
  Write-Host ''
  Write-Host 'APK GERADO:'
  Write-Host $apk
  Write-Host ("Tamanho: {0:N1} MB" -f ((Get-Item $apk).Length / 1MB))
} else {
  Write-Host 'ERRO: APK nao encontrado'
}
