$ErrorActionPreference = 'Continue'
$failed = $false
for ($i = 1; $i -le 15; $i++) {
    Write-Host "`n============================================================"
    Write-Host "  PASADA $i / 15 DE E2E"
    Write-Host "============================================================"
    $logPath = "tests/e2e-logs/pass-$i.log"
    cmd.exe /c "npm.cmd run test:e2e 2>&1" | Tee-Object -FilePath $logPath
    $code = $LASTEXITCODE
    Write-Host "PASADA $i FINALIZADA CON EXIT CODE: $code (Log: $logPath)"
    if ($code -ne 0) {
        Write-Host ">>> FALLO DETECTADO EN PASADA $i <<<"
        $failed = $true
        break
    }
}
if (-not $failed) {
    Write-Host "`n============================================================"
    Write-Host ">>> 15/15 PASADAS EXITOSAS SIN FALLOS <<<"
    Write-Host "============================================================"
}
