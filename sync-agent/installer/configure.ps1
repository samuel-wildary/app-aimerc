param(
  [switch]$Install,
  [switch]$SmokeTest,
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

function Find-FirebirdIsql {
  $command = Get-Command isql.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) { return $command.Source }
  $roots = @(
    (Join-Path $env:ProgramFiles 'Firebird'),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Firebird' }),
    'C:\Firebird',
    'C:\SysPDV'
  ) | Where-Object { $_ -and (Test-Path $_) }
  foreach ($root in $roots) {
    $found = Get-ChildItem -LiteralPath $root -Filter isql.exe -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return ''
}

function Firebird-Target($hostName, $portNumber, $databaseName) {
  if ([string]::IsNullOrWhiteSpace($databaseName)) { throw 'Informe o caminho ou alias do banco Firebird.' }
  if ([string]::IsNullOrWhiteSpace($hostName)) { return $databaseName.Trim() }
  return ('{0}/{1}:{2}' -f $hostName.Trim(), [int]$portNumber, $databaseName.Trim())
}

function Wait-FileWritable($path, $timeoutMilliseconds = 10000) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return }
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMilliseconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $stream = [System.IO.File]::Open($path, 'Open', 'ReadWrite', 'None')
      $stream.Dispose()
      return
    } catch {
      Start-Sleep -Milliseconds 200
    }
  }
  throw 'A versao anterior do agente ainda esta em execucao. Aguarde alguns segundos e tente novamente.'
}

function Add-Field($form, $label, $top, $value = '', $password = $false) {
  $caption = New-Object System.Windows.Forms.Label
  $caption.Text = $label
  $caption.Location = New-Object System.Drawing.Point(24, $top)
  $caption.Size = New-Object System.Drawing.Size(430, 20)
  [void]$form.Controls.Add($caption)
  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Location = New-Object System.Drawing.Point(24, ($top + 22))
  $textBox.Size = New-Object System.Drawing.Size(430, 28)
  $textBox.Text = $value
  $textBox.UseSystemPasswordChar = $password
  $textBox.Tag = $caption
  [void]$form.Controls.Add($textBox)
  return $textBox
}

function Add-BrowseButton($form, $textBox, $top, $filter) {
  $textBox.Size = New-Object System.Drawing.Size(360, 28)
  $browse = New-Object System.Windows.Forms.Button
  $browse.Text = 'Procurar'
  $browse.Location = New-Object System.Drawing.Point(390, ($top + 21))
  $browse.Size = New-Object System.Drawing.Size(64, 29)
  $browse.Tag = [pscustomobject]@{ TextBox = $textBox; Filter = $filter }
  $browse.Add_Click({
    $settings = $this.Tag
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = $settings.Filter
    $dialog.CheckFileExists = $true
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $settings.TextBox.Text = $dialog.FileName }
  })
  [void]$form.Controls.Add($browse)
  return $browse
}

$current = Read-AgentConfig
if (-not [string]::IsNullOrWhiteSpace($InstallConfigPath) -and (Test-Path $InstallConfigPath)) {
  $pending = Get-Content -Raw $InstallConfigPath | ConvertFrom-Json
  foreach ($property in $pending.PSObject.Properties) { $current[$property.Name] = [string]$property.Value }
}
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Configurar AiMerc Sync Agent'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(480, 760)
$form.AutoScroll = $true
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

$modeLabel = New-Object System.Windows.Forms.Label
$modeLabel.Text = 'Tipo de conexao com o ERP'
$modeLabel.Location = New-Object System.Drawing.Point(24, 244)
$modeLabel.Size = New-Object System.Drawing.Size(430, 20)
$form.Controls.Add($modeLabel)
$connectionMode = New-Object System.Windows.Forms.ComboBox
$connectionMode.Location = New-Object System.Drawing.Point(24, 266)
$connectionMode.Size = New-Object System.Drawing.Size(430, 28)
$connectionMode.DropDownStyle = 'DropDownList'
[void]$connectionMode.Items.AddRange(@('FIREBIRD', 'HTTP_JSON'))
$defaultMode = if ((Config-Value $current 'ERP_PROVIDER' 'SYSPDV') -eq 'SYSPDV') { 'FIREBIRD' } else { 'HTTP_JSON' }
$connectionMode.SelectedItem = Config-Value $current 'ERP_CONNECTION_MODE' $defaultMode
$form.Controls.Add($connectionMode)

$erpUrl = Add-Field $form 'URL local de produtos do ERP' 304 (Config-Value $current 'ERP_API_URL' '')
$authLabel = New-Object System.Windows.Forms.Label
$authLabel.Text = 'Autenticacao do ERP'
$authLabel.Location = New-Object System.Drawing.Point(24, 364)
$authLabel.Size = New-Object System.Drawing.Size(430, 20)
$form.Controls.Add($authLabel)
$authType = New-Object System.Windows.Forms.ComboBox
$authType.Location = New-Object System.Drawing.Point(24, 386)
$authType.Size = New-Object System.Drawing.Size(430, 28)
$authType.DropDownStyle = 'DropDownList'
[void]$authType.Items.AddRange(@('NONE', 'BEARER', 'API_KEY', 'BASIC'))
$authType.SelectedItem = Config-Value $current 'ERP_AUTH_TYPE' 'NONE'
$form.Controls.Add($authType)

$erpToken = Add-Field $form 'Credencial do ERP' 424 (Config-Value $current 'ERP_API_TOKEN' '') $true

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

$itemsPath = Add-Field $form 'Caminho da lista no JSON (opcional)' 484 (Config-Value $current 'ERP_ITEMS_PATH' '')

$detectedIsql = Find-FirebirdIsql
$firebirdIsql = Add-Field $form 'Cliente Firebird (isql.exe)' 304 (Config-Value $current 'FIREBIRD_ISQL_PATH' $detectedIsql)
$firebirdIsqlBrowse = Add-BrowseButton $form $firebirdIsql 304 'Firebird isql (isql.exe)|isql.exe|Executaveis (*.exe)|*.exe'
$firebirdHost = Add-Field $form 'Servidor Firebird' 364 (Config-Value $current 'FIREBIRD_HOST' '127.0.0.1')
$firebirdPort = Add-Field $form 'Porta Firebird' 424 (Config-Value $current 'FIREBIRD_PORT' '3050')
$firebirdDatabase = Add-Field $form 'Caminho ou alias do banco Firebird' 484 (Config-Value $current 'FIREBIRD_DATABASE' '')
$firebirdDatabaseBrowse = Add-BrowseButton $form $firebirdDatabase 484 'Banco Firebird (*.fdb;*.gdb)|*.fdb;*.gdb|Todos os arquivos (*.*)|*.*'
$firebirdUser = Add-Field $form 'Usuario Firebird' 544 (Config-Value $current 'FIREBIRD_USER' 'SYSDBA')
$firebirdPassword = Add-Field $form 'Senha Firebird' 604 (Config-Value $current 'FIREBIRD_PASSWORD' '') $true
$firebirdCharset = Add-Field $form 'Charset Firebird' 664 (Config-Value $current 'FIREBIRD_CHARSET' 'WIN1252')

$httpControls = @($erpUrl, $erpUrl.Tag, $authLabel, $authType, $erpToken, $erpToken.Tag, $itemsPath, $itemsPath.Tag)
$firebirdControls = @(
  $firebirdIsql, $firebirdIsql.Tag, $firebirdIsqlBrowse,
  $firebirdHost, $firebirdHost.Tag, $firebirdPort, $firebirdPort.Tag,
  $firebirdDatabase, $firebirdDatabase.Tag, $firebirdDatabaseBrowse,
  $firebirdUser, $firebirdUser.Tag, $firebirdPassword, $firebirdPassword.Tag,
  $firebirdCharset, $firebirdCharset.Tag
)

function Update-ConnectionFields {
  $isFirebird = ([string]$connectionMode.SelectedItem) -eq 'FIREBIRD'
  foreach ($control in $httpControls) { $control.Visible = -not $isFirebird }
  foreach ($control in $firebirdControls) { $control.Visible = $isFirebird }
}

$connectionMode.Add_SelectedIndexChanged({ Update-ConnectionFields })
$provider.Add_SelectedIndexChanged({
  if ([string]$provider.SelectedItem -ne 'SYSPDV' -and [string]$connectionMode.SelectedItem -eq 'FIREBIRD') {
    $connectionMode.SelectedItem = 'HTTP_JSON'
  }
})
Update-ConnectionFields

$interval = Add-Field $form 'Intervalo em segundos (minimo 30)' 724 (Config-Value $current 'SYNC_INTERVAL_SECONDS' '300')

$startWithWindows = New-Object System.Windows.Forms.CheckBox
$startWithWindows.Text = 'Iniciar automaticamente com o Windows (recomendado)'
$startWithWindows.Location = New-Object System.Drawing.Point(24, 784)
$startWithWindows.Size = New-Object System.Drawing.Size(430, 28)
$startWithWindows.Checked = (Config-Value $current 'START_WITH_WINDOWS' 'true') -ne 'false'
$form.Controls.Add($startWithWindows)

$testConnection = New-Object System.Windows.Forms.Button
$testConnection.Text = 'Testar conexao'
$testConnection.Location = New-Object System.Drawing.Point(254, 824)
$testConnection.Size = New-Object System.Drawing.Size(200, 38)
$form.Controls.Add($testConnection)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(24, 870)
$status.Size = New-Object System.Drawing.Size(430, 70)
$status.ForeColor = [System.Drawing.Color]::Firebrick
$form.Controls.Add($status)

$save = New-Object System.Windows.Forms.Button
$save.Text = if ($Install) { 'Instalar e conectar' } else { 'Salvar e reiniciar' }
$save.Location = New-Object System.Drawing.Point(254, 950)
$save.Size = New-Object System.Drawing.Size(200, 42)
$save.BackColor = [System.Drawing.Color]::FromArgb(18, 201, 138)
$save.FlatStyle = 'Flat'
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancelar'
$cancel.Location = New-Object System.Drawing.Point(24, 950)
$cancel.Size = New-Object System.Drawing.Size(120, 42)
$cancel.Add_Click({ $form.Close() })
$form.Controls.Add($cancel)

$testConnection.Add_Click({
  $status.ForeColor = [System.Drawing.Color]::Firebrick
  $status.Text = 'Testando conexao...'
  $form.Refresh()
  try {
    if ([string]$connectionMode.SelectedItem -eq 'FIREBIRD') {
      if (-not (Test-Path -LiteralPath $firebirdIsql.Text -PathType Leaf)) {
        throw 'Selecione o isql.exe da instalacao do Firebird.'
      }
      if ([string]::IsNullOrWhiteSpace($firebirdUser.Text) -or [string]::IsNullOrWhiteSpace($firebirdPassword.Text)) {
        throw 'Informe o usuario e a senha do Firebird.'
      }
      if ([int]$firebirdPort.Text -lt 1 -or [int]$firebirdPort.Text -gt 65535) {
        throw 'A porta do Firebird deve estar entre 1 e 65535.'
      }
      $target = Firebird-Target $firebirdHost.Text $firebirdPort.Text $firebirdDatabase.Text
      $testScript = Join-Path $env:TEMP ("aimerc-firebird-test-{0}.sql" -f [guid]::NewGuid().ToString('N'))
      $previousUser = $env:ISC_USER
      $previousPassword = $env:ISC_PASSWORD
      try {
        @'
SET ECHO OFF;
SET HEADING OFF;
SET LIST OFF;
SET BAIL ON;
SET TRANSACTION READ ONLY READ COMMITTED RECORD_VERSION;
SELECT FIRST 1
  'AIMERC_FIREBIRD_OK' AS STATUS,
  TRIM(p.PROCOD) AS SKU,
  TRIM(p.PRODES) AS PRODUCT_NAME,
  TRIM(s.SECDES) AS CATEGORY_NAME,
  TRIM(p.PROUNID) AS UNIT_NAME,
  p.PROPESVAR AS VARIABLE_WEIGHT,
  p.PROFORLIN AS OUT_OF_LINE,
  TRIM(pa.PROCODAUX) AS BARCODE,
  p.PROPRC1 AS CURRENT_PRICE,
  COALESCE((
    SELECT FIRST 1 es.ESTATU
    FROM ESTOQUE es
    WHERE es.PROCOD = p.PROCOD
  ), 0) AS STOCK,
  COALESCE((
    SELECT FIRST 1 ep.ENCPROPRCOFE
    FROM ENCARTE e
    JOIN ENCARTE_PRODUTO ep ON ep.ENCCOD = e.ENCCOD
    WHERE ep.PROCOD = p.PROCOD
      AND e.ENCSTATUS = 'A'
      AND CURRENT_DATE BETWEEN CAST(e.ENCDATINI AS DATE) AND CAST(e.ENCDATFIM AS DATE)
  ), 0) AS PROMO_PRICE,
  (
    SELECT FIRST 1 ap.AUPPRCVDAVAR
    FROM AUDITORIA_PRECO ap
    WHERE ap.PROCOD = p.PROCOD
    ORDER BY ap.AUPDAT DESC
  ) AS AUDITED_PRICE
FROM PRODUTO p
LEFT JOIN PRODUTOAUX pa ON pa.PROCOD = p.PROCOD
LEFT JOIN SECAO s ON s.SECCOD = p.SECCOD;
QUIT;
'@ | Set-Content -LiteralPath $testScript -Encoding ASCII
        $env:ISC_USER = $firebirdUser.Text
        $env:ISC_PASSWORD = $firebirdPassword.Text
        $output = & $firebirdIsql.Text '-charset' $firebirdCharset.Text '-input' $testScript $target 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0 -or $output -notmatch 'AIMERC_FIREBIRD_OK') {
          throw ("Firebird recusou a conexao. {0}" -f $output.Trim())
        }
      } finally {
        $env:ISC_USER = $previousUser
        $env:ISC_PASSWORD = $previousPassword
        Remove-Item -LiteralPath $testScript -Force -ErrorAction SilentlyContinue
      }
      $status.ForeColor = [System.Drawing.Color]::ForestGreen
      $status.Text = 'Conexao e estrutura SysPDV confirmadas. O banco respondeu em modo somente leitura.'
    } else {
      if ([string]::IsNullOrWhiteSpace($erpUrl.Text)) { throw 'Informe a URL local do ERP.' }
      $headers = @{ Accept = 'application/json' }
      $selectedAuth = [string]$authType.SelectedItem
      if ($selectedAuth -eq 'BEARER') { $headers.Authorization = 'Bearer ' + $erpToken.Text }
      if ($selectedAuth -eq 'API_KEY') { $headers.'X-API-Key' = $erpToken.Text }
      if ($selectedAuth -eq 'BASIC') {
        $headers.Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($erpToken.Text))
      }
      Invoke-WebRequest -Uri $erpUrl.Text -Headers $headers -UseBasicParsing -TimeoutSec 30 | Out-Null
      $status.ForeColor = [System.Drawing.Color]::ForestGreen
      $status.Text = 'Conexao HTTP com o ERP confirmada.'
    }
  } catch {
    $status.ForeColor = [System.Drawing.Color]::Firebrick
    $status.Text = $_.Exception.Message
  }
})

$save.Add_Click({
  try {
    if ([string]::IsNullOrWhiteSpace($apiUrl.Text) -or [string]::IsNullOrWhiteSpace($agentToken.Text)) {
      throw 'Preencha o backend e o token da loja.'
    }
    $selectedMode = [string]$connectionMode.SelectedItem
    if ($selectedMode -eq 'FIREBIRD') {
      if ([string]$provider.SelectedItem -ne 'SYSPDV') { throw 'A conexao Firebird direta esta disponivel para o SysPDV.' }
      if (-not (Test-Path -LiteralPath $firebirdIsql.Text -PathType Leaf)) { throw 'Selecione o isql.exe do Firebird.' }
      if ([string]::IsNullOrWhiteSpace($firebirdDatabase.Text)) { throw 'Informe o caminho ou alias do banco Firebird.' }
      if ([string]::IsNullOrWhiteSpace($firebirdUser.Text) -or [string]::IsNullOrWhiteSpace($firebirdPassword.Text)) {
        throw 'Informe o usuario e a senha do Firebird.'
      }
      if ([int]$firebirdPort.Text -lt 1 -or [int]$firebirdPort.Text -gt 65535) { throw 'Porta Firebird invalida.' }
    } elseif ([string]::IsNullOrWhiteSpace($erpUrl.Text)) {
      throw 'Preencha a URL do ERP.'
    }
    $selectedAuth = [string]$authType.SelectedItem
    if ($selectedMode -eq 'HTTP_JSON' -and $selectedAuth -ne 'NONE' -and [string]::IsNullOrWhiteSpace($erpToken.Text)) {
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
        ERP_CONNECTION_MODE = $selectedMode
        ERP_API_URL = $erpUrl.Text
        ERP_AUTH_TYPE = $selectedAuth
        ERP_API_TOKEN = $erpCredential
        ERP_ITEMS_PATH = $itemsPath.Text
        FIREBIRD_ISQL_PATH = $firebirdIsql.Text
        FIREBIRD_HOST = $firebirdHost.Text
        FIREBIRD_PORT = $firebirdPort.Text
        FIREBIRD_DATABASE = $firebirdDatabase.Text
        FIREBIRD_USER = $firebirdUser.Text
        FIREBIRD_PASSWORD = $firebirdPassword.Text
        FIREBIRD_CHARSET = $firebirdCharset.Text
        FIREBIRD_OUTPUT_ENCODING = 'windows-1252'
        FIREBIRD_TIMEOUT_SECONDS = '120'
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
      $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      if ($existingTask) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      }
      if ([string]::IsNullOrWhiteSpace($SourceExecutable)) { $SourceExecutable = Join-Path $SourceDirectory 'AiMerc-Agent.exe' }
      $installedExecutable = Join-Path $installDirectory 'AiMerc-Agent.exe'
      Wait-FileWritable $installedExecutable
      Copy-Item $SourceExecutable $installedExecutable -Force
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
      'ERP_CONNECTION_MODE=' + $selectedMode
      'ERP_API_URL=' + (& $clean $erpUrl.Text)
      'ERP_AUTH_TYPE=' + $selectedAuth
      'ERP_API_TOKEN=' + (& $clean $erpCredential)
      'ERP_AUTH_HEADER=X-API-Key'
      'ERP_ITEMS_PATH=' + (& $clean $itemsPath.Text)
      'FIREBIRD_ISQL_PATH=' + (& $clean $firebirdIsql.Text)
      'FIREBIRD_HOST=' + (& $clean $firebirdHost.Text)
      'FIREBIRD_PORT=' + [int]$firebirdPort.Text
      'FIREBIRD_DATABASE=' + (& $clean $firebirdDatabase.Text)
      'FIREBIRD_USER=' + (& $clean $firebirdUser.Text)
      'FIREBIRD_PASSWORD=' + (& $clean $firebirdPassword.Text)
      'FIREBIRD_CHARSET=' + (& $clean $firebirdCharset.Text)
      'FIREBIRD_OUTPUT_ENCODING=windows-1252'
      'FIREBIRD_TIMEOUT_SECONDS=120'
      'SYNC_INTERVAL_SECONDS=' + [int]$interval.Text
      'START_WITH_WINDOWS=' + $startWithWindows.Checked.ToString().ToLowerInvariant()
      'SYNC_BATCH_SIZE=500'
      'AGENT_VERSION=1.1.1'
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

if ($SmokeTest) {
  Write-Output 'AIMERC_INSTALLER_FORM_OK'
  $form.Dispose()
  return
}

[void]$form.ShowDialog()
