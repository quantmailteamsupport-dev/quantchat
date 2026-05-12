#!/bin/bash
# Azure Container Instances Deployment Script
# Usage: ./scripts/deploy-azure.sh <resource-group> <app-name>

set -e

RESOURCE_GROUP=${1:-quantchat-prod}
APP_NAME=${2:-quantchat}

echo "🚀 QuantChat Azure Deployment"
echo "=============================="
echo "Resource Group: $RESOURCE_GROUP"
echo "App Name: $APP_NAME"

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
  echo "❌ Azure CLI is not installed"
  exit 1
fi

# Login to Azure
echo "🔐 Logging in to Azure..."
az login

# Create resource group
echo "📦 Creating resource group..."
az group create \
  --name $RESOURCE_GROUP \
  --location eastus

# Create Container Registry
echo "🐳 Creating Container Registry..."
REGISTRY_NAME=$(echo $RESOURCE_GROUP | tr -d '-')
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $REGISTRY_NAME \
  --sku Basic

# Build and push image
echo "🔨 Building Docker image..."
docker build -t $APP_NAME:latest .

# Tag image
REGISTRY_URL=$(az acr show \
  --resource-group $RESOURCE_GROUP \
  --name $REGISTRY_NAME \
  --query loginServer \
  --output tsv)

docker tag $APP_NAME:latest $REGISTRY_URL/$APP_NAME:latest

# Push image
echo "📤 Pushing image to registry..."
az acr login --name $REGISTRY_NAME
docker push $REGISTRY_URL/$APP_NAME:latest

# Create Azure Database for PostgreSQL
echo "🗄️  Creating PostgreSQL database..."
az postgres server create \
  --resource-group $RESOURCE_GROUP \
  --name "$APP_NAME-db" \
  --location eastus \
  --admin-user quantchat_admin \
  --admin-password "CHANGE_THIS_PASSWORD_123!" \
  --sku-name B_Gen5_1 \
  --storage-size 51200

# Create Azure Cache for Redis
echo "⚡ Creating Redis cache..."
az redis create \
  --resource-group $RESOURCE_GROUP \
  --name "$APP_NAME-redis" \
  --location eastus \
  --sku Basic \
  --vm-size c0

# Deploy to Container Instances
echo "🚀 Deploying to Azure Container Instances..."
az container create \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --image $REGISTRY_URL/$APP_NAME:latest \
  --cpu 1 \
  --memory 1.5 \
  --registry-login-server $REGISTRY_URL \
  --registry-username $(az acr credential show -n $REGISTRY_NAME --query username -o tsv) \
  --registry-password $(az acr credential show -n $REGISTRY_NAME --query passwords[0].value -o tsv) \
  --environment-variables \
    NODE_ENV=production \
    PORT=3000 \
  --ports 80 \
  --protocol TCP \
  --dns-name-label $APP_NAME \
  --restart-policy OnFailure

# Get connection strings
echo ""
echo "✅ Deployment complete!"
echo ""
echo "Database Connection:"
az postgres server show \
  --resource-group $RESOURCE_GROUP \
  --name "$APP_NAME-db" \
  --query fullyQualifiedDomainName
echo ""
echo "Redis Connection:"
az redis show \
  --resource-group $RESOURCE_GROUP \
  --name "$APP_NAME-redis" \
  --query hostName
echo ""
echo "Application URL:"
az container show \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --query ipAddress.fqdn \
  --output tsv
