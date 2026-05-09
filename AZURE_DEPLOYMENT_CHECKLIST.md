# QuantChat Azure Deployment Checklist

## Pre-Deployment Setup
- [ ] Azure account created and subscription active
- [ ] Docker installed and running on local machine
- [ ] QuantChat source code downloaded and ready
- [ ] Environment variables file prepared (.env.production)
- [ ] GitHub OAuth credentials obtained (Google Client ID & Secret)
- [ ] AWS S3 bucket and CloudFront setup complete (if using S3 integration)

---

## Step-by-Step Deployment Checklist

### Phase 1: Resource Group & Container Registry (5-10 mins)
- [ ] Create Resource Group: `quantchat-prod`
- [ ] Create Container Registry: `quantchatregistry`
- [ ] Note Container Registry details:
  - [ ] Login server: ____________
  - [ ] Username: ____________
  - [ ] Password: ____________

### Phase 2: Docker Image Build & Push (10-15 mins)
- [ ] Navigate to QuantChat directory
- [ ] Run: `docker login quantchatregistry.azurecr.io`
- [ ] Run: `docker build -t quantchat:latest .`
- [ ] Run: `docker tag quantchat:latest quantchatregistry.azurecr.io/quantchat:latest`
- [ ] Run: `docker push quantchatregistry.azurecr.io/quantchat:latest`
- [ ] Verify image in Azure Container Registry

### Phase 3: PostgreSQL Database (10-15 mins)
- [ ] Create Azure Database for PostgreSQL
  - [ ] Server name: `quantchat-db-prod`
  - [ ] Admin username: `quantchat_admin`
  - [ ] Save password: ____________
- [ ] Enable "Allow Azure services to access"
- [ ] Note connection details:
  - [ ] Host: ____________
  - [ ] Database: postgres
  - [ ] Username: quantchat_admin@quantchat-db-prod

### Phase 4: Redis Cache (10-15 mins)
- [ ] Create Azure Cache for Redis
  - [ ] DNS name: `quantchat-redis`
  - [ ] SKU: Basic C0
- [ ] Note Redis details:
  - [ ] Host: ____________
  - [ ] Primary Key: ____________
  - [ ] Connection String: ____________

### Phase 5: Container Instance Deployment (5-10 mins)
- [ ] Create Container Instance
  - [ ] Image: quantchatregistry.azurecr.io/quantchat:latest
  - [ ] CPU cores: 1.0
  - [ ] Memory: 1.5 GB
  - [ ] Port: 3000
  - [ ] DNS name: quantchat-app
- [ ] Set Environment Variables:
  - [ ] NODE_ENV = production
  - [ ] PORT = 3000
  - [ ] DATABASE_URL = postgresql://...
  - [ ] REDIS_URL = redis://...
  - [ ] NEXTAUTH_URL = http://quantchat-app.eastus.azurecontainer.io:3000
  - [ ] NEXTAUTH_SECRET = (random value)
  - [ ] GOOGLE_CLIENT_ID = (from Google OAuth)
  - [ ] GOOGLE_CLIENT_SECRET = (from Google OAuth)
  - [ ] Other AWS/CloudFront variables = (if applicable)

### Phase 6: Verification (5 mins)
- [ ] Container Instance shows "Running" state
- [ ] Note Public FQDN: ____________
- [ ] Note Public IP: ____________
- [ ] Open browser and test: http://FQDN:3000
- [ ] Application loads successfully
- [ ] Login page displays

---

## Post-Deployment Steps

### Database Initialization
- [ ] Connect to PostgreSQL database
- [ ] Create `quantchat` database
- [ ] Run `npx prisma migrate deploy`
- [ ] Seed initial data if needed

### Testing
- [ ] Login with Google OAuth
- [ ] Create a test message
- [ ] Upload a file (if S3 configured)
- [ ] Check admin dashboard
- [ ] View real metrics in admin panel

### Monitoring
- [ ] Set up Azure Monitor alerts
- [ ] Configure Log Analytics
- [ ] Monitor container CPU/Memory usage
- [ ] Monitor database connections

### Security
- [ ] Enable Azure Key Vault for secrets
- [ ] Configure firewall rules
- [ ] Set up HTTPS with Application Gateway (optional)
- [ ] Review and restrict network access

---

## Troubleshooting Reference

| Issue | Solution |
|-------|----------|
| Container won't start | Check container logs in Azure Portal |
| Database connection failed | Verify "Allow Azure services" is enabled |
| Port 3000 not accessible | Check container port mapping in Portal |
| Image not found in registry | Verify `docker push` completed successfully |
| OutOfMemory errors | Increase container memory to 2GB or more |
| Application responds slowly | Check PostgreSQL query performance |

---

## Important Notes

- **Passwords**: Store securely, don't commit to version control
- **Environment Variables**: Update DATABASE_URL with actual credentials
- **NEXTAUTH_SECRET**: Generate random secure value, keep secret
- **Costs**: Monitor Azure spending to avoid unexpected charges
- **Backups**: Configure PostgreSQL automatic backups
- **Scaling**: Use Azure Container Registry + GitHub Actions for CI/CD

---

## Quick Links

- Azure Portal: https://portal.azure.com
- Container Registry: Search "Container Registry" in Portal
- PostgreSQL: Search "Azure Database for PostgreSQL" in Portal
- Redis: Search "Azure Cache for Redis" in Portal
- Container Instances: Search "Container Instances" in Portal

---

## Success Criteria

✅ Deployment is successful when:
1. Container Instance is in "Running" state
2. Application is accessible via public FQDN on port 3000
3. Login page displays without errors
4. Database connection is active
5. Redis cache is responding
6. Real metrics display in admin dashboard
7. File uploads work (if S3 configured)

**Estimated Total Time**: 45-60 minutes
**Difficulty**: Intermediate
**Estimated Monthly Cost**: $75-180

Good luck! 🚀
