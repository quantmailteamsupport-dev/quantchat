@echo off
REM =====================================================
REM QuantChat FULLY AUTOMATED Deployment
REM Run this ONCE and walk away - no input needed!
REM =====================================================

setlocal enabledelayedexpansion

color 0A
title QuantChat - Automated Azure Deployment

echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   QuantChat - FULLY AUTOMATED DEPLOYMENT          ║
echo ║   This script will deploy everything automatically║
echo ║   Just run it and check back in 15 minutes!       ║
echo ╚════════════════════════════════════════════════════╝
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "!SCRIPT_DIR!"

REM =====================================================
REM Check Prerequisites (fail loudly if missing)
REM =====================================================
echo [1/5] Checking prerequisites...

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

powershell -Command "az --version" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ╔════════════════════════════════════════════════════╗
    echo ║ ERROR: Azure CLI is not installed!                ║
    echo ║                                                   ║
    echo ║ Please install Azure CLI:                         ║
    echo ║ https://aka.ms/installazurecliwindows             ║
    echo ║                                                   ║
    echo ║ After installation, run this script again.        ║
    echo ╚════════════════════════════════════════════════════╝
    pause
    exit /b 1
)

echo [+] Docker found
echo [+] Azure CLI found
echo.

REM =====================================================
REM Step 1: Check Azure Authentication
REM =====================================================
echo [2/5] Checking Azure authentication...

powershell -Command "az account show" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Not logged into Azure. Starting login...
    echo [*] A browser window will open. Please complete the login process.
    timeout /t 3
    powershell -Command "az login"
    if %ERRORLEVEL% NEQ 0 (
        echo [!] Azure login failed. Exiting.
        pause
        exit /b 1
    )
)

for /f "delims=" %%i in ('powershell -Command "az account show --query name -o tsv"') do set "ACCOUNT=%%i"
echo [+] Logged in as: !ACCOUNT!
echo.

REM =====================================================
REM Step 2: Build Docker Image
REM =====================================================
echo [3/5] Building Docker image...
echo [*] This may take 2-3 minutes (building from source)...
echo.

docker build -t quantchat:latest . >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Failed to build Docker image
    echo     Please check that Dockerfile exists and is valid
    pause
    exit /b 1
)

echo [+] Docker image built successfully
echo.

REM =====================================================
REM Step 3: Deploy to Azure
REM =====================================================
echo [4/5] Deploying to Azure...
echo [*] Creating resources (this takes 5-10 minutes)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!Deploy-AzureQuantChat.ps1" -ResourceGroup "quantchat-prod" -AppName "quantchat" -Location "eastus"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] ERROR: Deployment failed
    echo     Check the output above for details
    pause
    exit /b 1
)

echo.
echo [+] Deployment completed!
echo.

REM =====================================================
REM Step 4: Get Container Details
REM =====================================================
echo [5/5] Getting application URL...
echo [*] Waiting for container to be ready (may take 2-3 minutes)...
echo.

setlocal enabledelayedexpansion
set /a "RETRIES=0"
set /a "MAX_RETRIES=30"

:wait_for_container
if !RETRIES! geq !MAX_RETRIES! (
    echo [!] Timeout waiting for container to start
    echo     Try checking later with:
    echo     az container show -g quantchat-prod -n quantchat --query ipAddress.fqdn
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
REM Success!
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
echo 📋 DEPLOYMENT SUMMARY:
echo    Resource Group .......... quantchat-prod
echo    Container Registry ...... quantchatregistry.azurecr.io
echo    Container Instance ...... quantchat
echo    Database ............... quantchat-db-prod
echo    Redis Cache ............ quantchat-redis
echo    Region ................. East US
echo.
echo 📝 NEXT STEPS:
echo    1. Open browser: http://!FQDN!:3000
echo    2. You should see the QuantChat login page
echo    3. Configure Google OAuth credentials for login
echo    4. Access admin dashboard at /admin
echo.
echo 📊 MONITORING:
echo    View logs:    az container logs -g quantchat-prod -n quantchat --follow
echo    Check status: az container show -g quantchat-prod -n quantchat
echo    Stop app:     az container stop -g quantchat-prod -n quantchat
echo    Start app:    az container start -g quantchat-prod -n quantchat
echo.
echo 💰 ESTIMATED MONTHLY COST: $75-180
echo    Container: $15-50 | Database: $40-100 | Redis: $20-30
echo.
echo 🎉 CONGRATULATIONS! Your app is deployed and ready to use!
echo.
echo ════════════════════════════════════════════════════════════════════
echo.

REM Copy URL to clipboard if possible
powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText('http://!FQDN!:3000')" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✓ Application URL copied to clipboard!
    echo   (You can paste it directly into your browser)
)

echo.
pause
