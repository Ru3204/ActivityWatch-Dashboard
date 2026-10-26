[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter(Position = 0)]
    [ValidateSet("install", "uninstall", "status")]
    [string]$Action = "status"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ServiceId = "TempoActivityWatchDashboard"
$ServiceDisplayName = "Tempo ActivityWatch Dashboard"
$ServiceName = "tempo-activitywatch-dashboard"
$LegacyTaskName = "Tempo ActivityWatch Dashboard"
$Port = 15173
$WinSwVersion = "2.12.0"
$WinSwDownloadUrl = "https://github.com/winsw/winsw/releases/download/v$WinSwVersion/WinSW-x64.exe"
$WinSwSha256 = "05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da"

$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$ServerEntry = Join-Path $ProjectRoot "dist-server\index.js"
$ClientEntry = Join-Path $ProjectRoot "dist\index.html"
$NodeModules = Join-Path $ProjectRoot "node_modules"
$CommonDataRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)
$RuntimeDirectory = Join-Path $CommonDataRoot "Tempo"
$WrapperPath = Join-Path $RuntimeDirectory "tempo-service.exe"
$ConfigPath = Join-Path $RuntimeDirectory "tempo-service.xml"
$LogDirectory = Join-Path $RuntimeDirectory "logs"
$DataDirectory = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Tempo" } else { Join-Path $ProjectRoot "data" }

function Assert-Windows {
    if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
        throw "Tempo service management supports Windows only."
    }
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "This installer currently supports 64-bit Windows only."
    }
}

function Test-Administrator {
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object System.Security.Principal.WindowsPrincipal($Identity)
    return $Principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-ElevatedAction {
    param([Parameter(Mandatory = $true)][ValidateSet("install", "uninstall")][string]$ElevatedAction)

    $PowerShellPath = (Get-Command "powershell.exe" -ErrorAction Stop).Source
    $Arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`"",
        $ElevatedAction
    )
    Write-Host "Windows will request administrator permission to $ElevatedAction the Tempo service." -ForegroundColor Cyan
    $Process = Start-Process -FilePath $PowerShellPath -Verb RunAs -ArgumentList $Arguments -Wait -PassThru
    if ($Process.ExitCode -ne 0) {
        throw "The elevated Tempo service action failed with exit code $($Process.ExitCode)."
    }
}

function Get-RequiredCommandPath {
    param([Parameter(Mandatory = $true)][string]$Name)

    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $Command) {
        throw "Required command was not found: $Name"
    }
    return $Command.Source
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $Stream = [System.IO.File]::OpenRead($Path)
    try {
        $Sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($Sha256.ComputeHash($Stream))).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $Sha256.Dispose()
        }
    }
    finally {
        $Stream.Dispose()
    }
}

function Get-InstalledService {
    return Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
}

function Get-InstalledServiceAccount {
    try {
        $ServiceRegistryPath = "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\$ServiceId"
        return Get-ItemPropertyValue -LiteralPath $ServiceRegistryPath -Name "ObjectName" -ErrorAction Stop
    }
    catch {
        return $null
    }
}

function Get-LegacyScheduledTask {
    return Get-ScheduledTask -TaskName $LegacyTaskName -TaskPath "\" -ErrorAction SilentlyContinue
}

function Get-TempoHealth {
    try {
        return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -Method Get -TimeoutSec 3
    }
    catch {
        return $null
    }
}

function Test-PortOpen {
    $Client = New-Object System.Net.Sockets.TcpClient
    try {
        $Connect = $Client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $Connect.AsyncWaitHandle.WaitOne(1000, $false)) {
            return $false
        }
        $Client.EndConnect($Connect)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $Client.Dispose()
    }
}

function Test-BuildRequired {
    if (-not (Test-Path -LiteralPath $ServerEntry -PathType Leaf) -or -not (Test-Path -LiteralPath $ClientEntry -PathType Leaf)) {
        return $true
    }

    $BuildTime = [Math]::Min(
        (Get-Item -LiteralPath $ServerEntry).LastWriteTimeUtc.Ticks,
        (Get-Item -LiteralPath $ClientEntry).LastWriteTimeUtc.Ticks
    )

    $SourcePaths = @(
        (Join-Path $ProjectRoot "src"),
        (Join-Path $ProjectRoot "server"),
        (Join-Path $ProjectRoot "shared")
    )
    $SourceFiles = foreach ($SourcePath in $SourcePaths) {
        if (Test-Path -LiteralPath $SourcePath) {
            Get-ChildItem -LiteralPath $SourcePath -Recurse -File
        }
    }
    $RootFiles = @("package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "tsconfig.server.json") |
        ForEach-Object { Join-Path $ProjectRoot $_ } |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Get-Item -LiteralPath $_ }

    foreach ($File in @($SourceFiles) + @($RootFiles)) {
        if ($File.LastWriteTimeUtc.Ticks -gt $BuildTime) {
            return $true
        }
    }
    return $false
}

function Invoke-ProductionBuild {
    param([Parameter(Mandatory = $true)][string]$NpmPath)

    if (-not (Test-Path -LiteralPath $NodeModules -PathType Container)) {
        throw "Dependencies are missing. Run npm.cmd install before installing the service."
    }
    if (-not (Test-BuildRequired)) {
        Write-Host "Production build is current." -ForegroundColor DarkGray
        return
    }
    if (-not $PSCmdlet.ShouldProcess($ProjectRoot, "Run npm.cmd run build")) {
        return
    }

    Write-Host "Building the production dashboard..." -ForegroundColor Cyan
    Push-Location -LiteralPath $ProjectRoot
    try {
        & $NpmPath run build
        if ($LASTEXITCODE -ne 0) {
            throw "Production build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Remove-LegacyScheduledTask {
    $LegacyTask = $null
    $LegacyTask = Get-LegacyScheduledTask
    if ($null -eq $LegacyTask) {
        return
    }

    if ($LegacyTask.State -eq "Running" -and $PSCmdlet.ShouldProcess($LegacyTaskName, "Stop the legacy scheduled task")) {
        Stop-ScheduledTask -TaskName $LegacyTaskName -TaskPath "\"
    }
    if ($PSCmdlet.ShouldProcess($LegacyTaskName, "Remove the legacy scheduled task")) {
        Unregister-ScheduledTask -TaskName $LegacyTaskName -TaskPath "\" -Confirm:$false
        Write-Host "Removed legacy scheduled task: $LegacyTaskName" -ForegroundColor DarkGray
    }
}

function Grant-ServiceDirectoryAccess {
    foreach ($Directory in @($DataDirectory, $LogDirectory)) {
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
        # S-1-5-19 is the language-independent SID for NT AUTHORITY\LocalService.
        & icacls.exe $Directory /grant "*S-1-5-19:(OI)(CI)M" /T /C | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not grant LocalService access to $Directory."
        }
    }
}

function Install-WinSwBinary {
    New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null

    if (Test-Path -LiteralPath $WrapperPath -PathType Leaf) {
        $ExistingHash = Get-FileSha256 -Path $WrapperPath
        if ($ExistingHash -eq $WinSwSha256) {
            Write-Host "WinSW $WinSwVersion is already present and verified." -ForegroundColor DarkGray
            return
        }
    }

    $TemporaryPath = Join-Path $RuntimeDirectory "tempo-service.download"
    try {
        Write-Host "Downloading WinSW $WinSwVersion from the official release..." -ForegroundColor Cyan
        Invoke-WebRequest -UseBasicParsing -Uri $WinSwDownloadUrl -OutFile $TemporaryPath
        $DownloadedHash = Get-FileSha256 -Path $TemporaryPath
        if ($DownloadedHash -ne $WinSwSha256) {
            throw "WinSW checksum verification failed. Expected $WinSwSha256 but received $DownloadedHash."
        }
        Move-Item -LiteralPath $TemporaryPath -Destination $WrapperPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $TemporaryPath) {
            Remove-Item -LiteralPath $TemporaryPath -Force
        }
    }
}

function Write-WinSwConfiguration {
    param([Parameter(Mandatory = $true)][string]$NodePath)

    $NodeXml = [Security.SecurityElement]::Escape($NodePath)
    $ServerXml = [Security.SecurityElement]::Escape($ServerEntry)
    $ProjectXml = [Security.SecurityElement]::Escape($ProjectRoot)
    $DataXml = [Security.SecurityElement]::Escape($DataDirectory)
    $LogXml = [Security.SecurityElement]::Escape($LogDirectory)

    $Configuration = @"
<service>
  <id>$ServiceId</id>
  <name>$ServiceDisplayName</name>
  <description>Runs the local Tempo ActivityWatch dashboard on 127.0.0.1:$Port.</description>
  <executable>$NodeXml</executable>
  <arguments>&quot;$ServerXml&quot;</arguments>
  <workingdirectory>$ProjectXml</workingdirectory>
  <env name="NODE_ENV" value="production" />
  <env name="PORT" value="$Port" />
  <env name="TEMPO_DATA_DIR" value="$DataXml" />
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <hidewindow>true</hidewindow>
  <stoptimeout>15 sec</stoptimeout>
  <onfailure action="restart" delay="10 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$LogXml</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <serviceaccount>
    <username>NT AUTHORITY\LocalService</username>
  </serviceaccount>
  <autoRefresh>false</autoRefresh>
</service>
"@

    Set-Content -LiteralPath $ConfigPath -Value $Configuration -Encoding UTF8
    $null = [xml](Get-Content -LiteralPath $ConfigPath -Raw)
}

function Invoke-WinSw {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("install", "uninstall", "start", "stop", "status")][string]$Command,
        [switch]$AllowFailure
    )

    & $WrapperPath $Command
    $ExitCode = $LASTEXITCODE
    if (-not $AllowFailure -and $ExitCode -ne 0) {
        throw "WinSW '$Command' failed with exit code $ExitCode."
    }
    return $ExitCode
}

function Set-TempoServiceAccount {
    # WinSW 2.12 can ignore the XML serviceaccount entry on some Windows
    # installations, so enforce the low-privilege built-in account through SCM.
    & sc.exe config $ServiceId obj= "NT AUTHORITY\LocalService" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not configure the Tempo service to run as LocalService."
    }
}

function Wait-ForTempoReady {
    for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
        Start-Sleep -Seconds 1
        $Health = Get-TempoHealth
        if ($null -ne $Health -and $Health.service -eq $ServiceName -and $Health.status -eq "ready") {
            return $true
        }
    }
    return $false
}

function Install-TempoService {
    Assert-Windows
    if ($WhatIfPreference) {
        $null = $PSCmdlet.ShouldProcess($ServiceDisplayName, "Remove the legacy scheduled task")
        $null = $PSCmdlet.ShouldProcess($RuntimeDirectory, "Download and verify WinSW $WinSwVersion")
        $null = $PSCmdlet.ShouldProcess($ServiceDisplayName, "Install and start the Windows service on port $Port")
        return
    }
    if (-not (Test-Administrator)) {
        Invoke-ElevatedAction -ElevatedAction install
        return
    }

    $NodePath = Get-RequiredCommandPath "node.exe"
    $NpmPath = Get-RequiredCommandPath "npm.cmd"
    Invoke-ProductionBuild -NpmPath $NpmPath
    Remove-LegacyScheduledTask

    $ExistingService = $null
    $ExistingService = Get-InstalledService
    if ($null -ne $ExistingService) {
        if (-not (Test-Path -LiteralPath $WrapperPath -PathType Leaf) -or -not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
            throw "The Tempo service exists but its WinSW files are missing. Run startup:uninstall before reinstalling."
        }
        if ($ExistingService.Status -ne "Stopped") {
            $null = Invoke-WinSw -Command stop -AllowFailure
        }
        Invoke-WinSw -Command uninstall | Out-Null
    }

    if (Test-PortOpen) {
        throw "Port $Port is already in use. Stop the manually launched Tempo process, then run startup:install again."
    }

    Grant-ServiceDirectoryAccess
    Install-WinSwBinary
    Write-WinSwConfiguration -NodePath $NodePath
    Invoke-WinSw -Command install | Out-Null
    Set-TempoServiceAccount
    Invoke-WinSw -Command start | Out-Null

    if (-not (Wait-ForTempoReady)) {
        throw "The service was installed, but Tempo did not become ready within 30 seconds. Run startup:status and inspect $LogDirectory."
    }

    Write-Host "Tempo Windows service is installed and ready at http://127.0.0.1:$Port" -ForegroundColor Green
    Write-Host "It will keep running after every terminal window is closed." -ForegroundColor Green
}

function Uninstall-TempoService {
    Assert-Windows
    if ($WhatIfPreference) {
        $null = $PSCmdlet.ShouldProcess($ServiceDisplayName, "Stop and uninstall the Windows service")
        $null = $PSCmdlet.ShouldProcess($ServiceDisplayName, "Remove the legacy scheduled task")
        return
    }
    if (-not (Test-Administrator)) {
        Invoke-ElevatedAction -ElevatedAction uninstall
        return
    }

    $InstalledService = $null
    $InstalledService = Get-InstalledService
    if ($null -ne $InstalledService) {
        if (Test-Path -LiteralPath $WrapperPath -PathType Leaf) {
            if ($InstalledService.Status -ne "Stopped") {
                $null = Invoke-WinSw -Command stop -AllowFailure
            }
            Invoke-WinSw -Command uninstall | Out-Null
        }
        else {
            if ($InstalledService.Status -ne "Stopped") {
                Stop-Service -Name $ServiceId -Force
            }
            & sc.exe delete $ServiceId | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Could not remove the Tempo service."
            }
        }
        Write-Host "Removed Windows service: $ServiceDisplayName" -ForegroundColor Green
    }
    else {
        Write-Host "Tempo Windows service is not installed." -ForegroundColor DarkGray
    }

    Remove-LegacyScheduledTask
    foreach ($ManagedFile in @($ConfigPath, $WrapperPath)) {
        if (Test-Path -LiteralPath $ManagedFile -PathType Leaf) {
            Remove-Item -LiteralPath $ManagedFile -Force
        }
    }
    Write-Host "Tempo data and service logs were preserved." -ForegroundColor DarkGray
}

function Show-TempoServiceStatus {
    Assert-Windows
    $InstalledService = $null
    $InstalledService = Get-InstalledService
    $InstalledServiceAccount = if ($null -eq $InstalledService) { $null } else { Get-InstalledServiceAccount }
    $LegacyTask = $null
    $LegacyTask = Get-LegacyScheduledTask
    $Health = Get-TempoHealth
    $BuildRequired = Test-BuildRequired
    $WrapperVerified = $false
    if (Test-Path -LiteralPath $WrapperPath -PathType Leaf) {
        $WrapperVerified = (Get-FileSha256 -Path $WrapperPath) -eq $WinSwSha256
    }

    Write-Host "Tempo service status" -ForegroundColor Cyan
    Write-Host "  URL:      http://127.0.0.1:$Port"
    Write-Host "  Build:    $(if ($BuildRequired) { 'missing or stale' } else { 'current' })"
    Write-Host "  Service:  $(if ($null -eq $InstalledService) { 'not installed' } else { $InstalledService.Status })"
    if ($null -ne $InstalledService) {
        Write-Host "  Account:  $(if ($InstalledServiceAccount) { $InstalledServiceAccount } else { 'unavailable' })"
    }
    Write-Host "  Health:   $(if ($null -ne $Health -and $Health.service -eq $ServiceName -and $Health.status -eq 'ready') { 'ready' } else { 'not ready' })"
    Write-Host "  WinSW:    $(if ($WrapperVerified) { "verified $WinSwVersion" } elseif (Test-Path -LiteralPath $WrapperPath) { 'checksum mismatch' } else { 'not downloaded' })"
    Write-Host "  Data:     $DataDirectory"
    Write-Host "  Logs:     $LogDirectory"
    if ($null -ne $LegacyTask) {
        Write-Host "  Legacy:   scheduled task still exists; run startup:install or startup:uninstall as Administrator" -ForegroundColor Yellow
    }
}

switch ($Action) {
    "install" { Install-TempoService }
    "uninstall" { Uninstall-TempoService }
    "status" { Show-TempoServiceStatus }
}
