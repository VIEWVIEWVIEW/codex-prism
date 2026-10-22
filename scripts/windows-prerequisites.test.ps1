# Isolated prerequisite decision tests; never download or install real tools.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\apps\desktop\src-tauri\windows\prerequisites.ps1"
function Assert($Condition, $Message) { if (!$Condition) { throw $Message } }
Invoke-Checked $env:ComSpec @('/d', '/c', 'echo benign diagnostic 1>&2')
$failed = $false
try { Invoke-Checked $env:ComSpec @('/d', '/c', 'exit 7') } catch { $failed = $_ -match 'exit code 7' }
Assert $failed 'Native command failures must be checked independently of stderr'
function Update-ToolPath { }
function Find-Tool([string]$Name) { if ($script:available -contains $Name) { return $Name } }
function Install-WinGetPackage([string]$Id) {
    $script:installed += $Id
    if ($script:failInstall) { throw 'Fixture download failure' }
    if ($Id -eq 'MiKTeX.MiKTeX') { $script:available += $script:tex + @('miktex.exe', 'initexmf.exe') }
    if ($Id -eq 'OpenAI.Codex') { $script:available += 'codex.exe' }
}
function Invoke-Checked([string]$Program, [string[]]$Arguments) { $script:configured += $Program }
$script:tex = @('pdflatex.exe', 'xelatex.exe', 'lualatex.exe', 'bibtex.exe', 'biber.exe')
$script:available = $script:tex + @('codex.cmd', 'gswin64c.exe')
$script:installed = @(); $script:configured = @(); $script:failInstall = $false
Install-Prerequisites
Assert ($script:installed.Count -eq 0 -and $script:configured.Count -eq 0) 'Existing tools must remain unchanged'

$script:available = @('gswin64c.exe')
Install-Prerequisites
Assert (($script:installed -join ',') -eq 'MiKTeX.MiKTeX,OpenAI.Codex') 'Missing LaTeX and Codex must be installed'
Assert ($script:configured -contains 'initexmf.exe') 'New MiKTeX must enable missing package downloads'

$script:available = @('gswin64c.exe'); $script:installed = @(); $script:failInstall = $true
$failed = $false
try { Install-Prerequisites } catch { $failed = $_ -match 'Fixture download failure' }
Assert $failed 'Failed installation must propagate to NSIS'
Assert ($script:installed.Count -eq 1) 'Stop at the first failed prerequisite'

$script:available = @('pdflatex.exe', 'codex.exe', 'gswin64c.exe'); $script:installed = @(); $script:failInstall = $false
$failed = $false
try { Install-Prerequisites } catch { $failed = $_ -match 'LaTeX tools missing' }
Assert $failed 'An incomplete existing TeX distribution must be reported'
Assert ($script:installed.Count -eq 0) 'Do not silently install a competing TeX distribution'

$CheckOnly = $true; $script:available = @(); $script:installed = @()
$failed = $false
try { Install-Prerequisites } catch { $failed = $true }
Assert ($failed -and $script:installed.Count -eq 0) 'CheckOnly must never install anything'
$CheckOnly = $false; $script:available = $script:tex + 'codex.exe'; $script:started = $false
function Invoke-WebRequest { }
function Get-FileHash { [pscustomobject]@{ Hash = $script:hash } }
function Start-Process {
    $script:started = $true
    $script:available += 'gswin64c.exe'
    [pscustomobject]@{ ExitCode = 0 }
}
$script:hash = 'invalid-download'
$failed = $false
try { Install-Prerequisites } catch { $failed = $_ -match 'checksum verification failed' }
Assert ($failed -and !$script:started) 'Never execute an unverified Ghostscript download'

$script:hash = '52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50'
Install-Prerequisites
Assert $script:started 'Verified Ghostscript download must launch the vendor wizard'
Write-Host 'PASS: 7 prerequisite scenarios and native exit-code handling'
