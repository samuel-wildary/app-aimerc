$ErrorActionPreference = 'SilentlyContinue'
Stop-ScheduledTask -TaskName 'AiMerc Sync Agent'
Unregister-ScheduledTask -TaskName 'AiMerc Sync Agent' -Confirm:$false
Remove-Item (Join-Path $env:ProgramFiles 'AiMerc\Sync Agent') -Recurse -Force
Write-Host 'AiMerc Sync Agent removido. Os logs e a configuracao foram preservados em ProgramData.'
