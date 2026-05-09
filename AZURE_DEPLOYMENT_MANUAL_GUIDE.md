# QuantChat Azure Deployment - Manual Guide

## Overview
This guide walks you through deploying QuantChat to Azure using the Azure Portal. The deployment includes:
- Azure Container Registry (for Docker images)
- Azure Container Instances (for running the app)
- Azure Database for PostgreSQL (for data storage)
- Azure Cache for Redis (for caching)

## Prerequisites
- Azure account with active subscription
- Docker installed on your local machine
- Access to the QuantChat source code

---

## Part 1: Create Azure Resources

### Step 1.1: Create a Resource Group

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** or search for "Resource groups"
3. Click **Create**
4. Fill in the details:
   - **Subscription**: Select your subscription
   - **Resource group name**: `quantchat-prod`
   - **Region**: `East US` (or your preferred region)
5. Click **Review + create** → **Create**

**Wait for the resource group to be created (usually takes 30 seconds)**

---

### Step 2: Create Azure Container Registry

1. In Azure Portal, search for **Container Registry**
2. Click **Create**
3. Fill in the details:
   - **Subscription**: Select your subscription
   - **Resource group**: `quantchat-prod`
   - **Registry name**: `quantchatregistry` (must be lowercase, 5-50 characters)
   - **Location**: `East US`
   - **SKU**: `Basic`
   - **Admin user**: Enable
4. Click **Review + create** → **Create**

**Wait for registry to be created (usually takes 2-3 minutes)**

Once created:
1. Go to the Container Registry resource
2. Click **Settings** → **Access keys**
3. Note down:
   - **Login server** (e.g., `quantchatregistry.azurecr.io`)
   - **Username** (e.g., `quantchatregistry`)
   - **Password** (password1 or password2)

---

### Step 3: Build and Push Docker Image

Open Command Prompt or PowerShell on your local machine:

```bash
# Navigate to QuantChat directory
cd C:\infinity trinity apps motive\QuantChat

# Login to Azure Container Registry
docker login quantchatregistry.azurecr.io
# When prompted, enter:
# Username: quantchatregistry
# Password: (the password from Step 2.3)

# Build the Docker image
docker build -t quantchat:latest .

# Tag the image for your registry
docker tag quantchat:latest quantchatregistry.azurecr.io/quantchat:latest

# Push to Azure Container Registry
docker push quantchatregistry.azurecr.io/quantchat:latest

# You should see "Pushed" message when complete
```

---

### Step 4: Create Azure Database for PostgreSQL

1. In Azure Portal, search for **Azure Database for PostgreSQL**
2. Click **Create** → **Single Server**
3. Fill in the details:
   - **Subscription**: Select your subscription
   - **Resource group**: `quantchat-prod`
   - **Server name**: `quantchat-db-prod`
   - **Location**: `East US`
   - **Version**: `15` (or latest)
   - **Compute + Storage**: Default is fine (Gen 5, 1 vCore, 5GB storage)
   - **Admin username**: `quantchat_admin`
   - **Password**: Create a strong password (SAVE THIS!)
   - **Confirm password**: Re-enter the password

4. Click **Review + create** → **Create**

**Wait for database to be created (usually takes 5-10 minutes)**

Once created:
1. Go to the PostgreSQL resource
2. Click **Connection strings** 
3. Note down the connection string details:
   - **Host**: (shown as `quantchat-db-prod.postgres.database.azure.com`)
   - **Database**: `postgres`
   - **Username**: `quantchat_admin@quantchat-db-prod`

**Important: Allow Azure Services to Access**
1. In PostgreSQL resource, click **Connection security**
2. Set **Allow access to Azure services** to **ON**
3. Click **Save**

---

### Step 5: Create Azure Cache for Redis

1. In Azure Portal, search for **Azure Cache for Redis**
2. Click **Create**
3. Fill in the details:
   - **Subscription**: Select your subscription
   - **Resource group**: `quantchat-prod`
   - **DNS name**: `quantchat-redis`
   - **Location**: `East US`
   - **SKU**: `Basic C0`
4. Click **Review + create** → **Create**

**Wait for Redis to be created (usually takes 5-10 minutes)**

Once created:
1. Go to the Redis resource
2. Click **Settings** → **Access keys**
3. Note down:
   - **Primary Connection String** (with ssl=True)
   - Or individually: **Host name** and **Primary key**

---

## Part 2: Create Azure Container Instance

### Step 6: Deploy Container Instance

1. In Azure Portal, search for **Container Instances**
2. Click **Create**
3. Fill in the details:

**Basics Tab:**
- **Subscription**: Select your subscription
- **Resource group**: `quantchat-prod`
- **Container name**: `quantchat-app`
- **Image source**: `Azure Container Registry`
- **Registry**: Select `quantchatregistry` (from Step 2)
- **Image**: `quantchat`
- **Image tag**: `latest`
- **OS type**: `Linux`
- **Number of CPU cores**: `1.0`
- **Memory (GB)**: `1.5`

**Ports Tab:**
- **Port**: `3000`
- **Protocol**: `TCP`
- Check **Public IP**: Enable
- **DNS name label**: `quantchat-app` (this creates your public URL)

**Environment variables Tab:**
Add the following variables (critical for production):
```
NODE_ENV = production
PORT = 3000
DATABASE_URL = postgresql://quantchat_admin:<PASSWORD>@quantchat-db-prod.postgres.database.azure.com:5432/quantchat?sslmode=require
REDIS_URL = <redis-connection-string>
NEXTAUTH_URL = http://quantchat-app.eastus.azurecontainer.io:3000
NEXTAUTH_SECRET = <generate-random-secret>
GOOGLE_CLIENT_ID = <your-google-oauth-id>
GOOGLE_CLIENT_SECRET = <your-google-oauth-secret>
AWS_ACCESS_KEY_ID = <your-aws-key>
AWS_SECRET_ACCESS_KEY = <your-aws-secret>
AWS_REGION = us-east-1
AWS_S3_BUCKET = <your-s3-bucket>
CLOUDFRONT_DOMAIN = <your-cloudfront-domain>
ADMIN_SECRET = <generate-random-secret>
```

4. Click **Review + create** → **Create**

**Wait for container to start (usually takes 2-3 minutes)**

---

## Part 3: Verify Deployment

### Step 7: Get Container Details

Once the container is created:
1. Go to the Container Instance resource
2. You should see:
   - **FQDN** (Fully Qualified Domain Name): This is your public URL
   - **IP address**: The public IP address
   - **State**: Should be "Running"

### Step 8: Test the Application

1. Open a web browser
2. Navigate to: `http://<FQDN>:3000`
   - Replace `<FQDN>` with the actual FQDN from Step 7
   - Example: `http://quantchat-app.eastus.azurecontainer.io:3000`
3. The application should load and show the login page

### Step 9: Monitor Container Logs

If the application doesn't load:
1. In the Container Instance resource, click **Logs**
2. View the container logs to see any error messages
3. Common issues:
   - Missing environment variables
   - Database connection issues
   - Application startup errors

---

## Part 4: Next Steps

### Database Initialization

1. Connect to PostgreSQL from your local machine:
```bash
psql -h quantchat-db-prod.postgres.database.azure.com -U quantchat_admin@quantchat-db-prod -d postgres
```

2. Create the QuantChat database:
```sql
CREATE DATABASE quantchat;
\c quantchat
```

3. Run migrations (if using Prisma):
```bash
npx prisma migrate deploy
```

### Set Up Custom Domain (Optional)

1. In Azure, search for **App Service domains** or use your domain registrar
2. Point your domain's DNS to the container's FQDN
3. Update `NEXTAUTH_URL` environment variable with your domain

### Enable HTTPS (Optional but Recommended)

1. Set up Azure Application Gateway or Azure Front Door
2. Configure SSL/TLS certificates
3. Update `NEXTAUTH_URL` to use HTTPS

### Set Up CI/CD Pipeline (Optional)

For automatic deployments:
1. Use GitHub Actions + Azure Container Registry
2. See `.github/workflows/deploy.yml` in the QuantChat project

---

## Troubleshooting

### Container fails to start
- Check logs in Container Instance
- Verify all environment variables are set correctly
- Check that Docker image was pushed successfully

### Cannot connect to database
- Verify database is in "Running" state
- Check "Allow Azure services" is enabled in PostgreSQL
- Verify connection string in environment variables

### Application returns 502 Bad Gateway
- Wait 1-2 minutes for application to start
- Check container logs for startup errors
- Verify all required environment variables are set

### Redis connection issues
- Verify Redis is in "Running" state
- Check connection string format
- Confirm Primary key is being used (not from earlier versions)

---

## Cost Estimation

Monthly costs (approximate, US East region):
- Container Instances: $15-50 (depending on uptime)
- PostgreSQL Database: $40-100 (depends on storage/compute)
- Redis Cache (Basic): $20-30
- **Total**: ~$75-180/month

---

## Security Recommendations

1. **Enable Azure Key Vault**
   - Store sensitive data (API keys, database passwords)
   - Reference in Container Instance

2. **Set up Azure Monitor**
   - Monitor application performance
   - Set up alerts for errors

3. **Use Azure SQL Managed Identity**
   - Instead of storing passwords in environment variables

4. **Enable SSL/TLS**
   - Use Azure Application Gateway or Azure Front Door
   - Automatic certificate management

5. **Network Security**
   - Use Virtual Networks (VNets)
   - Restrict database access to container only
   - Enable firewall rules

---

## Support & Additional Resources

- [Azure Container Instances Documentation](https://learn.microsoft.com/en-us/azure/container-instances/)
- [Azure Database for PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/)
- [Azure Cache for Redis](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/)
- [Docker Documentation](https://docs.docker.com/)

---

**Estimated Time**: 30-45 minutes for complete deployment
**Complexity**: Intermediate
**Support Level**: Community & Microsoft Docs

Good luck with your deployment! 🚀
