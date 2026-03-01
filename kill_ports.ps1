$ports = @(3001, 5173)

function Get-ProcessOnPort {
    param($port)
    return Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
}

foreach ($port in $ports) {
    $attempts = 0
    $maxAttempts = 3
    
    do {
        $pids = Get-ProcessOnPort -port $port
        
        if ($pids) {
            Write-Host "Port $port is in use by PID(s): $pids. Attempting to kill..."
            foreach ($id in $pids) {
                # Skip if it's 0 (System Idle) or 4 (System) - unlikely for these ports but safety first
                if ($id -gt 4) {
                    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
                }
            }
            Start-Sleep -Seconds 1
        }
        else {
            Write-Host "Port $port is free."
            break
        }
        $attempts++
    } while ($attempts -lt $maxAttempts)
    
    # Final check
    if (Get-ProcessOnPort -port $port) {
        Write-Warning "Failed to free port $port. Startup might fail."
    }
}
Exit 0
