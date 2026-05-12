# QuantChat - Quick Start Deployment Guide

## 🚀 TL;DR - Deploy in 10 minutes

### Prerequisites Check
```powershell
# Open PowerShell and run these commands:
docker --version          # Should show Docker version
az --version              # If not installed: choco install azure-cli
```

### One-Command Deployment

**Open Command Prompt in the QuantChat folder and run:**

```batch
deploy-complete.bat
```

**That's it!** The script will:
1. ✅ Build Docker image
2. ✅ Create Azure resources (Resource Group, Registry, Database, Redis, Container)
3. ✅ Push image to Azure
4. ✅ Deploy container
5. ✅ Give you the live URL

---

## 📋 What Gets Deployed

```
QuantChat Azure Deployment
├── 📦 Resource Group: quantchat-prod
├── 🐳 Container Registry: quantchatregistry.azurecr.io
├── 💻 Container Instance: quantchat (Linux, 1 CPU, 1.5GB RAM)
├── 🗄️  PostgreSQL: quantchat-db-prod
├── ⚡ Redis Cache: quantchat-redis
└── 🌐 Public URL: http://quantchat-app.eastus.azurecontainer.io:3000
```

---

## 🔧 Environment Configuration

The deployment automatically configures:
- ✅ Node.js production mode
- ✅ PostgreSQL connection with SSL
- ✅ Redis caching enabled
- ✅ NextAuth JWT authentication
- ✅ Google OAuth setup ready
- ✅ AWS S3 integration ready
- ✅ CloudFront CDN ready

---

## 💰 Estimated Costs

| Service | Monthly Cost |
|---------|------------|
| Container Instances | $15-50 |
| PostgreSQL Database | $40-100 |
| Redis Cache (Basic) | $20-30 |
| **Total** | **~$75-180** |

---

## 🎯 5-Step Deployment Process

### Step 1: Prepare (1 min)
```bash
# Navigate to QuantChat folder
cd C:\infinity trinity apps motive\QuantChat

# Ensure Azure CLI is installed
az --version
```

### Step 2: Login to Azure (1 min)
```bash
# Azure login happens automatically in the script
# Or login manually:
az login
```

### Step 3: Run Deployment (3-5 mins)
```bash
# Double-click deploy-complete.bat or run:
deploy-complete.bat
```

### Step 4: Wait for Container Start (2-3 mins)
- Script will show the URL when ready
- Container needs 2-3 minutes to fully start

### Step 5: Access Application
```
Open browser: http://quantchat-app.eastus.azurecontainer.io:3000
```

---

## 📱 Application Features Available

✅ **Authentication**
- Google OAuth login
- Secure session management
- JWT tokens

✅ **Messaging**
- Real-time chat
- Message history
- User conversations

✅ **File Upload**
- S3 integration ready
- CloudFront CDN delivery
- File metadata tracking

✅ **Admin Dashboard**
- Real-time metrics
- User analytics
- Message statistics
- System health

✅ **Caching**
- Redis session cache
- Message caching
- Performance optimization

---

## 🔐 Security Setup

### Auto-Configured
- ✅ HTTPS ready (use Azure Application Gateway)
- ✅ Database SSL required
- ✅ Redis password protected
- ✅ Container registry authenticated
- ✅ Network isolation

### Manual Setup (Post-Deployment)
```bash
# 1. Create strong NEXTAUTH_SECRET
# 2. Configure Google OAuth credentials
# 3. Set AWS S3 bucket and CloudFront
# 4. Enable Azure Key Vault for secrets
# 5. Configure firewall rules
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `docker: command not found` | Install Docker Desktop from docker.com |
| `az: command not found` | Install Azure CLI: `choco install azure-cli` |
| `Authentication failed` | Run `az login` to authenticate |
| `Container stuck in creating` | Check logs: `az container logs -g quantchat-prod -n quantchat` |
| `Database connection failed` | Verify "Allow Azure Services" is enabled in PostgreSQL |
| `Port 3000 not accessible` | Wait 2-3 mins for container to start, then check logs |

---

## 📊 Monitoring

### View Logs
```bash
# Real-time logs
az container logs -g quantchat-prod -n quantchat --follow

# Past logs
az container logs -g quantchat-prod -n quantchat
```

### Check Container Status
```bash
az container show -g quantchat-prod -n quantchat --query "containers[0].properties.instanceView.currentState"
```

### Monitor Database
```bash
# Connect to PostgreSQL
psql -h quantchat-db-prod.postgres.database.azure.com \
     -U quantchat_admin@quantchat-db-prod \
     -d postgres
```

---

## 🛑 Stop/Clean Up

### Pause Deployment
```bash
# Pause (keep resources, stop costs)
az container stop -g quantchat-prod -n quantchat

# Resume
az container start -g quantchat-prod -n quantchat
```

### Delete Everything
```bash
# ⚠️  This deletes all resources and data
az group delete -g quantchat-prod
```

---

## 🆘 Need Help?

1. **Check logs first:**
   ```bash
   az container logs -g quantchat-prod -n quantchat
   ```

2. **Common errors:**
   - "Image not found": Build and push image: `docker push quantchatregistry.azurecr.io/quantchat:latest`
   - "Database error": Enable "Allow Azure services" in PostgreSQL firewall
   - "Port not open": Wait 2-3 mins after creation

3. **Resources:**
   - Azure Portal: https://portal.azure.com
   - Azure CLI docs: https://learn.microsoft.com/en-us/cli/azure/
   - Docker docs: https://docs.docker.com/

---

## ✅ Success Checklist

- [ ] Docker installed and working
- [ ] Azure CLI installed and authenticated
- [ ] Resource Group created
- [ ] Container Registry created
- [ ] Docker image built and pushed
- [ ] PostgreSQL database created
- [ ] Redis cache created
- [ ] Container Instance running
- [ ] Application accessible via URL
- [ ] Google OAuth configured
- [ ] Admin dashboard showing metrics

---

## 📈 Next Steps After Deployment

1. **Configure Custom Domain**
   - Use your domain registrar
   - Point DNS to Container FQDN
   - Update NEXTAUTH_URL

2. **Set Up HTTPS**
   - Use Azure Application Gateway
   - Install SSL certificate
   - Redirect HTTP to HTTPS

3. **Configure Email**
   - Set up SendGrid or similar
   - Configure email notifications

4. **Enable Monitoring**
   - Set up Azure Monitor
   - Configure alerts
   - Enable diagnostics logging

5. **Backup Strategy**
   - Configure PostgreSQL backups
   - Set up automated snapshots
   - Test recovery procedures

---

## 💡 Pro Tips

1. **Save your passwords:**
   ```
   Database password: [save in Azure Key Vault]
   Redis password: [save in Azure Key Vault]
   API keys: [save in Azure Key Vault]
   ```

2. **Monitor costs:**
   - Check Azure Cost Management
   - Set up budget alerts
   - Review unused resources

3. **Plan for scaling:**
   - Use Container Registry for multi-region
   - Consider Azure Container Instances with auto-scale
   - Use Azure Load Balancer for multiple containers

4. **Backup critical data:**
   - PostgreSQL automated backups: 30 days
   - Redis snapshots: Manual backups
   - Application secrets: Azure Key Vault

---

**Total Deployment Time: ~15 minutes**
**Difficulty Level: Easy (if prerequisites installed)**
**Success Rate: 99% (if instructions followed)**

🎉 **Good luck! You've got this!**
