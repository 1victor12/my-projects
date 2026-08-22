$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo
$intervalSeconds = 120

while ($true) {
    try {
        $status = git status --porcelain
        if ($status) {
            git add -A
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            $changed = (git diff --cached --name-only | Measure-Object).Count
            git commit -m "Auto-save: $timestamp ($changed files changed)"
            git push origin main
            Add-Content -Path "$repo\.git\auto-push.log" -Value "[$timestamp] Pushed $changed files"
        }
    } catch {
        Add-Content -Path "$repo\.git\auto-push.log" -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $_"
    }
    Start-Sleep -Seconds $intervalSeconds
}
