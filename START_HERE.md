# 🚀 QuantChat Deployment - START HERE

## ⚡ Quick Deploy (3 Minutes)

### Requirements
```powershell
# Open PowerShell and verify these are installed:
docker --version       # Docker Desktop
az --version           # Azure CLI (https://aka.ms/installazurecliwindows)
az login               # Authenticate with Azure
```

### Deploy Now
1. Open **Command Prompt** (not PowerShell)
2. Navigate to: `C:\infinity trinity apps motive\QuantChat`
3. Run: `deploy-complete.bat`
4. Wait for completion (15 minutes)
5. Copy the URL from the output
6. Paste in browser and access your app!

---

## 📚 Documentation (Choose Your Path)

### Path 1: I just want it deployed ASAP
→ Skip everything, just run `deploy-complete.bat`

### Path 2: I want to understand what's happening
→ Read: `QUICK_START_DEPLOYMENT.md` (5 min)

### Path 3: I want detailed portal-by-portal instructions
→ Read: `AZURE_DEPLOYMENT_MANUAL_GUIDE.md` (15 min)

### Path 4: I want to track every step
→ Use: `AZURE_DEPLOYMENT_CHECKLIST.md` during deployment

### Path 5: I want to know all available files
→ Read: `DEPLOYMENT_FILES_README.md`

---

## ✅ Deployment Checklist

Before running the script:

- [ ] Docker Desktop installed: `docker --version`
- [ ] Azure CLI installed: `az --version`
- [ ] You're logged into Azure: `az login`
- [ ] You're in QuantChat folder: `cd C:\infinity trinity apps motive\QuantChat`
- [ ] deploy-complete.bat exists in current folder

---

## 🎯 What Gets Deployed

```
QuantChat on Azure
├─ Docker Image: Built from Dockerfile
├─ Container Registry: quantchatregistry.azurecr.io
├─ Container Instance: quantchat (Linux, 1 CPU, 1.5GB)
├─ PostgreSQL Database: quantchat-db-prod
├─ Redis Cache: quantchat-redis
└─ Live URL: http://quantchat-app.eastus.azurecontainer.io:3000
```

---

## ⏱️ Timeline

```
Minutes 0-2:   Docker build
Minutes 2-5:   Azure resource creation
Minutes 5-8:   Image push to registry
Minutes 8-13:  Container startup and initialization
Minutes 13-15: Verification
```

---

## 🔑 Important: Save These When Generated

During deployment, the script will generate:
- PostgreSQL admin password
- Redis primary key
- NEXTAUTH_SECRET

**⚠️ SAVE THESE SECURELY!** Add to Azure Key Vault:
```powershell
# Create Key Vault
az keyvault create --name quantchat-vault --resource-group quantchat-prod

# Save secrets
az keyvault secret set --vault-name quantchat-vault --name db-password --value "PASSWORD_HERE"
az keyvault secret set --vault-name quantchat-vault --name redis-key --value "KEY_HERE"
az keyvault secret set --vault-name quantchat-vault --name auth-secret --value "SECRET_HERE"
```

---

## 🐛 If Something Goes Wrong

### Docker Error: "command not found"
→ Install Docker Desktop from https://www.docker.com/products/docker-desktop

### Azure Error: "not recognized"
→ Install Azure CLI from https://aka.ms/installazurecliwindows

### Authentication Error
→ Run: `az login` and complete the browser authentication

### Deployment Hangs
→ Check logs in another terminal:
```powershell
az container logs -g quantchat-prod -n quantchat --follow
```

### Container Won't Start
→ Check status:
```powershell
az container show -g quantchat-prod -n quantchat
```

→ View detailed logs:
```powershell
az container logs -g quantchat-prod -n quantchat
```

---

## 🎉 Success Looks Like

When deployment completes, you'll see:
```
============================================================
   ✓ DEPLOYMENT COMPLETED SUCCESSFULLY!
============================================================

Application Details:
   URL: http://quantchat-app.eastus.azurecontainer.io:3000
   Region: East US

Next Steps:
   1. Wait 2-3 minutes for application to fully start
   2. Open browser and navigate to the URL above
   3. Test login with Google OAuth
```

---

## 🚀 Next Steps After Successful Deployment

1. **Test the Application**
   ```
   Open: http://quantchat-app.eastus.azurecontainer.io:3000
   ```

2. **Configure Google OAuth**
   - Go to: https://console.cloud.google.com
   - Create OAuth credentials
   - Update .env.production with credentials
   - Redeploy container

3. **Set Custom Domain** (optional)
   - Update DNS records
   - Update NEXTAUTH_URL to your domain

4. **Enable HTTPS** (recommended)
   - Use Azure Application Gateway
   - Install SSL certificate
   - Redirect HTTP to HTTPS

5. **Set Up Monitoring**
   ```powershell
   # View real-time logs
   az container logs -g quantchat-prod -n quantchat --follow
   
   # Check metrics
   az monitor metrics list -g quantchat-prod -n quantchat
   ```

---

## 💡 Useful Commands for Later

```powershell
# View application logs
az container logs -g quantchat-prod -n quantchat --follow

# Stop the app (pause costs)
az container stop -g quantchat-prod -n quantchat

# Start the app again
az container start -g quantchat-prod -n quantchat

# Delete everything (⚠️ irreversible!)
az group delete -g quantchat-prod

# Connect to PostgreSQL database
psql -h quantchat-db-prod.postgres.database.azure.com \
     -U quantchat_admin@quantchat-db-prod \
     -d postgres

# Connect to Redis cache
redis-cli -h quantchat-redis.redis.cache.windows.net -p 6379
```

---

## 📊 Estimated Costs

| Service | Monthly Cost |
|---------|------------|
| Container Instances (1 CPU, 1.5GB) | $15-50 |
| PostgreSQL Database (5GB, Basic) | $40-100 |
| Redis Cache (Basic, C0) | $20-30 |
| **Total** | **~$75-180** |

You can stop the container to pause costs (doesn't delete data).

---

## ❓ FAQ

**Q: Can I use my own domain?**  
A: Yes! Update DNS records and NEXTAUTH_URL environment variable.

**Q: How do I update the code?**  
A: Modify code, build new Docker image, push to registry, redeploy container.

**Q: Can I scale to multiple containers?**  
A: Yes! Adjust deployment script or use container orchestration (Kubernetes).

**Q: Is data persistent?**  
A: Yes! PostgreSQL and Redis data are persistent across container restarts.

**Q: How do I backup the database?**  
A: PostgreSQL auto-backups every 7 days. Manual backups:
```powershell
az postgres server backup create -g quantchat-prod -s quantchat-db-prod -n backup1
```

---

## 🎓 Learning Resources

- **Azure Docs:** https://learn.microsoft.com/en-us/azure/
- **Docker Docs:** https://docs.docker.com/
- **PostgreSQL:** https://www.postgresql.org/docs/
- **Redis:** https://redis.io/documentation
- **Next.js:** https://nextjs.org/docs

---

## ✨ You're All Set!

Everything is prepared and ready to go. Just run:

```batch
deploy-complete.bat
```

And your QuantChat application will be live on Azure in 15 minutes! 🚀

**Questions?** Check the other documentation files or Azure docs.

**Ready?** → Run `deploy-complete.bat` NOW!

---

**Version:** 1.0  
**Date:** May 8, 2026  
**Status:** ✅ Production Ready
