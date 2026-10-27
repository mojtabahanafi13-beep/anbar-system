param(
    [string]$SourceRoot = (Join-Path $PSScriptRoot 'public\dashboard'),
    [string]$TargetRoot = 'C:\Anbar-Server\public\dashboard'
)

$ErrorActionPreference = 'Stop'

# This allowlist contains frontend assets only. It deliberately excludes data_export.txt.
$Assets = @(
    'dashboard.html',
    'fleet.js',
    'manifest-dashboard.json',
    'open.html',
    'route.html',
    'sw.js',
    'dash-icon-192.png',
    'dash-icon-512.png',
    'vendor\chart.umd.min.js',
    'vendor\pdf.min.mjs',
    'vendor\pdf.worker.min.mjs',
    'vendor\xlsx.bundle.js',
    'vendor\fa\css\all.min.css',
    'vendor\fa\webfonts\fa-brands-400.woff2',
    'vendor\fa\webfonts\fa-regular-400.woff2',
    'vendor\fa\webfonts\fa-solid-900.woff2',
    'vendor\fa\webfonts\fa-v4compatibility.woff2',
    'vendor\leaflet\README.txt'
)

foreach ($relative in $Assets) {
    $file = Join-Path $SourceRoot $relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "فایل لازم در بسته داشبورد پیدا نشد: $file. هیچ فایلی روی سرور تغییر نکرد."
    }
}

$projectRoot = Split-Path (Split-Path $TargetRoot -Parent) -Parent
$backupRoot = Join-Path $projectRoot 'dashboard-backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $backupRoot "dashboard-ui-$stamp"

New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

# Back up only files this script is allowed to replace; business data stays in place.
foreach ($relative in $Assets) {
    $target = Join-Path $TargetRoot $relative
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $backupFile = Join-Path $backupDir $relative
        New-Item -ItemType Directory -Path (Split-Path $backupFile -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $target -Destination $backupFile -Force
    }
}

foreach ($relative in $Assets) {
    $source = Join-Path $SourceRoot $relative
    $target = Join-Path $TargetRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
}

Write-Host "نسخه رابط داشبورد کپی شد."
Write-Host "پشتیبان فایل‌های جایگزین‌شده: $backupDir"
Write-Host "فایل data_export.txt و API/پایگاه‌داده دست‌نخورده باقی ماندند."
Write-Host "اکنون ورود، نقش‌ها، بارگیری/ارسال، رسیدها، نقشه، ناوگان و اعلان‌ها را آزمایش کنید."
