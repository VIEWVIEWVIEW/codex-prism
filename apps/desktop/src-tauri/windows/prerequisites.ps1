# Windows PowerShell 5.1. WinGet verifies manifest hashes for MiKTeX/Codex;
# Ghostscript is pinned and verified explicitly before execution.
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'

function Update-ToolPath {
    $paths = @($env:PATH, [Environment]::GetEnvironmentVariable('Path', 'Machine'),
        [Environment]::GetEnvironmentVariable('Path', 'User'),
        "$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64",
        "$env:ProgramFiles\MiKTeX\miktex\bin\x64",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links")
    $paths += @(Get-ChildItem "$env:ProgramFiles\gs\*\bin" -Directory -ErrorAction SilentlyContinue | ForEach-Object FullName)
    $paths += @(Get-ChildItem 'C:\texlive\*\bin\windows' -Directory -ErrorAction SilentlyContinue | ForEach-Object FullName)
    $env:PATH = ($paths | Where-Object { $_ }) -join ';'
}

function Find-Tool([string]$Name) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
}

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    if (!$Program) { throw 'A required prerequisite executable was not found.' }
    # Windows PowerShell treats native stderr as ErrorRecord objects. Preserve
    # diagnostic output and judge native programs by their exit code.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Program @Arguments 2>&1 | ForEach-Object { Write-Host "$_" }
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($exitCode -ne 0) { throw "$Program failed with exit code $exitCode" }
}

function Install-WinGetPackage([string]$Id) {
    $winget = Find-Tool 'winget.exe'
    if (!$winget) { throw 'Windows App Installer (winget) is required for prerequisite downloads. Install App Installer from Microsoft, then rerun setup.' }
    Write-Host "Installing $Id..."
    Invoke-Checked $winget @('install', '--id', $Id, '--exact', '--source', 'winget',
        '--scope', 'user', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
    Update-ToolPath
}

function Install-Prerequisites {
    Update-ToolPath
    if (!$CheckOnly) {
        if (!(Find-Tool 'pdflatex.exe')) {
            Install-WinGetPackage 'MiKTeX.MiKTeX'
            $miktex = Find-Tool 'miktex.exe'
            if (!$miktex) { throw 'MiKTeX installation did not provide miktex.exe.' }
            # Only configure the MiKTeX installation just created by this setup.
            Invoke-Checked (Find-Tool 'initexmf.exe') @('--set-config-value=[MPM]AutoInstall=1')
            Invoke-Checked $miktex @('packages', 'update-package-database')
            Invoke-Checked $miktex @('packages', 'install', 'biber-windows-x64', 'biblatex', 'latexmk',
                'pgf', 'booktabs', 'hyperref', 'fontspec', 'amsmath', 'geometry', 'xcolor', 'lm')
        }
        if (!(Find-Tool 'codex.exe') -and !(Find-Tool 'codex.cmd')) {
            Install-WinGetPackage 'OpenAI.Codex'
        }
        if (!(Find-Tool 'gswin64c.exe') -and !(Find-Tool 'gs.exe')) {
            $download = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString() + '.exe')
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Write-Host 'Downloading Ghostscript 10.08.0 for PDF export...'
                Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10080/gs10080w64.exe' -OutFile $download
                if ((Get-FileHash $download -Algorithm SHA256).Hash -ne '52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50') {
                    throw 'Ghostscript checksum verification failed.'
                }
                # Artifex explicitly disables silent mode. Show its license/setup
                # wizard and wait for completion; hiding it would hang setup.
                Write-Host 'Complete the Ghostscript setup wizard to continue.'
                $process = Start-Process -FilePath $download -PassThru -Wait
                if ($process.ExitCode -notin @(0, 3010)) { throw "Ghostscript setup failed: $($process.ExitCode)" }
            } finally {
                Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
            }
            Update-ToolPath
        }
    }
    $missing = @('pdflatex.exe', 'xelatex.exe', 'lualatex.exe', 'bibtex.exe', 'biber.exe') |
        Where-Object { !(Find-Tool $_) }
    if ($missing) { throw "LaTeX tools missing: $($missing -join ', '). Complete your existing TeX installation, then rerun setup." }
    if (!(Find-Tool 'codex.exe') -and !(Find-Tool 'codex.cmd')) { throw 'Codex CLI is missing.' }
    if (!(Find-Tool 'gswin64c.exe') -and !(Find-Tool 'gs.exe')) { throw 'Ghostscript is missing.' }
    Write-Host 'Codex, pdfLaTeX, XeLaTeX, LuaLaTeX, BibTeX, Biber and Ghostscript are available.'
}

if ($MyInvocation.InvocationName -ne '.') {
    $logDir = Join-Path $env:LOCALAPPDATA 'codex-prism'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Start-Transcript -Path (Join-Path $logDir 'installer.log') -Append | Out-Null
    try { Install-Prerequisites; exit 0 }
    catch { Write-Host "ERROR: $_"; exit 1 }
    finally { Stop-Transcript | Out-Null }
}
