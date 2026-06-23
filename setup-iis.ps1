# =====================================================================
#  NOIZZ — automated IIS setup script
#  --------------------------------------------------------------------
#  Run this ON THE IIS SERVER, from the folder that contains the four
#  files (noizz.html, data.ashx, web.config, setup-iis.ps1).
#
#  HOW TO RUN:
#    1. Put all the files in one folder on the server, e.g. C:\noizz-files
#    2. Click Start, type "PowerShell", right-click "Windows PowerShell"
#       and choose "Run as administrator".
#    3. Run these two lines (adjust the path to where you put the files):
#         cd C:\noizz-files
#         powershell -ExecutionPolicy Bypass -File .\setup-iis.ps1
#
#  It will: enable IIS + ASP.NET, copy the files to the site folder,
#  create the App_Data folder with write permission, create an IIS site,
#  and print the address to open.
# =====================================================================

param(
  [string]$SiteName = "NOIZZ",
  [int]   $Port     = 8080,
  [string]$SitePath = "C:\inetpub\noizz"
)

$ErrorActionPreference = "Stop"

function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

# --- Must run elevated ----------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "Please run PowerShell AS ADMINISTRATOR and try again." -ForegroundColor Red
  exit 1
}

# --- 1. Enable IIS + ASP.NET ----------------------------------------
Section "1/5  Enabling IIS and ASP.NET (this can take a few minutes)"
$isServer = (Get-CimInstance Win32_OperatingSystem).ProductType -ne 1
if ($isServer) {
  # Windows Server
  Import-Module ServerManager -ErrorAction SilentlyContinue
  $features = @(
    "Web-Server","Web-Asp-Net45","Web-Net-Ext45",
    "Web-ISAPI-Ext","Web-ISAPI-Filter",
    "Web-Default-Doc","Web-Static-Content",
    "Web-Mgmt-Console","Web-Mgmt-Service"
  )
  Install-WindowsFeature -Name $features -IncludeManagementTools | Out-Null
} else {
  # Windows 10 / 11
  $features = @(
    "IIS-WebServerRole","IIS-WebServer","IIS-ASPNET45",
    "IIS-NetFxExtensibility45","IIS-ISAPIExtensions","IIS-ISAPIFilter",
    "IIS-DefaultDocument","IIS-StaticContent",
    "IIS-ManagementConsole"
  )
  foreach ($f in $features) {
    Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart -ErrorAction SilentlyContinue | Out-Null
  }
}
Write-Host "IIS and ASP.NET are enabled." -ForegroundColor Green

Import-Module WebAdministration

# --- 2. Copy files to the site folder -------------------------------
Section "2/5  Copying files to $SitePath"
$src = $PSScriptRoot
foreach ($f in @("noizz.html","data.ashx","web.config")) {
  if (-not (Test-Path (Join-Path $src $f))) {
    Write-Host "Missing file: $f  (run the script from the folder that holds the files)" -ForegroundColor Red
    exit 1
  }
}
New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $SitePath "App_Data") | Out-Null
Copy-Item (Join-Path $src "noizz.html") $SitePath -Force
Copy-Item (Join-Path $src "data.ashx")  $SitePath -Force
Copy-Item (Join-Path $src "web.config") $SitePath -Force
Write-Host "Files copied." -ForegroundColor Green

# --- 3. Create the IIS app pool + site ------------------------------
Section "3/5  Creating the IIS site '$SiteName' on port $Port"
$poolName = $SiteName
if (Test-Path "IIS:\AppPools\$poolName") { Remove-WebAppPool -Name $poolName }
New-WebAppPool -Name $poolName | Out-Null
Set-ItemProperty "IIS:\AppPools\$poolName" managedRuntimeVersion "v4.0"

if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) { Remove-Website -Name $SiteName }
New-Website -Name $SiteName -Port $Port -PhysicalPath $SitePath -ApplicationPool $poolName | Out-Null
Write-Host "Site created." -ForegroundColor Green

# --- 4. Give App_Data write permission ------------------------------
Section "4/5  Granting write permission to App_Data"
$appData = Join-Path $SitePath "App_Data"
$identity = "IIS AppPool\$poolName"
$acl = Get-Acl $appData
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  $identity, "Modify",
  "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.AddAccessRule($rule)
Set-Acl $appData $acl
Write-Host "Permission granted to $identity." -ForegroundColor Green

# --- 5. Open the firewall port + done -------------------------------
Section "5/5  Opening firewall port $Port"
try {
  New-NetFirewallRule -DisplayName "NOIZZ (port $Port)" -Direction Inbound `
    -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction Stop | Out-Null
  Write-Host "Firewall rule added." -ForegroundColor Green
} catch {
  Write-Host "Could not add firewall rule automatically (you may add it manually)." -ForegroundColor Yellow
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" } |
  Select-Object -First 1).IPAddress

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host " NOIZZ is deployed!" -ForegroundColor Green
Write-Host " On this server open:   http://localhost:$Port/" -ForegroundColor Green
if ($ip) { Write-Host " From other computers:  http://$ip`:$Port/" -ForegroundColor Green }
Write-Host " (Share that address with your team.)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
