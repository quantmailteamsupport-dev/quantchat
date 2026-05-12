# QuantChat Production Launch — Startup Checklist
**Date:** May 7, 2026  
**Status:** 🔴 LAUNCH SEQUENCE INITIATED

---

## 🚀 PRE-LAUNCH CHECKLIST

### Phase 1: Environment & Dependencies (Day 1)

**Setup Development Environment**
```bash
# Navigate to project root
cd C:\infinity\ trinity\ apps\ motive\QuantChat

# Install root dependencies
npm install

# Navigate to Nexus and install
cd Nexus
npm install

# Install API gateway dependencies
cd apps/api-gateway
npm install

# Return to root
cd ../../../
```

**Verify Build System**
```bash
# From Nexus directory
npm run build          # Should complete with 0 errors
npm run lint           # Should have <5 warnings
npm run check-types    # Should show 0 TypeScript errors
```

**Expected Status:**
- [ ] npm install completes
- [ ] turbo build succeeds
- [ ] ESLint passes
- [ ] TypeScript check passes

---

### Phase 2: Critical Blocker Fixes (Days 2-7)

#### ✅ BLOCKER 1: Authentication (BackendAgent)

**Status:** 🔴 NOT STARTED

**Checklist:**
```
Authentication Setup:
  [ ] Install next-auth v5
  [ ] Create Google OAuth2 credentials (console.google.com)
  [ ] Create GitHub OAuth2 credentials (github.com/settings/developers)
  [ ] Add credentials to .env.local
  [ ] Setup NextAuth route handler (/api/auth/[...nextauth])
  [ ] Implement JWT strategy
  [ ] Create session middleware
  [ ] Remove hardcoded userId from web app
  [ ] Test: Login → logout → still works
  [ ] Test: Multi-device session handling
  [ ] Test: Token refresh mechanism

Installation:
npm install next-auth@latest @next-auth/prisma-adapter

Files to Create/Modify:
  ✅ Nexus/apps/web/app/api/auth/[...nextauth]/route.ts (NEW)
  ✅ Nexus/apps/web/lib/auth.ts (NEW)
  ✅ Nexus/apps/web/app/chat/page.tsx (MODIFY - remove hardcoded userId)
  ✅ Nexus/apps/api-gateway/src/middleware/auth.ts (NEW)
  ✅ Nexus/apps/web/.env.local (NEW)

Code Template for Nexus/apps/web/app/api/auth/[...nextauth]/route.ts:
```typescript
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  jwt: {
    secret: process.env.JWT_SECRET!,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

Acceptance Criteria:
  ✅ No hardcoded user IDs anywhere
  ✅ Users can login with OAuth2
  ✅ Sessions persist after page reload
  ✅ Logout works
  ✅ Token refresh automatic
  ✅ Type-safe session access
```

#### ✅ BLOCKER 2: S3 File Upload (BackendAgent)

**Status:** 🔴 NOT STARTED

**Checklist:**
```
AWS Setup:
  [ ] Create S3 bucket (quantchat-prod or similar)
  [ ] Enable versioning
  [ ] Enable server-side encryption
  [ ] Configure CORS:
      GET, PUT, POST, DELETE from https://*.quantchat.com
  [ ] Create IAM user for app with S3 permissions
  [ ] Get access key and secret

CDN Setup:
  [ ] Create CloudFront distribution
  [ ] Point to S3 bucket
  [ ] Setup cache invalidation
  [ ] Configure origin access identity (restrict direct S3 access)

Code Implementation:
  [ ] Create S3 client in API gateway
  [ ] Implement presigned URL endpoint
  [ ] Add file validation (size, type)
  [ ] Integrate virus scanning (ClamAV)
  [ ] Test: Upload via browser → S3 → CloudFront

Files to Create:
  ✅ Nexus/apps/api-gateway/src/services/s3.ts (NEW)
  ✅ Nexus/apps/web/lib/upload.ts (NEW)
  
Files to Modify:
  ✅ Nexus/apps/api-gateway/src/routes.ts (update presign endpoint)
  ✅ Nexus/apps/api-gateway/src/index.ts (S3 client setup)
  ✅ .env.production (S3 variables)

S3 Service Template:
```typescript
import AWS from 'aws-sdk';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

export async function generatePresignedUrl(
  filename: string,
  mimetype: string
) {
  // Validate
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (!isAllowedMimeType(mimetype)) throw new Error('Invalid file type');
  
  const key = `${userId}/${Date.now()}-${filename}`;
  
  const params = {
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    ContentType: mimetype,
    Expires: 3600, // 1 hour
  };
  
  const url = s3.getSignedUrl('putObject', params);
  return { url, key };
}
```

Acceptance Criteria:
  ✅ Presigned URLs work
  ✅ Files upload to S3
  ✅ CloudFront CDN caching works
  ✅ File validation in place
  ✅ Virus scanning integrated
  ✅ Old files cleanup scheduled
```

#### ✅ BLOCKER 3: Real Metrics (FrontendAgent)

**Status:** 🔴 NOT STARTED

**Checklist:**
```
Database Queries:
  [ ] CREATE TABLE api_logs (
      id UUID PRIMARY KEY,
      endpoint VARCHAR(255),
      method VARCHAR(10),
      status_code INT,
      response_time_ms INT,
      created_at TIMESTAMP
    )
  [ ] CREATE INDEX idx_api_logs_created_at ON api_logs(created_at)

API Endpoint:
  [ ] Create /api/admin/metrics endpoint
  [ ] Query active users (last_seen > 5 min ago)
  [ ] Query message rate (count in last hour)
  [ ] Query API latency (average response time)
  [ ] Query error rate (errors in last hour)
  [ ] Cache results for 30 seconds in Redis

Frontend:
  [ ] Remove static mock data
  [ ] Call /api/admin/metrics every 30 seconds
  [ ] Display real numbers
  [ ] Add Chart.js graphs for trends

Files to Create:
  ✅ Nexus/packages/database/prisma/migrations/[timestamp]_add_api_logs.sql
  
Files to Modify:
  ✅ Nexus/apps/api-gateway/src/routes.ts (add metrics endpoint)
  ✅ Nexus/apps/admin/app/page.tsx (wire real data)
  ✅ Nexus/apps/admin/lib/metrics.ts (NEW - metrics queries)

Metrics Endpoint Template:
```typescript
app.get('/api/admin/metrics', async (req, res) => {
  try {
    const activeUsers = await prisma.user.count({
      where: { lastSeen: { gte: new Date(Date.now() - 5*60*1000) } }
    });
    
    const messageRate = await prisma.message.count({
      where: { createdAt: { gte: new Date(Date.now() - 60*60*1000) } }
    });
    
    const avgLatency = await redis.get('metrics:avg_latency') || 150;
    
    const errorRate = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM api_logs 
      WHERE status_code >= 500 AND created_at > NOW() - INTERVAL 1 hour
    `;
    
    res.json({
      activeUsers,
      messageRate,
      avgLatency: parseInt(avgLatency),
      errorRate: errorRate[0]?.count || 0,
    });
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});
```

Acceptance Criteria:
  ✅ No mock data remains
  ✅ All metrics from database
  ✅ Real-time updates (30s refresh)
  ✅ Historical data available
  ✅ Charts display correctly
```

#### ✅ BLOCKER 4: Production Environment (DeployAgent)

**Status:** 🔴 NOT STARTED

**Checklist:**
```
AWS Infrastructure:
  [ ] Create VPC with public/private subnets
  [ ] Create security groups:
      - RDS (port 5432 from app only)
      - Redis (port 6379 from app only)
      - ALB (port 443 from internet)
  [ ] Create RDS PostgreSQL subnet group
  [ ] Provision RDS PostgreSQL:
      - Engine: PostgreSQL 15
      - Instance: db.r6i.xlarge
      - Storage: 500GB with auto-scaling
      - Multi-AZ: Enabled
      - Backup retention: 30 days
      - Encryption: Yes
  [ ] Provision ElastiCache Redis:
      - Version: 7.x
      - Instance: cache.r7g.xlarge
      - Mode: Cluster
      - Multi-AZ: Enabled
      - Encryption: Yes
      - Automatic failover: Enabled

Environment Variables:
  [ ] Create .env.production (NEVER COMMIT!)
  [ ] Add to AWS Secrets Manager
  [ ] Test: App can read from Secrets Manager

Environment Variables Template:
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-rds.internal:5432/quantchat
REDIS_URL=redis://prod-redis.internal:6379
JWT_SECRET=<64-char-random-key>
JWT_REFRESH_SECRET=<64-char-random-key>
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
CORS_ORIGINS=https://chat.quantchat.com,https://app.quantchat.com
LOG_LEVEL=info
SENTRY_DSN=https://xxx@sentry.io/yyy
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET=quantchat-prod
CLOUDFRONT_DOMAIN=d111.cloudfront.net
NEXT_PUBLIC_API_URL=https://api.quantchat.com
NEXT_PUBLIC_WS_URL=wss://api.quantchat.com
```

Docker Setup:
  [ ] Create Dockerfile.prod (optimized)
  [ ] Build image: docker build -f Dockerfile.prod -t quantchat:latest .
  [ ] Test image locally
  [ ] Push to ECR: aws ecr push quantchat:latest

Files to Create:
  ✅ Dockerfile.prod (NEW)
  ✅ .env.production (NEW - GITIGNORE!)
  ✅ terraform/ (infrastructure-as-code)
  ✅ deployment/rollback.sh

Acceptance Criteria:
  ✅ RDS accessible from app
  ✅ Redis cache working
  ✅ All env vars accessible
  ✅ Docker image deployable
  ✅ Zero hardcoded credentials
  ✅ Secrets Manager integration working
```

---

## 📊 Daily Status Template

**Fill this out each day at EOD:**

```
DATE: [YYYY-MM-DD]

BLOCKER-AUTH Status:
  Completion: X%
  Blocker: [Any blockers?]
  Next steps: [What's next?]

BLOCKER-S3 Status:
  Completion: X%
  Blocker: [Any blockers?]
  Next steps: [What's next?]

BLOCKER-METRICS Status:
  Completion: X%
  Blocker: [Any blockers?]
  Next steps: [What's next?]

BLOCKER-ENV-CONFIG Status:
  Completion: X%
  Blocker: [Any blockers?]
  Next steps: [What's next?]

Overall Status: ✅ ON TRACK / 🟡 CAUTION / 🔴 BLOCKED

What needs help from other agents?
  - [dependency or blocker]

Any risks discovered?
  - [risk description]
```

---

## 🎯 Week 1 Target: ALL 4 BLOCKERS = 50% COMPLETE

By end of Week 1 (May 11):
- [ ] BLOCKER-AUTH: 75% (mostly working, edge cases remain)
- [ ] BLOCKER-S3: 50% (AWS setup done, code 50%)
- [ ] BLOCKER-METRICS: 100% (fully working)
- [ ] BLOCKER-ENV-CONFIG: 75% (RDS/Redis ready, deployment scripts 50%)

---

## 🚨 Emergency Contacts

**If BLOCKED for >2 hours:**
1. Document in task.md
2. Tag engineering lead
3. Call daily standup early

**If security issue found:**
1. Stop all work
2. Notify SecurityAgent immediately
3. Do NOT commit or push

**If build broken:**
1. Notify DebugAgent
2. Revert last changes if needed
3. Coordinate with affected agents

---

## ✅ Sign-Off Checklist

**Before marking blocker complete:**
- [ ] Code written and tested
- [ ] Zero type errors
- [ ] Tests passing
- [ ] Code reviewed
- [ ] Documented in task.md
- [ ] No hardcoded secrets
- [ ] Acceptance criteria met

---

**READY TO LAUNCH?** 🚀

**Everyone get started. Discipline. Focus. Ship.**

Let's build production-quality software.
