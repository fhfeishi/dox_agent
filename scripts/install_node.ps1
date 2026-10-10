# Installs a portable Node.js LTS (zip, no installer, no admin) into -Dest.
# Used by launch.cmd when node/npm are missing. Mirrors are tried in order:
# $env:NODE_MIRROR (if set), nodejs.org, npmmirror.com.
param([Parameter(Mandatory = $true)][string]$Dest)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$mirrors = @()
if ($env:NODE_MIRROR) { $mirrors += $env:NODE_MIRROR.TrimEnd('/') }
$mirrors += 'https://nodejs.org/dist', 'https://npmmirror.com/mirrors/node'

foreach ($mirror in $mirrors) {
    try {
        Write-Host "Looking up the latest Node.js LTS at $mirror ..."
        $index = Invoke-RestMethod -Uri "$mirror/index.json" -TimeoutSec 30
        $release = $index | Where-Object { $_.lts -and ($_.files -contains "win-$arch-zip") } | Select-Object -First 1
        if (-not $release) { throw "no LTS build for win-$arch" }
        $name = "node-$($release.version)-win-$arch"
        $zip = Join-Path $env:TEMP "$name.zip"
        Write-Host "Downloading $name ..."
        Invoke-WebRequest -Uri "$mirror/$($release.version)/$name.zip" -OutFile $zip -TimeoutSec 600
        $unpack = Join-Path $env:TEMP "dox-node-$([guid]::NewGuid())"
        Expand-Archive -Path $zip -DestinationPath $unpack -Force
        if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
        New-Item -ItemType Directory -Force -Path (Split-Path $Dest) | Out-Null
        Move-Item -Path (Join-Path $unpack $name) -Destination $Dest
        Remove-Item -Recurse -Force $unpack, $zip
        if (-not (Test-Path (Join-Path $Dest 'node.exe'))) { throw "node.exe missing after unpack" }
        Write-Host "Node.js $($release.version) installed to $Dest"
        exit 0
    } catch {
        Write-Warning "Node.js install from $mirror failed: $_"
    }
}
Write-Error "Could not install Node.js. Install it from https://nodejs.org/ and run launch.cmd again."
exit 1
