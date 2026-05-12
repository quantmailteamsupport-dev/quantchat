# QuantChat Azure Deployment Script
# This script automates the deployment of QuantChat to Azure Container Instances
# with PostgreSQL database and Redis cache

param(
    [string]$ResourceGroup = "quantchat-prod",
    [string]$AppName = "quantchat",
    [string]$Location = "eastus"
)

function Write-Log {
    param([string]$Message)
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message" -ForegroundColor Green
}

function Write-Error-Log {
    param([string]$Message)
    Write-Host "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - ERROR: $Message" -ForegroundColor Red
}

# Check Azure CLI
Write-Log "Checking Azure CLI installation..."
$azVersion = az --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Azure CLI is not installed. Please install it from https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
}
Write-Log "Azure CLI version: $(($azVersion | Select-Object -First 1))"

# Check current Azure account
Write-Log "Checking Azure account..."
$currentAccount = az account show --query "user.name" --output tsv 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Log "Not logged in. Running 'az login'..."
    az login
} else {
    Write-Log "Current account: $currentAccount"
}

# Create resource group
Write-Log "Creating resource group: $ResourceGroup in $Location..."
az group create `
    --name $ResourceGroup `
    --location $Location

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to create resource group"
    exit 1
}
Write-Log "Resource group created successfully"

# Create Container Registry
Write-Log "Creating Azure Container Registry..."
$registryName = $AppName + "registry" + (Get-Random -Maximum 999)
$registryName = $registryName.Replace("-", "").Substring(0, [Math]::Min(49, $registryName.Length))

az acr create `
    --resource-group $ResourceGroup `
    --name $registryName `
    --sku Basic `
    --admin-enabled true

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to create container registry"
    exit 1
}

$registryUrl = az acr show `
    --resource-group $ResourceGroup `
    --name $registryName `
    --query loginServer `
    --output tsv

Write-Log "Container registry created: $registryUrl"

# Get registry credentials
Write-Log "Getting registry credentials..."
$registryUsername = az acr credential show `
    --resource-group $ResourceGroup `
    --name $registryName `
    --query "username" `
    --output tsv

$registryPassword = az acr credential show `
    --resource-group $ResourceGroup `
    --name $registryName `
    --query "passwords[0].value" `
    --output tsv

# Build and push Docker image
Write-Log "Building Docker image..."
$imageName = "$registryUrl/$($AppName):latest"

docker build -t $imageName .

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to build Docker image"
    exit 1
}

Write-Log "Logging in to container registry..."
docker login -u $registryUsername -p $registryPassword $registryUrl

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to login to container registry"
    exit 1
}

Write-Log "Pushing image to registry: $imageName"
docker push $imageName

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to push image to registry"
    exit 1
}

# Create PostgreSQL Database
Write-Log "Creating Azure Database for PostgreSQL..."
$dbName = "$($AppName)-db"
$adminUser = "quantchat_admin"
$adminPassword = "QuantChat@$(Get-Random -Minimum 1000 -Maximum 9999)"

az postgres server create `
    --resource-group $ResourceGroup `
    --name $dbName `
    --location $Location `
    --admin-user $adminUser `
    --admin-password $adminPassword `
    --sku-name B_Gen5_1 `
    --storage-size 51200 `
    --enable-storage-autogrow

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to create PostgreSQL server"
    exit 1
}

Write-Log "PostgreSQL server created: $dbName"

# Get database host
$dbHost = az postgres server show `
    --resource-group $ResourceGroup `
    --name $dbName `
    --query "fullyQualifiedDomainName" `
    --output tsv

Write-Log "Database host: $dbHost"

# Create firewall rule for Container Instances
Write-Log "Creating firewall rule to allow Azure services..."
az postgres server firewall-rule create `
    --resource-group $ResourceGroup `
    --server $dbName `
    --name "AllowAzureServices" `
    --start-ip-address 0.0.0.0 `
    --end-ip-address 0.0.0.0

# Create Azure Cache for Redis
Write-Log "Creating Azure Cache for Redis..."
$redisName = "$($AppName)-redis"
$redisPassword = "QuantChat@$(Get-Random -Minimum 1000 -Maximum 9999)"

az redis create `
    --resource-group $ResourceGroup `
    --name $redisName `
    --location $Location `
    --sku Basic `
    --vm-size c0

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to create Redis cache"
    exit 1
}

Write-Log "Redis cache created: $redisName"

# Get Redis connection string
$redisHost = az redis show `
    --resource-group $ResourceGroup `
    --name $redisName `
    --query "hostName" `
    --output tsv

$redisKey = az redis list-keys `
    --resource-group $ResourceGroup `
    --name $redisName `
    --query "primaryKey" `
    --output tsv

$redisConnectionString = "$($redisHost):6379,password=$redisKey,ssl=true"

Write-Log "Redis host: $redisHost"

# Create Container Instance
Write-Log "Creating Azure Container Instance..."
$containerName = $AppName

az container create `
    --resource-group $ResourceGroup `
    --name $containerName `
    --image $imageName `
    --registry-login-server $registryUrl `
    --registry-username $registryUsername `
    --registry-password $registryPassword `
    --cpu 1 `
    --memory 1.5 `
    --environment-variables `
        NODE_ENV=production `
        PORT=3000 `
        DATABASE_URL="postgresql://$($adminUser):$($adminPassword)@$($dbHost):5432/quantchat?sslmode=require" `
        REDIS_URL=$redisConnectionString `
        NEXTAUTH_URL="http://$($containerName).eastus.azurecontainer.io:3000" `
    --ports 80 3000 `
    --protocol TCP `
    --dns-name-label $containerName `
    --restart-policy OnFailure

if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Failed to create container instance"
    exit 1
}

Write-Log "Container instance created: $containerName"

# Get container details
Write-Log "Waiting for container to start..."
Start-Sleep -Seconds 10

$containerFqdn = az container show `
    --resource-group $ResourceGroup `
    --name $containerName `
    --query "ipAddress.fqdn" `
    --output tsv

$containerIp = az container show `
    --resource-group $ResourceGroup `
    --name $containerName `
    --query "ipAddress.ip" `
    --output tsv

Write-Log ""
Write-Log "======================================"
Write-Log "✅ DEPLOYMENT COMPLETE!"
Write-Log "======================================"
Write-Log ""
Write-Log "Application Details:"
Write-Log "  URL: http://$containerFqdn:3000"
Write-Log "  IP Address: $containerIp"
Write-Log ""
Write-Log "Database Details:"
Write-Log "  Host: $dbHost"
Write-Log "  Admin User: $adminUser"
Write-Log "  Database Name: quantchat"
Write-Log "  Connection: postgresql://$($adminUser):PASSWORD@$($dbHost):5432/quantchat?sslmode=require"
Write-Log ""
Write-Log "Redis Details:"
Write-Log "  Host: $redisHost"
Write-Log "  Connection: $redisConnectionString"
Write-Log ""
Write-Log "Container Registry:"
Write-Log "  Registry URL: $registryUrl"
Write-Log ""
Write-Log "Resource Group: $ResourceGroup"
Write-Log ""
Write-Log "Next Steps:"
Write-Log "  1. Update DNS records to point to: $containerFqdn"
Write-Log "  2. Run database migrations"
Write-Log "  3. Monitor logs: az container logs --resource-group $ResourceGroup --name $containerName --follow"
Write-Log "  4. Check health: curl http://$containerFqdn:3000/healthz"
Write-Log ""
