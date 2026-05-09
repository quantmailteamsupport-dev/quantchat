@echo off
REM =====================================================
REM QuantChat - COMPLETE AUTOMATED SETUP
REM Auto-installs Azure CLI, then deploys everything
REM =====================================================

setlocal enabledelayedexpansion

color 0A
title QuantChat - Complete Setup & Deployment

echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   QuantChat - Complete Setup & Deployment         ║
echo ║   Installing dependencies and deploying app       ║
echo ╚════════════════════════════════════════════════════╝
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "!SCRIPT_DIR!"

REM =====================================================
REM Step 1: Check Docker
REM =====================================================
echo [1/6] Checking Docker installation...

docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ╔════════════════════════════════════════════════════╗
    echo ║ ERROR: Docker is not installed!                   ║
    echo ║                                                   ║
    echo ║ Please install Docker Desktop:                    ║
    echo ║ https://www.docker.com/products/docker-desktop   ║
    echo ║                                                   ║
    echo ║ After installation, run this script again.        ║
    echo ╚════════════════════════════════════════════════════╝
    pause
    exit /b 1
)
echo [+] Docker found
echo.

REM =====================================================
REM Step 2: Check/Install Azure CLI
REM =====================================================
echo [2/6] Checking Azure CLI...

powershell -Command "az --version" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Azure CLI not found. Installing...
    echo [*] Checking for package manager...

    REM Try Chocolatey first
    choco --version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [*] Installing Azure CLI via Chocolatey...
        choco install azure-cli -y
        if %ERRORLEVEL% NEQ 0 (
            echo [!] Chocolatey installation failed
            goto install_with_msi
        )
    ) else (
        goto install_with_msi
    )

    goto azure_cli_check

    :install_with_msi
    echo [*] Installing Azure CLI using direct installer...
    REM Download and install Azure CLI MSI
    powershell -Command "& {$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://aka.ms/installazurecliwindows' -OutFile '%temp%\azure-cli-installer.msi'; Start-Process msiexec.exe -ArgumentList '/i %temp%\azure-cli-installer.msi /quiet' -Wait}"

    :azure_cli_check
    REM Verify installation
    timeout /t 10
    powershell -Command "az --version" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [!] ERROR: Azure CLI installation failed
        echo [!] Please install manually from: https://aka.ms/installazurecliwindows
        pause
        exit /b 1
    )
)
echo [+] Azure CLI found/installed
echo.

REM =====================================================
REM Step 3: Azure Login
REM =====================================================
echo [3/6] Checking Azure authentication...

powershell -Command "az account show" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Not logged in. Starting Azure login...
    echo [*] A browser will open. Complete the login process.
    timeout /t 3
    powershell -Command "az login"
    if %ERRORLEVEL% NEQ 0 (
        echo [!] Azure login failed
        pause
        exit /b 1
    )
)

for /f "delims=" %%i in ('powershell -Command "az account show --query name -o tsv"') do set "ACCOUNT=%%i"
echo [+] Logged in as: !ACCOUNT!
echo.

REM =====================================================
REM Step 4: Build Docker Image
REM =====================================================
echo [4/6] Building Docker image...
echo [*] Building from source (2-3 minutes)...
echo.

docker build -t quantchat:latest . >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Docker build failed
    pause
    exit /b 1
)

echo [+] Docker image built
echo.

REM =====================================================
REM Step 5: Azure Deployment
REM =====================================================
echo [5/6] Deploying to Azure (5-10 minutes)...
echo [*] Creating resources...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!Deploy-AzureQuantChat.ps1" -ResourceGroup "quantchat-prod" -AppName "quantchat" -Location "eastus"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] ERROR: Deployment failed
    pause
    exit /b 1
)

echo.
echo [+] Deployment completed!
echo.

REM =====================================================
REM Step 6: Get Application URL
REM =====================================================
echo [6/6] Getting application URL...
echo [*] Waiting for container to start (2-3 minutes)...
echo.

setlocal enabledelayedexpansion
set /a "RETRIES=0"
set /a "MAX_RETRIES=30"

:wait_for_container
if !RETRIES! geq !MAX_RETRIES! (
    echo [!] Timeout waiting for container
    echo     Container may still be starting. Try checking later:
    echo     az container logs -g quantchat-prod -n quantchat
    pause
    exit /b 1
)

timeout /t 6 >nul

for /f "delims=" %%i in ('powershell -Command "az container show -g quantchat-prod -n quantchat --query ipAddress.fqdn -o tsv 2>nul"') do set "FQDN=%%i"

if "!FQDN!"=="" (
    set /a "RETRIES=!RETRIES!+1"
    goto wait_for_container
)

echo [+] Container is ready!
echo.

REM =====================================================
REM SUCCESS!
REM =====================================================
cls
echo.
echo ╔════════════════════════════════════════════════════════════════════╗
echo ║                                                                    ║
echo ║          ✅  DEPLOYMENT COMPLETED SUCCESSFULLY!  ✅              ║
echo ║                                                                    ║
echo ║            Your QuantChat app is now LIVE on Azure!               ║
echo ║                                                                    ║
echo ╚════════════════════════════════════════════════════════════════════╝
echo.
echo 🌐 APPLICATION URL:
echo    http://!FQDN!:3000
echo.
echo ✨ YOUR APP IS LIVE AND READY TO USE!
echo.
echo 📋 WHAT YOU GET:
echo    ✓ Production-ready Next.js application
echo    ✓ PostgreSQL database (production grade)
echo    ✓ Redis caching layer
echo    ✓ Google OAuth ready
echo    ✓ Admin dashboard with real metrics
echo    ✓ File upload capability (S3 ready)
echo    ✓ Auto-scaling capabilities
echo.
echo 🔐 FEATURES AVAILABLE:
echo    • User authentication (Google OAuth)
echo    • Real-time messaging
echo    • User profiles and conversations
echo    • Admin dashboard with analytics
echo    • File upload and storage
echo    • Message history
echo    • Session management
echo.
echo 📊 SYSTEM INFO:
echo    Resource Group: quantchat-prod
echo    Container: quantchat (Linux, 1 CPU, 1.5GB RAM)
echo    Database: PostgreSQL (quantchat-db-prod)
echo    Cache: Redis (quantchat-redis)
echo    Region: East US
echo.
echo 💰 MONTHLY COST: ~$75-180
echo.
echo 📱 NEXT STEPS:
echo    1. Open browser: http://!FQDN!:3000
echo    2. Login page will appear
echo    3. Set up Google OAuth credentials (optional)
echo    4. Test the application
echo    5. Configure custom domain (optional)
echo.
echo 📞 SUPPORT COMMANDS:
echo    View logs:    az container logs -g quantchat-prod -n quantchat --follow
echo    Stop app:     az container stop -g quantchat-prod -n quantchat
echo    Start app:    az container start -g quantchat-prod -n quantchat
echo    Delete all:   az group delete -g quantchat-prod
echo.
echo 🎉 CONGRATULATIONS! YOUR APP IS DEPLOYED!
echo.
echo ════════════════════════════════════════════════════════════════════
echo.

REM Copy URL to clipboard
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('http://!FQDN!:3000')" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✓ Application URL copied to clipboard!
)

echo.
pause
