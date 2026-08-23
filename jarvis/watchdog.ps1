$jarvisDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

while ($true) {
    try {
        $jarvis = Get-NetTCPConnection -LocalPort 8124 -State Listen -ErrorAction SilentlyContinue
        if (-not $jarvis) {
            Start-Process node -ArgumentList "`"$jarvisDir\server.js`"" -WindowStyle Hidden
            Add-Content -Path "$jarvisDir\.watchdog.log" -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Revived JARVIS server"
        }

        $ollama = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
        if (-not $ollama -and (Test-Path $ollamaExe)) {
            $env:OLLAMA_FLASH_ATTENTION = '1'
            $env:OLLAMA_KV_CACHE_TYPE = 'q8_0'
            Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
            Add-Content -Path "$jarvisDir\.watchdog.log" -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Revived Ollama"
        }
    } catch {
        Add-Content -Path "$jarvisDir\.watchdog.log" -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $_"
    }
    Start-Sleep -Seconds 60
}
