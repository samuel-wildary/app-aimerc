param(
  [switch]$Install,
  [string]$SourceDirectory = '',
  [string]$SourceExecutable = '',
  [string]$InstallConfigPath = ''
)

$ErrorActionPreference = 'Stop'

# Hide only PowerShell's console. The Windows Forms configuration window stays visible.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AiMercConsoleWindow {
  [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr handle, int command);
  public static void Hide() {
    IntPtr handle = GetConsoleWindow();
    if (handle != IntPtr.Zero) ShowWindow(handle, 0);
  }
}
'@
[AiMercConsoleWindow]::Hide()

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$installDirectory = Join-Path $env:ProgramFiles 'AiMerc\Sync Agent'
$dataDirectory = Join-Path $env:ProgramData 'AiMerc\SyncAgent'
$configPath = Join-Path $dataDirectory 'agent.env'
$taskName = 'AiMerc Sync Agent'

function Read-AgentConfig {
  $values = @{}
  if (Test-Path $configPath) {
    foreach ($line in Get-Content $configPath) {
      if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim() }
    }
  }
  return $values
}

function Config-Value($values, $key, $fallback) {
  if ($values.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($values[$key])) { return $values[$key] }
  return $fallback
}

function Add-Field($form, $label, $top, $value = '', $password = $false) {
  $caption = New-Object System.Windows.Forms.Label
  $caption.Text = $label
  $caption.Location = New-Object System.Drawing.Point(24, $top)
  $caption.Size = New-Object System.Drawing.Size(430, 20)
  $form.Controls.Add($caption)
  $input = New-Object System.Windows.Forms.TextBox
  $input.Location = New-Object System.Drawing.Point(24, ($top + 22))
  $input.Size = New-Object System.Drawing.Size(430, 28)
  $input.Text = $value
  $input.UseSystemPasswordChar = $password
  $input.Tag = $caption
  $form.Controls.Add($input)
  return $input
}

$current = Read-AgentConfig
if (-not [string]::IsNullOrWhiteSpace($InstallConfigPath) -and (Test-Path $InstallConfigPath)) {
  $pending = Get-Content -Raw $InstallConfigPath | ConvertFrom-Json
  foreach ($property in $pending.PSObject.Properties) { $current[$property.Name] = [string]$property.Value }
}
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Configurar AiMerc Sync Agent'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(480, 690)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Conexao do supermercado'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.Size = New-Object System.Drawing.Size(430, 32)
$form.Controls.Add($title)

$apiUrl = Add-Field $form 'Backend AiMerc' 64 (Config-Value $current 'AIMERC_API_URL' 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api')
$agentToken = Add-Field $form 'Token da loja (gerado no SaaS)' 124 (Config-Value $current 'AIMERC_AGENT_TOKEN' '') $true

$providerLabel = New-Object System.Windows.Forms.Label
$providerLabel.Text = 'Sistema ERP'
$providerLabel.Location = New-Object System.Drawing.Point(24, 184)
$providerLabel.Size = New-Object System.Drawing.Size(430, 20)
$form.Controls.Add($providerLabel)
$provider = New-Object System.Windows.Forms.ComboBox
$provider.Location = New-Object System.Drawing.Point(24, 206)
$provider.Size = New-Object System.Drawing.Size(430, 28)
$provider.DropDownStyle = 'DropDownList'
[void]$provider.Items.AddRange(@('SYSPDV', 'VAREJO_FACIL', 'SOLIDCON', 'SOLICOM', 'GENERIC_JSON'))
$provider.SelectedItem = Config-Value $current 'ERP_PROVIDER' 'SYSPDV'
$form.Controls.Add($provider)

$erpUrl = Add-Field $form 'URL local de produtos do ERP' 244 (Config-Value $current 'ERP_API_URL' '')

$authLabel = New-Object System.Windows.Forms.Label
$authLabel.Text = 'Autenticacao do ERP'
$authLabel.Location = New-Object System.Drawing.Point(24, 304)
$authLabel.Size = New-Object System.Drawing.Size(430, 20)
$form.Controls.Add($authLabel)
$authType = New-Object System.Windows.Forms.ComboBox
$authType.Location = New-Object System.Drawing.Point(24, 326)
$authType.Size = New-Object System.Drawing.Size(430, 28)
$authType.DropDownStyle = 'DropDownList'
[void]$authType.Items.AddRange(@('NONE', 'BEARER', 'API_KEY', 'BASIC'))
$authType.SelectedItem = Config-Value $current 'ERP_AUTH_TYPE' 'NONE'
$form.Controls.Add($authType)

$erpToken = Add-Field $form 'Credencial do ERP' 364 (Config-Value $current 'ERP_API_TOKEN' '') $true

function Update-ErpAuthenticationField {
  $selectedAuth = [string]$authType.SelectedItem
  $requiresCredential = $selectedAuth -ne 'NONE'
  $erpToken.Enabled = $requiresCredential
  $erpToken.BackColor = if ($requiresCredential) { [System.Drawing.SystemColors]::Window } else { [System.Drawing.SystemColors]::Control }
  $erpToken.Tag.Text = switch ($selectedAuth) {
    'BEARER' { 'Token Bearer do ERP' }
    'API_KEY' { 'Chave da API do ERP' }
    'BASIC' { 'Usuario e senha do ERP (usuario:senha)' }
    default { 'Credencial do ERP (nao necessaria)' }
  }
}

$authType.Add_SelectedIndexChanged({ Update-ErpAuthenticationField })
Update-ErpAuthenticationField

$itemsPath = Add-Field $form 'Caminho da lista no JSON (opcional)' 424 (Config-Value $current 'ERP_ITEMS_PATH' '')
$interval = Add-Field $form 'Intervalo em segundos (minimo 30)' 484 (Config-Value $current 'SYNC_INTERVAL_SECONDS' '300')

$startWithWindows = New-Object System.Windows.Forms.CheckBox
$startWithWindows.Text = 'Iniciar automaticamente com o Windows (recomendado)'
$startWithWindows.Location = New-Object System.Drawing.Point(24, 544)
$startWithWindows.Size = New-Object System.Drawing.Size(430, 28)
$startWithWindows.Checked = (Config-Value $current 'START_WITH_WINDOWS' 'true') -ne 'false'
$form.Controls.Add($startWithWindows)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(24, 578)
$status.Size = New-Object System.Drawing.Size(430, 26)
$status.ForeColor = [System.Drawing.Color]::Firebrick
$form.Controls.Add($status)

$save = New-Object System.Windows.Forms.Button
$save.Text = if ($Install) { 'Instalar e conectar' } else { 'Salvar e reiniciar' }
$save.Location = New-Object System.Drawing.Point(254, 624)
$save.Size = New-Object System.Drawing.Size(200, 42)
$save.BackColor = [System.Drawing.Color]::FromArgb(18, 201, 138)
$save.FlatStyle = 'Flat'
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancelar'
$cancel.Location = New-Object System.Drawing.Point(24, 624)
$cancel.Size = New-Object System.Drawing.Size(120, 42)
$cancel.Add_Click({ $form.Close() })
$form.Controls.Add($cancel)

$save.Add_Click({
  try {
    if ([string]::IsNullOrWhiteSpace($apiUrl.Text) -or [string]::IsNullOrWhiteSpace($agentToken.Text) -or [string]::IsNullOrWhiteSpace($erpUrl.Text)) {
      throw 'Preencha o backend, o token da loja e a URL do ERP.'
    }
    $selectedAuth = [string]$authType.SelectedItem
    if ($selectedAuth -ne 'NONE' -and [string]::IsNullOrWhiteSpace($erpToken.Text)) {
      throw 'Preencha a credencial exigida pela autenticacao do ERP.'
    }
    $erpCredential = if ($selectedAuth -eq 'NONE') { '' } else { $erpToken.Text }
    if ([int]$interval.Text -lt 30) { throw 'O intervalo minimo e 30 segundos.' }

    if (-not $isAdministrator) {
      $temporaryConfig = Join-Path $env:TEMP ("aimerc-agent-install-{0}.json" -f [guid]::NewGuid().ToString('N'))
      $pendingConfig = [ordered]@{
        AIMERC_API_URL = $apiUrl.Text
        AIMERC_AGENT_TOKEN = $agentToken.Text
        ERP_PROVIDER = [string]$provider.SelectedItem
        ERP_API_URL = $erpUrl.Text
        ERP_AUTH_TYPE = $selectedAuth
        ERP_API_TOKEN = $erpCredential
        ERP_ITEMS_PATH = $itemsPath.Text
        SYNC_INTERVAL_SECONDS = $interval.Text
        START_WITH_WINDOWS = $startWithWindows.Checked.ToString().ToLowerInvariant()
      }
      $pendingConfig | ConvertTo-Json | Set-Content -Path $temporaryConfig -Encoding UTF8
      $acl = Get-Acl $temporaryConfig
      $acl.SetAccessRuleProtection($true, $false)
      $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity.Name, 'FullControl', 'Allow')
      $acl.SetAccessRule($rule)
      Set-Acl -Path $temporaryConfig -AclObject $acl

      try {
        $arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallConfigPath `"$temporaryConfig`""
        if ($Install) { $arguments += " -Install" }
        if (-not [string]::IsNullOrWhiteSpace($SourceExecutable)) {
          $arguments += " -SourceExecutable `"$SourceExecutable`""
        }
        $elevated = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $arguments
        if ($elevated.ExitCode -ne 0) { throw 'A instalacao foi cancelada ou nao foi concluida.' }
        $form.Close()
        return
      } finally {
        Remove-Item $temporaryConfig -Force -ErrorAction SilentlyContinue
      }
    }

    New-Item -ItemType Directory -Force -Path $installDirectory, $dataDirectory | Out-Null
    if ($Install) {
      if ([string]::IsNullOrWhiteSpace($SourceExecutable)) { $SourceExecutable = Join-Path $SourceDirectory 'AiMerc-Agent.exe' }
      Copy-Item $SourceExecutable (Join-Path $installDirectory 'AiMerc-Agent.exe') -Force
      Copy-Item $PSCommandPath (Join-Path $installDirectory 'configure.ps1') -Force
      @'
$ErrorActionPreference = 'SilentlyContinue'
Stop-ScheduledTask -TaskName 'AiMerc Sync Agent'
Unregister-ScheduledTask -TaskName 'AiMerc Sync Agent' -Confirm:$false
Remove-Item (Join-Path $env:ProgramFiles 'AiMerc\Sync Agent') -Recurse -Force
Write-Host 'AiMerc Sync Agent removido. A configuracao foi preservada em ProgramData.'
'@ | Set-Content (Join-Path $installDirectory 'uninstall.ps1') -Encoding UTF8
    }
    $clean = { param($value) ([string]$value).Replace("`r", '').Replace("`n", '') }
    @(
      'AIMERC_API_URL=' + (& $clean $apiUrl.Text)
      'AIMERC_AGENT_TOKEN=' + (& $clean $agentToken.Text)
      'ERP_PROVIDER=' + $provider.SelectedItem
      'ERP_API_URL=' + (& $clean $erpUrl.Text)
      'ERP_AUTH_TYPE=' + $selectedAuth
      'ERP_API_TOKEN=' + (& $clean $erpCredential)
      'ERP_AUTH_HEADER=X-API-Key'
      'ERP_ITEMS_PATH=' + (& $clean $itemsPath.Text)
      'SYNC_INTERVAL_SECONDS=' + [int]$interval.Text
      'START_WITH_WINDOWS=' + $startWithWindows.Checked.ToString().ToLowerInvariant()
      'SYNC_BATCH_SIZE=500'
      'AGENT_VERSION=1.0.0'
      'AIMERC_DATA_DIR=' + $dataDirectory
    ) | Set-Content -Path $configPath -Encoding UTF8
    & icacls.exe $dataDirectory /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
    $executable = Join-Path $installDirectory 'AiMerc-Agent.exe'
    $action = New-ScheduledTaskAction -Execute $executable -Argument "--config `"$configPath`""
    $settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -MultipleInstances IgnoreNew
    $taskParameters = @{ TaskName=$taskName; Action=$action; Settings=$settings; User='SYSTEM'; RunLevel='Highest'; Force=$true }
    if ($startWithWindows.Checked) { $taskParameters.Trigger = New-ScheduledTaskTrigger -AtStartup }
    Register-ScheduledTask @taskParameters | Out-Null
    $startMenu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\AiMerc'
    New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $configureShortcut = $shell.CreateShortcut((Join-Path $startMenu 'Configurar AiMerc Agent.lnk'))
    $configureShortcut.TargetPath = 'powershell.exe'
    $configureShortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $installDirectory 'configure.ps1')`""
    $configureShortcut.WorkingDirectory = $installDirectory
    $configureShortcut.Save()
    $uninstallShortcut = $shell.CreateShortcut((Join-Path $startMenu 'Desinstalar AiMerc Agent.lnk'))
    $uninstallShortcut.TargetPath = 'powershell.exe'
    $uninstallShortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $installDirectory 'uninstall.ps1')`""
    $uninstallShortcut.WorkingDirectory = $installDirectory
    $uninstallShortcut.Save()
    Start-ScheduledTask -TaskName $taskName
    $startupMessage = if ($startWithWindows.Checked) { ' e iniciara automaticamente com o Windows' } else { ', sem inicializacao automatica' }
    [System.Windows.Forms.MessageBox]::Show("Agente instalado, conectado$startupMessage. O status aparecera no SaaS em instantes.", 'AiMerc', 'OK', 'Information') | Out-Null
    $form.Close()
  } catch {
    $status.Text = $_.Exception.Message
  }
})

if (-not [string]::IsNullOrWhiteSpace($InstallConfigPath)) {
  $form.Add_Shown({ $save.PerformClick() })
}

[void]$form.ShowDialog()
