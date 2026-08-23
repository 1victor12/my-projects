$jarvisDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
$model = 'llama3.2:1b'
$opensslCandidates = @("C:\Program Files\Git\usr\bin\openssl.exe", "C:\Program Files (x86)\Git\usr\bin\openssl.exe")

function Log($msg) {
    Add-Content -Path "$jarvisDir\.watchdog.log" -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
}

function Rotate($file) {
    if ((Test-Path $file) -and ((Get-Item $file).Length -gt 5MB)) {
        Set-Content -Path $file -Value ""
        Log "Rotated oversized log: $file"
    }
}

while ($true) {
    try {
        # 1. Port 8124 hijacked by something else -> evict it
        $port = Get-NetTCPConnection -LocalPort 8124 -State Listen -ErrorAction SilentlyContinue
        if ($port -and $port.OwningProcess) {
            $proc = Get-Process -Id $port.OwningProcess -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -ne 'node') {
                Log "Port 8124 hijacked by $($proc.ProcessName) (PID $($proc.Id)) - evicting"
                Stop-Process -Id $proc.Id -Force
                Start-Sleep -Seconds 2
            }
        }

        # 2. JARVIS server dead -> restart
        if (-not (Get-NetTCPConnection -LocalPort 8124 -State Listen -ErrorAction SilentlyContinue)) {
            Start-Process node -ArgumentList "`"$jarvisDir\server.js`"" -WindowStyle Hidden
            Log "Revived JARVIS server"
            Start-Sleep -Seconds 5
        }

        # 3. HTTPS certs missing -> regenerate (mic needs them)
        if (-not (Test-Path "$jarvisDir\cert.pem") -or -not (Test-Path "$jarvisDir\key.pem")) {
            $openssl = $opensslCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
            if ($openssl) {
                & $openssl req -x509 -newkey rsa:2048 -keyout "$jarvisDir\key.pem" -out "$jarvisDir\cert.pem" -days 825 -nodes -subj "/CN=jarvis-local" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>$null
                Log "Regenerated HTTPS certificates - restarting server to use them"
                $p = Get-NetTCPConnection -LocalPort 8124 -State Listen -ErrorAction SilentlyContinue
                if ($p) { Stop-Process -Id $p.OwningProcess -Force }
                Start-Sleep -Seconds 2
                Start-Process node -ArgumentList "`"$jarvisDir\server.js`"" -WindowStyle Hidden
            }
        }

        # 4. Ollama dead -> restart
        if (-not (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue)) {
            if (Test-Path $ollamaExe) {
                $env:OLLAMA_FLASH_ATTENTION = '1'
                $env:OLLAMA_KV_CACHE_TYPE = 'q8_0'
                Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
                Log "Revived Ollama brain"
                Start-Sleep -Seconds 5
            }
        }

        # 5. AI model missing -> download it again
        if (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue) {
            $listed = & $ollamaExe list 2>$null
            if ($listed -and -not ($listed -match [regex]::Escape($model))) {
                Log "Model $model missing - pulling it again"
                Start-Process $ollamaExe -ArgumentList "pull", $model -WindowStyle Hidden
            }
        }

        # 6. Keep logs small
        Rotate "$jarvisDir\.watchdog.log"
        Rotate "$jarvisDir\server-error.log"
    } catch {
        Log "ERROR: $_"
    }
    Start-Sleep -Seconds 60
}
