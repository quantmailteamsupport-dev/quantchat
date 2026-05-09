@echo off
REM =====================================================
REM QuantChat Complete Azure Deployment Script
REM =====================================================
REM This script handles the complete deployment process
REM Including Docker build, push, and Azure resource creation

setlocal enabledelayedexpansion

REM Colors and formatting
color 0A
title QuantChat Azure Deployment

echo.
echo ======================================================
echo    QuantChat - Complete Azure Deployment
echo ======================================================
echo.

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
cd /d "!SCRIPT_DIR!"

REM Check for required tools
echo [*] Checking prerequisites...

docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Docker is not installed or not in PATH
    echo     Please install Docker from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo [+] Docker found

powershell -Version 2.0 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: PowerShell not found
    pause
    exit /b 1
)
echo [+] PowerShell found

REM =====================================================
REM Step 1: Build Docker Image
REM =====================================================
echo.
echo [*] Step 1: Building Docker Image...
echo.

docker build -t quantchat:latest .
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Failed to build Docker image
    pause
    exit /b 1
)
echo [+] Docker image built successfully

REM =====================================================
REM Step 2: Get Azure login and create resources
REM =====================================================
echo.
echo [*] Step 2: Preparing Azure resources...
echo.

REM Check if user is logged into Azure
powershell -NoProfile -ExecutionPolicy Bypass -Command "az account show --query name" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Logging into Azure...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "az login"
    if %ERRORLEVEL% NEQ 0 (
        echo [!] ERROR: Azure login failed
        pause
        exit /b 1
    )
)

REM =====================================================
REM Step 3: Run Azure deployment
REM =====================================================
echo.
echo [*] Step 3: Deploying to Azure...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "!SCRIPT_DIR!Deploy-AzureQuantChat.ps1" -ResourceGroup "quantchat-prod" -AppName "quantchat" -Location "eastus"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] ERROR: Deployment failed
    echo     Check the Azure PowerShell script output above for details
    pause
    exit /b 1
)

REM =====================================================
REM Step 4: Verify Deployment
REM =====================================================
echo.
echo [*] Step 4: Verifying deployment...
echo.

REM Wait for container to start
timeout /t 10 /nobreak

REM Get container details
for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "az container show --resource-group quantchat-prod --name quantchat --query ipAddress.fqdn -o tsv"') do set "FQDN=%%i"

echo.
echo ======================================================
echo    ✓ DEPLOYMENT COMPLETED SUCCESSFULLY!
echo ======================================================
echo.
echo Application Details:
echo   URL: http://!FQDN!:3000
echo   Region: East US
echo.
echo Container Details:
echo   Name: quantchat
echo   Image: quantchatregistry.azurecr.io/quantchat:latest
echo.
echo Next Steps:
echo   1. Wait 2-3 minutes for application to fully start
echo   2. Open browser and navigate to: http://!FQDN!:3000
echo   3. Test login with Google OAuth
echo   4. Monitor logs: az container logs -g quantchat-prod -n quantchat --follow
echo.
echo Resource Management:
echo   View resources: https://portal.azure.com
echo   Stop container: az container delete -g quantchat-prod -n quantchat
echo   View logs: az container logs -g quantchat-prod -n quantchat
echo.
echo ======================================================
echo.

pause
