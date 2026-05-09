@echo off
REM QuantChat Azure Deployment Batch File
REM This batch file runs the PowerShell deployment script

setlocal enabledelayedexpansion

echo.
echo =============================================
echo   QuantChat Azure Deployment
echo =============================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Change to the QuantChat directory
cd /d "%SCRIPT_DIR%"

REM Run the PowerShell script
echo Running deployment script...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Deploy-AzureQuantChat.ps1" -ResourceGroup "quantchat-prod" -AppName "quantchat" -Location "eastus"

REM Check if the deployment was successful
if %ERRORLEVEL% EQU 0 (
    echo.
    echo =============================================
    echo   ✅ Deployment completed successfully!
    echo =============================================
    echo.
) else (
    echo.
    echo =============================================
    echo   ❌ Deployment failed with error code: %ERRORLEVEL%
    echo =============================================
    echo.
)

pause
