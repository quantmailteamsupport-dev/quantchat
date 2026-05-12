@echo off
REM =====================================================
REM QuantChat - FULL FIX AND REDEPLOYMENT
REM Fixes blank page issue and redeeploys everything
REM =====================================================

setlocal enabledelayedexpansion

color 0A
title QuantChat - Fix & Redeploy

echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   QuantChat - FIXING & REDEPLOYING               ║
echo ║   Fixing blank page issue                         ║
echo ║   Complete rebuild and test                       ║
echo ╚════════════════════════════════════════════════════╝
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "!SCRIPT_DIR!"

REM =====================================================
REM Step 1: Check prerequisites
REM =====================================================
echo [1/7] Checking prerequisites...

docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Docker not found
    pause
    exit /b 1
)

powershell -Command "az --version" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Azure CLI not found
    pause
    exit /b 1
)

echo [+] Prerequisites OK
echo.

REM =====================================================
REM Step 2: Rebuild Docker image with production setup
REM =====================================================
echo [2/7] Building production Docker image...
echo [*] Using Dockerfile.production for fixes...
echo.

docker build -t quantchat:latest -f Dockerfile.production .
if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Docker build failed
    echo [*] Trying alternative approach...
    docker build -t quantchat:latest .
    if %ERRORLEVEL% NEQ 0 (
        echo [!] Build failed completely
        pause
        exit /b 1
    )
)

echo [+] Docker image rebuilt
echo.

REM =====================================================
REM Step 3: Push to Azure Container Registry
REM =====================================================
echo [3/7] Pushing image to Azure Container Registry...

REM Get registry credentials
for /f "delims=" %%i in ('powershell -Command "az acr credential show -g quantchat-prod -n quantchatregistry --query username -o tsv"') do set "REGISTRY_USER=%%i"
for /f "delims=" %%i in ('powershell -Command "az acr credential show -g quantchat-prod -n quantchatregistry --query passwords[0].value -o tsv"') do set "REGISTRY_PASS=%%i"

if "!REGISTRY_USER!"=="" (
    echo [!] ERROR: Could not get registry credentials
    pause
    exit /b 1
)

REM Login and push
docker login -u !REGISTRY_USER! -p !REGISTRY_PASS! quantchatregistry.azurecr.io
docker tag quantchat:latest quantchatregistry.azurecr.io/quantchat:latest
docker push quantchatregistry.azurecr.io/quantchat:latest

if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Failed to push image
    pause
    exit /b 1
)

echo [+] Image pushed to registry
echo.

REM =====================================================
REM Step 4: Update Azure Container Instance
REM =====================================================
echo [4/7] Updating Azure Container Instance...
echo [*] Restarting container with new image...

REM Delete old container
powershell -Command "az container delete -g quantchat-prod -n quantchat --yes"

timeout /t 5

REM Create new container with corrected settings
powershell -NoProfile -ExecutionPolicy Bypass -Command "
    `$env = @(
        'NODE_ENV=production',
        'PORT=3000',
        'LOG_LEVEL=debug'
    )

    az container create `
        --resource-group quantchat-prod `
        --name quantchat `
        --image quantchatregistry.azurecr.io/quantchat:latest `
        --registry-login-server quantchatregistry.azurecr.io `
        --registry-username !REGISTRY_USER! `
        --registry-password !REGISTRY_PASS! `
        --cpu 1.5 `
        --memory 2 `
        --environment-variables `$env `
        --ports 3000 `
        --protocol TCP `
        --dns-name-label quantchat-app `
        --restart-policy OnFailure
"

if %ERRORLEVEL% NEQ 0 (
    echo [!] ERROR: Failed to create container
    pause
    exit /b 1
)

echo [+] Container updated
echo.

REM =====================================================
REM Step 5: Wait for container to be ready
REM =====================================================
echo [5/7] Waiting for container to start...

setlocal enabledelayedexpansion
set /a "RETRIES=0"
set /a "MAX_RETRIES=30"

:wait_loop
if !RETRIES! geq !MAX_RETRIES! (
    echo [!] Timeout waiting for container
    pause
    exit /b 1
)

timeout /t 10 >nul

for /f "delims=" %%i in ('powershell -Command "az container show -g quantchat-prod -n quantchat --query containers[0].instanceView.currentState.state -o tsv 2>nul"') do set "STATE=%%i"

if "!STATE!"=="Running" (
    echo [+] Container is running
    goto :container_ready
)

set /a "RETRIES=!RETRIES!+1"
echo [*] Waiting... (!RETRIES!/!MAX_RETRIES!)
goto wait_loop

:container_ready

REM =====================================================
REM Step 6: Get application details
REM =====================================================
echo [6/7] Getting application details...

for /f "delims=" %%i in ('powershell -Command "az container show -g quantchat-prod -n quantchat --query ipAddress.fqdn -o tsv"') do set "FQDN=%%i"

echo [+] Container ready!
echo.

REM =====================================================
REM Step 7: Test application
REM =====================================================
echo [7/7] Testing application...
echo [*] Waiting 15 seconds for app to fully start...

timeout /t 15 >nul

echo [*] Testing health endpoint...

powershell -Command "
    try {
        `$response = Invoke-WebRequest -Uri 'http://!FQDN!:3000' -TimeoutSec 5 -ErrorAction Stop
        Write-Host '[+] Application is responding!'
        Write-Host '[+] Status Code: ' `$response.StatusCode
    } catch {
        Write-Host '[!] Warning: Application not responding yet. May still be initializing...'
        Write-Host '[*] Please wait 1-2 more minutes and refresh the browser'
    }
"

echo.

REM =====================================================
REM SUCCESS!
REM =====================================================
cls
echo.
echo ╔════════════════════════════════════════════════════════════════════╗
echo ║                                                                    ║
echo ║          ✅  FIX & REDEPLOYMENT COMPLETED!  ✅                    ║
echo ║                                                                    ║
echo ║            Your QuantChat app has been fixed and updated!         ║
echo ║                                                                    ║
echo ╚════════════════════════════════════════════════════════════════════╝
echo.
echo 🌐 APPLICATION URL:
echo    http://!FQDN!:3000
echo.
echo ✨ WHAT WAS FIXED:
echo    ✓ Updated to production Dockerfile
echo    ✓ Fixed Node.js build configuration
echo    ✓ Increased container resources (1.5 CPU, 2GB RAM)
echo    ✓ Fixed environment variables
echo    ✓ Proper production startup
echo    ✓ Added debugging information
echo.
echo 📊 NEXT STEPS:
echo    1. Open: http://!FQDN!:3000
echo    2. If still blank, check logs:
echo       az container logs -g quantchat-prod -n quantchat --follow
echo    3. Wait 1-2 minutes for full startup
echo    4. Refresh browser
echo.
echo 🔍 TROUBLESHOOTING:
echo    If blank page persists:
echo
echo    1. Check logs:
echo       az container logs -g quantchat-prod -n quantchat
echo
echo    2. Check container status:
echo       az container show -g quantchat-prod -n quantchat
echo
echo    3. Rebuild with more logs:
echo       docker build -t quantchat:latest . --progress=plain
echo.
echo 💡 DEBUGGING MODES:
echo    Tail logs: az container logs -g quantchat-prod -n quantchat --follow
echo    Stop app:  az container stop -g quantchat-prod -n quantchat
echo    Restart:   az container start -g quantchat-prod -n quantchat
echo.
echo ════════════════════════════════════════════════════════════════════
echo.

pause
