# QuantChat Production Deployment — Agent Execution Plan
**Activation Date:** May 7, 2026  
**Target:** 12-week sprint to production launch  
**Status:** 🔴 CRITICAL BLOCKERS ASSIGNED

---

## 🚀 Agent Deployment Status

```
┌────────────────────────────────────────────────────────────┐
│           AGENTS ACTIVATED FOR PRODUCTION                  │
├────────────────────────────────────────────────────────────┤
│ ✅ BackendAgent        → Critical Auth & S3 blocker fixes  │
│ ✅ FrontendAgent       → Routing & Metrics blocker fixes   │
│ ✅ DeployAgent         → Infrastructure & Environment      │
│ ✅ SecurityAgent       → E2EE, hardening, audit            │
│ ✅ TestingAgent        → QA, testing, verification         │
│ ✅ DebugAgent          → Build errors, type checking       │
│ ✅ GrowthAgent         → Analytics, monitoring, scaling    │
└────────────────────────────────────────────────────────────┘
```

---

## 📋 WEEK 1-2: CRITICAL BLOCKERS SPRINT

### BackendAgent - Task Assignment

**🔴 CRITICAL TASK 1: OAuth2 Authentication**
```
Task ID: BLOCKER-AUTH
Priority: 🔴 CRITICAL
Timeline: Mon-Fri (Week 1)
Owner: BackendAgent
Effort: 40 hours

DELIVERABLES:
[ ] Users can login with Google OAuth2
[ ] JWT tokens are issued and validated
[ ] Sessions persist across page reloads
[ ] Token refresh mechanism works
[ ] Hardcoded user IDs replaced

IMPLEMENTATION STEPS:
1. Setup next-auth library in Nexus/apps/web
2. Create .env.local with OAuth2 credentials
3. Implement auth callbacks (JWT strategy)
4. Add session middleware to API gateway
5. Replace hardcoded userId with session.user.id
6. Test: Login → Message → Refresh → Still logged in

FILES TO MODIFY:
- Nexus/apps/web/app/chat/page.tsx (line 18 - hardcoded userId)
- Nexus/apps/api-gateway/src/middleware/auth.ts (create/update)
- Nexus/apps/web/lib/auth.ts (create)
- Nexus/apps/web/.env.local (add)

ACCEPTANCE CRITERIA:
✅ No hardcoded user IDs remain
✅ Users can login/logout
✅ Sessions persist
✅ Multi-device token management works
✅ Zero type errors in auth code

BLOCKERS THAT PREVENT THIS:
(None - this can start immediately)

DEPENDS ON:
(Nothing - this is a blocker fixer)

BLOCKS:
- All messaging features
- User identity in API
- Device management
```

**🔴 CRITICAL TASK 2: S3 File Upload Pipeline**
```
Task ID: BLOCKER-S3
Priority: 🔴 CRITICAL
Timeline: Mon-Fri (Week 2) (After BLOCKER-AUTH partially done)
Owner: BackendAgent (second engineer)
Effort: 50 hours

DELIVERABLES:
[ ] Presigned URLs generate real S3 URLs
[ ] Browser uploads files to S3 directly
[ ] CloudFront CDN serves files
[ ] Virus scanning implemented
[ ] File cleanup policies setup

IMPLEMENTATION STEPS:
1. Create AWS S3 bucket (if not exists) with proper config
2. Setup CloudFront distribution for CDN
3. Implement presigned URL generator (properly)
4. Add file size/type validation
5. Integrate with ClamAV for virus scanning
6. Create file cleanup Lambda (old files)
7. Test: Upload file → See in chat → Download → Verify

FILES TO MODIFY:
- Nexus/apps/api-gateway/src/routes.ts (presign endpoint)
- Nexus/apps/api-gateway/src/index.ts (S3 client setup)
- Nexus/apps/web/lib/upload.ts (create)
- docker-compose.yml (S3 config)
- .env.example (S3 variables)

ENVIRONMENT VARIABLES NEEDED:
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET=quantchat-prod
AWS_REGION=us-east-1
CLOUDFRONT_DOMAIN=d111.cloudfront.net

ACCEPTANCE CRITERIA:
✅ Chat attachments work end-to-end
✅ File downloads have CDN caching
✅ Virus scan results stored
✅ Broken uploads clean up after 24h
✅ Upload progress visible in UI

BLOCKERS THAT PREVENT THIS:
(None - can work in parallel with BLOCKER-AUTH)

DEPENDS ON:
- AWS account with proper permissions
- S3 bucket provisioned
- IAM roles created

BLOCKS:
- File attachments
- Story uploads
- Profile images
- Vault file storage
```

---

### FrontendAgent - Task Assignment

**🟡 HIGH PRIORITY TASK 1: Real Metrics Dashboard**
```
Task ID: BLOCKER-METRICS
Priority: 🔴 CRITICAL
Timeline: Wed-Fri (Week 1)
Owner: FrontendAgent
Effort: 20 hours

DELIVERABLES:
[ ] Admin dashboard shows real user count
[ ] Real message rate visible
[ ] Real API latency graph
[ ] Real error rate tracking
[ ] System health dashboard

IMPLEMENTATION STEPS:
1. Replace static metrics with database queries
2. Create metrics aggregation endpoint
3. Add real-time updates via Socket.io
4. Wire up Chart.js for graphs
5. Add timestamp ranges (today, 7d, 30d)
6. Test: Verify metrics update in real-time

FILES TO MODIFY:
- Nexus/apps/admin/app/page.tsx (replace mock data)
- Nexus/apps/api-gateway/src/routes.ts (add metrics endpoint)
- Nexus/apps/web/lib/metrics.ts (create)

DATABASE QUERIES:
```sql
SELECT COUNT(*) FROM users WHERE last_seen > NOW() - INTERVAL '5 minutes'
SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '1 hour'
SELECT AVG(response_time_ms) FROM api_logs WHERE created_at > NOW() - INTERVAL '5 minutes'
SELECT COUNT(*) FROM api_logs WHERE status_code >= 500 AND created_at > NOW() - INTERVAL '1 hour'
```

ACCEPTANCE CRITERIA:
✅ All metrics are real (from database)
✅ No static/mock values remain
✅ Metrics update every 30 seconds
✅ Historical data available
✅ No type errors

BLOCKS:
- Cannot monitor production
- Cannot detect outages
- Cannot measure performance
```

**🟡 HIGH PRIORITY TASK 2: Remove Design Canvas, Real Routing**
```
Task ID: BLOCKER-FRONTEND-ROUTING
Priority: 🟠 HIGH
Timeline: Mon-Wed (Week 3)
Owner: FrontendAgent
Effort: 35 hours

DELIVERABLES:
[ ] Design canvas mode removed
[ ] Real Next.js routing implemented
[ ] Navigation between screens works
[ ] Breadcrumbs visible
[ ] Deep linking works

FILES TO MODIFY:
- Nexus/apps/web/app/chat/layout.tsx (create)
- Nexus/apps/web/app/chat/[id]/page.tsx (create)
- Nexus/apps/web/app/calls/[id]/page.tsx (create)
- Nexus/apps/web/app/vault/page.tsx (create)
- Nexus/apps/web/app/devices/page.tsx (create)
- Nexus/apps/web/app/settings/page.tsx (create)

ROUTES NEEDED:
/chat (list view)
/chat/[id] (thread view)
/calls/[id] (call view)
/vault (encrypted storage)
/devices (device management)
/settings (user settings)
/auth/login (login page)
/auth/logout (logout)

ACCEPTANCE CRITERIA:
✅ No design canvas mode in production
✅ All routes work with back/forward navigation
✅ Deep links work (share /chat/123)
✅ Mobile responsive
✅ No TypeScript errors
```

---

### DeployAgent - Task Assignment

**🔴 CRITICAL TASK: Production Environment Setup**
```
Task ID: BLOCKER-ENV-CONFIG
Priority: 🔴 CRITICAL
Timeline: Mon-Fri (Week 1-2)
Owner: DeployAgent
Effort: 30 hours

DELIVERABLES:
[ ] Production RDS PostgreSQL running
[ ] Production ElastiCache Redis running
[ ] Environment variables configured
[ ] Docker images built and tested
[ ] Deployment automation setup

PRODUCTION INFRASTRUCTURE:
```
Database:
  - RDS PostgreSQL (multi-AZ for HA)
  - Instance: db.r6i.xlarge (4 CPU, 32GB RAM)
  - Storage: 500GB with auto-scaling
  - Backups: Daily snapshots → S3
  - Encryption: At-rest and in-transit

Cache:
  - ElastiCache Redis 7.x (cluster mode)
  - Instance: cache.r7g.xlarge (4 CPU, 32GB RAM)
  - Persistence: AOF enabled
  - Replication: Multi-AZ
  - Auto-failover: Enabled

Application:
  - ECS Fargate or EC2 (2x instances min)
  - CPU: 2 vCPU, Memory: 4GB
  - Auto-scaling: 2-10 instances based on load
  - Load balancer: ALB with health checks
  - Logging: CloudWatch + ELK stack
  - Monitoring: Prometheus + Grafana
```

ENVIRONMENT VARIABLES (.env.production):
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@rds.internal/quantchat
REDIS_URL=redis://redis.internal:6379
JWT_SECRET=<64-character-random-string>
JWT_REFRESH_SECRET=<64-character-random-string>
CORS_ORIGINS=https://chat.quantchat.com,https://app.quantchat.com
LOG_LEVEL=info
SENTRY_DSN=https://xxx@sentry.io/yyy
AWS_REGION=us-east-1
AWS_S3_BUCKET=quantchat-prod
NEXT_PUBLIC_API_URL=https://api.quantchat.com
NEXT_PUBLIC_WS_URL=wss://api.quantchat.com
```

DOCKER SETUP:
- Create Dockerfile.prod for optimized image
- Setup docker-compose.yml for local testing
- Test image builds and runs correctly
- Push to ECR (AWS container registry)

DEPLOYMENT STEPS:
1. Create VPC with public/private subnets
2. Create RDS subnet group
3. Create security groups (DB, Redis, App)
4. Provision RDS PostgreSQL
5. Provision ElastiCache Redis
6. Setup Secrets Manager for credentials
7. Create IAM roles for services
8. Test connectivity from app to DB/Redis
9. Run migrations
10. Setup health check endpoints

FILES TO CREATE:
- .env.production (NEVER COMMIT)
- docker-compose.yml (production variant)
- Dockerfile.prod
- terraform/ (infrastructure-as-code)
- deployment/

ACCEPTANCE CRITERIA:
✅ RDS accessible from app instances
✅ Redis cache working
✅ Secrets safely stored
✅ Docker image deployable
✅ Zero hardcoded credentials
```

---

### SecurityAgent - Task Assignment

**🔒 SECURITY HARDENING (Week 5-6)**
```
Task ID: SECURITY-HARDENING
Priority: 🟠 HIGH
Timeline: Week 5-6
Owner: SecurityAgent
Effort: 40 hours

DELIVERABLES:
[ ] Security headers configured
[ ] CSRF protection implemented
[ ] Input sanitization in place
[ ] Rate limiting per-user
[ ] 2FA support added
[ ] Penetration test scheduled

SECURITY HEADERS TO ADD:
- Content-Security-Policy: "default-src 'self'; script-src 'self' cdn.example.com"
- Strict-Transport-Security: "max-age=31536000; includeSubDomains"
- X-Content-Type-Options: "nosniff"
- X-Frame-Options: "DENY"
- X-XSS-Protection: "1; mode=block"
- Referrer-Policy: "strict-origin-when-cross-origin"

CSRF PROTECTION:
- Add CSRF tokens to all state-changing endpoints
- Validate tokens in middleware
- Use SameSite cookies

INPUT VALIDATION:
- Sanitize all user input (DOMPurify)
- Validate file uploads
- Rate limit upload endpoints

RATE LIMITING:
Per-user: 100 messages/hour, 10 file uploads/hour
Per-IP: 1000 requests/hour
```

---

## 📊 Weekly Progress Tracking

### Week 1 Milestones (May 7-11)
```
Monday:
  [ ] BackendAgent: OAuth2 design finalized
  [ ] FrontendAgent: Metrics queries ready
  [ ] DeployAgent: Infrastructure plan ready

Tuesday-Thursday:
  [ ] BackendAgent: OAuth2 implementation 50%
  [ ] FrontendAgent: Metrics dashboard wired
  [ ] DeployAgent: RDS provisioning started

Friday:
  [ ] BackendAgent: OAuth2 working, tests passing
  [ ] FrontendAgent: Metrics showing real data
  [ ] DeployAgent: RDS, Redis accessible from dev

Status: ✅ ON TRACK if all 3 done
Status: 🟡 CAUTION if 1 not done
Status: 🔴 BLOCKED if 2+ not done
```

### Week 2 Milestones (May 14-18)
```
Monday-Friday:
  [ ] BackendAgent: S3 upload working end-to-end
  [ ] FrontendAgent: File attachments in chat
  [ ] DeployAgent: Docker images built and tested
  [ ] SecurityAgent: Security headers in place
```

### Week 3-4 Milestones
```
High-priority features:
  [ ] WebRTC socket handlers
  [ ] Client-side E2EE encryption
  [ ] Frontend routing complete
  [ ] Build errors fixed
```

---

## 🎯 Success Criteria

### Week 1 Success
```
✅ Users can login with real credentials
✅ Sessions persist across device resets
✅ Admin dashboard shows real metrics
✅ Production database accessible
✅ Zero critical TypeErrors
```

### Week 2 Success
```
✅ File uploads to S3 working
✅ CDN serving files
✅ Docker images deployable
✅ Security headers configured
✅ Virus scanning integration ready
```

### Full Sprint Success (Week 12)
```
✅ 4 critical blockers = 0
✅ All real-time features working
✅ Security audit PASSED
✅ 80%+ test coverage
✅ 99.9% uptime in staging
✅ 🚀 PRODUCTION LAUNCH
```

---

## 📞 Agent Communication Protocol

**All agents must:**
1. Update `task.md` daily with progress
2. Mark completed tasks
3. Flag blockers immediately
4. Share status at Friday standup

**Daily standup: 10 AM UTC**
- BackendAgent: Auth & S3 status
- FrontendAgent: Routing & Metrics status
- DeployAgent: Infrastructure status
- SecurityAgent: Hardening progress
- TestingAgent: QA results
- DebugAgent: Build issues

**If BLOCKED:**
1. Write reason in task.md immediately
2. Tag dependent agents
3. Escalate to engineering lead if >2 hour impact

---

## 🚨 Escalation Rules

**RED FLAGS:**
- Any task >4 hours behind schedule → Escalate
- Security vulnerability found → Escalate immediately
- Build broken for >1 hour → Escalate
- Test failure blocking deployment → Escalate
- Resource/permission issue → Escalate

**Escalation Path:**
1. BackendAgent → Engineering Lead
2. FrontendAgent → Engineering Lead
3. DeployAgent → DevOps Lead
4. SecurityAgent → Security Lead
5. All Leads → CTO/Product Lead

---

## 🎓 Agent Knowledge Base

Each agent has specific documents:
- **BackendAgent:** COMPREHENSIVE_PROJECT_ANALYSIS.md (Auth/S3 sections)
- **FrontendAgent:** MIGRATION_GUIDE.md (Component/routing examples)
- **DeployAgent:** LAUNCH_TIMELINE.md (Week 9 infrastructure section)
- **SecurityAgent:** COMPREHENSIVE_PROJECT_ANALYSIS.md (Security Assessment)
- **TestingAgent:** LAUNCH_TIMELINE.md (Week 7-8 testing section)
- **DebugAgent:** DEEP_ANALYSIS_FIXES.md (Known issues and fixes)

---

## 🏁 Deployment Ready Conditions

Before agents proceed to next phase:
- [ ] All blockers fixed
- [ ] No type errors in monorepo
- [ ] No failing tests
- [ ] Security review passed
- [ ] All tasks updated in task.md
- [ ] Engineering lead sign-off

---

**Agents: ACTIVATION DATE IS MAY 7, 2026. BEGIN IMMEDIATELY.**

**Deploy with confidence. Execute with discipline. Launch on schedule.**

🚀 Let's ship QuantChat!
