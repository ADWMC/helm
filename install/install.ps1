<#
.SYNOPSIS
    helm installer for Windows.
.DESCRIPTION
    Downloads the helm platform payload (pi-windows-<arch>.zip + SHA256SUMS
    from the Build Binaries release) and installs it to
    %USERPROFILE%\.helm\bin, then adds the directory to the user PATH.
    The released executable pi.exe is renamed to helm.exe on install.
.PARAMETER Version
    Install a specific version (e.g., 0.88.0). Defaults to latest.
    When piping via iex, use $env:HELM_VERSION instead.
.PARAMETER NoModifyPath
    Don't modify the user PATH environment variable.
.PARAMETER DryRun
    Print the download and install plan, then exit without touching anything.
.EXAMPLE
    irm https://raw.githubusercontent.com/ADWMC/helm/main/install/install.ps1 | iex
.EXAMPLE
    $env:HELM_VERSION = "0.88.0"; irm https://raw.githubusercontent.com/ADWMC/helm/main/install/install.ps1 | iex
#>
param(
	[String] $Version,
	[Switch] $NoModifyPath,
	[Switch] $DryRun
)

$ErrorActionPreference = 'Stop'

if (-not $Version -and $env:HELM_VERSION) { $Version = $env:HELM_VERSION }
$Repo = if ($env:HELM_REPO) { $env:HELM_REPO } else { 'ADWMC/helm' }
$ReleaseBase = if ($env:HELM_RELEASE_BASE) { $env:HELM_RELEASE_BASE } else { "https://github.com/$Repo/releases/download" }
$InstallDir = if ($env:HELM_INSTALL_DIR) { $env:HELM_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.helm\bin' }
if ($env:HELM_NO_MODIFY_PATH -eq '1') { $NoModifyPath = $true }

$arch = $env:PROCESSOR_ARCHITECTURE
switch ($arch) {
	'AMD64' { $arch = 'x64' }
	'ARM64' { $arch = 'arm64' }
	default {
		Write-Host "unsupported architecture: $arch" -ForegroundColor Red
		exit 2
	}
}

if (-not $Version) {
	Write-Host "==> resolving latest release from $Repo ..."
	$latest = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
	$Version = [String]$latest.tag_name
	$Version = $Version.TrimStart('v')
	if (-not $Version) {
		Write-Host "failed to resolve latest release for $Repo" -ForegroundColor Red
		exit 1
	}
}

$Asset = "pi-windows-$arch.zip"
$AssetUrl = "$ReleaseBase/v$Version/$Asset"
$SumsUrl = "$ReleaseBase/v$Version/SHA256SUMS"

Write-Host "==> helm v$Version (windows-$arch)"
Write-Host "    asset:   $AssetUrl"
Write-Host "    install: $InstallDir"

if ($DryRun) {
	Write-Host '    (dry run: nothing downloaded, nothing written)'
	exit 0
}

$Work = Join-Path ([System.IO.Path]::GetTempPath()) ("helmd-install-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Work | Out-Null
try {
	Write-Host "==> downloading $Asset + SHA256SUMS"
	$assetPath = Join-Path $Work $Asset
	$sumsPath = Join-Path $Work 'SHA256SUMS'
	Invoke-WebRequest -Uri $AssetUrl -OutFile $assetPath -UseBasicParsing
	Invoke-WebRequest -Uri $SumsUrl -OutFile $sumsPath -UseBasicParsing

	Write-Host '==> verifying sha256'
	$expected = $null
	foreach ($line in (Get-Content $sumsPath)) {
		if ($line -match "^([0-9a-fA-F]{64})\s+\*?(.+)$" -and $Matches[2].Trim() -eq $Asset) {
			$expected = $Matches[1].ToLowerInvariant()
			break
		}
	}
	if (-not $expected) {
		Write-Host "SHA256SUMS has no entry for $Asset" -ForegroundColor Red
		exit 1
	}
	$actual = (Get-FileHash -Path $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
	if ($actual -ne $expected) {
		Write-Host "sha256 mismatch: expected $expected, got $actual" -ForegroundColor Red
		exit 1
	}

	Write-Host '==> extracting payload'
	Expand-Archive -Path $assetPath -DestinationPath $Work -Force
	$exe = Get-ChildItem -Path $Work -Recurse -Filter 'pi.exe' | Select-Object -First 1
	if (-not $exe) {
		Write-Host "payload binary pi.exe not found in $Asset" -ForegroundColor Red
		exit 1
	}
	$payloadDir = $exe.Directory.FullName

	New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
	Get-ChildItem -Path $payloadDir | ForEach-Object {
		$dest = Join-Path $InstallDir $_.Name
		if ($_.Name -ne 'pi.exe') {
			Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
		}
	}
	$helmExe = Join-Path $InstallDir 'helm.exe'
	if (Test-Path $helmExe) { Remove-Item $helmExe -Force }
	Copy-Item -Path $exe.FullName -Destination $helmExe -Force

	if (-not $NoModifyPath) {
		$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
		if ($null -eq $userPath) { $userPath = '' }
		$entries = @($userPath -split ';' | Where-Object { $_ })
		if ($entries -notcontains $InstallDir) {
			$entries += $InstallDir
			[Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')
			Write-Host "==> PATH updated (new shells pick it up; current shells need a restart)"
		}
		else {
			Write-Host "==> $InstallDir already on PATH"
		}
	}
	else {
		Write-Host "==> -NoModifyPath: add $InstallDir to PATH yourself"
	}

	Write-Host '==> smoke test'
	& $helmExe --version | Out-Null
	if ($LASTEXITCODE -ne 0) {
		Write-Host "installed, but 'helm --version' failed (exit $LASTEXITCODE)" -ForegroundColor Red
		exit 1
	}
	Write-Host "helm v$Version installed OK ($helmExe)"
}
finally {
	Remove-Item -Path $Work -Recurse -Force -ErrorAction SilentlyContinue
}
