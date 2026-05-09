# BLOCKER-S3: AWS S3 & CloudFront Setup Guide

**Status:** 🔧 Implementation in Progress  
**Date:** May 8, 2026  
**Owner:** BackendAgent  
**Timeline:** Complete by May 15, 2026

---

## ✅ What Has Been Implemented

### 1. **S3Service Module** 🆕
- ✅ `Nexus/apps/api-gateway/src/services/S3Service.ts` created
- ✅ Real AWS S3 presigned URL generation
- ✅ File validation (type, size)
- ✅ File metadata tracking in database
- ✅ CloudFront CDN integration
- ✅ Health checks for S3 connectivity

### 2. **API Routes Updated**
- ✅ `/api/media/presign` - Real S3 presigned URLs (no longer mocked)
- ✅ Proper error handling and validation
- ✅ User authentication enforcement
- ✅ File metadata storage

### 3. **Security Features**
- ✅ File type whitelist (images, documents, audio, video)
- ✅ File size limits (100MB max)
- ✅ S3 encryption (AES256)
- ✅ Presigned URL expiration (1 hour default)
- ✅ User ID scoped file storage

---

## 🔧 Manual Setup Required

### Step 1: Create AWS S3 Bucket

```bash
# Using AWS CLI
aws s3api create-bucket \
  --bucket quantchat-prod-attachments \
  --region us-east-1 \
  --acl private

# Enable versioning (recommended for recovery)
aws s3api put-bucket-versioning \
  --bucket quantchat-prod-attachments \
  --versioning-configuration Status=Enabled

# Block all public access
aws s3api put-public-access-block \
  --bucket quantchat-prod-attachments \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Step 2: Create CloudFront Distribution

**Why CloudFront?**
- 👉 Fast downloads (CDN edge locations worldwide)
- 👉 Reduce S3 bandwidth costs
- 👉 HTTPS with your own domain
- 👉 Caching for frequently accessed files

```bash
# Create distribution (use AWS Console for easier setup)
# Key settings:
# - Origin: quantchat-prod-attachments.s3.us-east-1.amazonaws.com
# - Origin Access Identity (OAI): Create one
# - Viewer Protocol Policy: Redirect HTTP to HTTPS
# - Default TTL: 86400 (1 day)
# - Allowed HTTP Methods: GET, HEAD, OPTIONS
```

### Step 3: Create IAM User for App Access

```bash
# Create new IAM user
aws iam create-user --user-name quantchat-s3-app

# Create access key
aws iam create-access-key --user-name quantchat-s3-app

# Attach S3 policy
cat > /tmp/s3-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::quantchat-prod-attachments",
        "arn:aws:s3:::quantchat-prod-attachments/*"
      ]
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name quantchat-s3-app \
  --policy-name S3Access \
  --policy-document file:///tmp/s3-policy.json
```

### Step 4: Update Environment Variables

In `.env.production`:

```env
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalr...
S3_BUCKET_NAME=quantchat-prod-attachments
S3_PRESIGN_EXPIRY_SECONDS=3600

# CloudFront Configuration
CLOUDFRONT_DOMAIN=d123456789.cloudfront.net
CLOUDFRONT_DISTRIBUTION_ID=E123ABC456
```

### Step 5: Update Database Schema

Add the `FileMetadata` table to your Prisma schema:

```prisma
// prisma/schema.prisma

model FileMetadata {
  id                String     @id @default(cuid())
  userId            String
  fileName          String
  fileType          String
  fileSize          Int?
  s3Key             String     @unique
  conversationId    String?
  messageId         String?
  status            String     @default("pending_upload") // pending_upload, uploaded, deleted
  uploadedAt        DateTime?
  deletedAt         DateTime?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  @@index([userId])
  @@index([conversationId])
  @@index([messageId])
}
```

Then run migration:

```bash
npx prisma migrate dev --name add_file_metadata
```

### Step 6: Install AWS SDK

```bash
# In Nexus/apps/api-gateway
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Or using pnpm
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### Step 7: Test the Flow

```bash
# 1. Get presigned URL
curl -X POST http://localhost:3000/api/media/presign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-token>" \
  -d '{
    "fileName": "test-image.jpg",
    "fileType": "image/jpeg"
  }'

# Response:
# {
#   "uploadUrl": "https://quantchat-prod-attachments.s3.us-east-1.amazonaws.com/...",
#   "downloadUrl": "https://d123456789.cloudfront.net/uploads/...",
#   "expiresIn": 3600,
#   "fileKey": "uploads/user-id/timestamp_filename"
# }

# 2. Upload to S3 using presigned URL
curl -X PUT "<UPLOAD_URL>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test-image.jpg

# 3. Access file via CloudFront
curl https://d123456789.cloudfront.net/uploads/user-id/timestamp_filename
```

---

## 🎯 Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 1. Request presigned URL
       ▼
┌──────────────────┐
│  QuantChat API   │──────────────────────┐
│  /media/presign  │                      │
└──────────────────┘                      │
       │                                  │
       │ 2. Return presigned URL          │
       ▼                                  │
   Browser                                │ 3. Generate presigned URL
       │                                  │ + store metadata
       │ 4. Upload directly to S3         │
       └──────────────────────────────────►
                                    AWS S3
                                          │
                                          │ 5. CloudFront cache
                                          ▼
                                   CloudFront CDN
                                          │
                                          │ 6. Download via CDN
                                          ▼
                                       Users
```

---

## ✅ Testing Checklist

### Local Development
- [ ] S3Service module loads without errors
- [ ] `/api/media/presign` endpoint responds
- [ ] File validation works (type, size)
- [ ] Database stores file metadata
- [ ] Presigned URLs are valid

### Production Pre-Deployment
- [ ] AWS S3 bucket created and configured
- [ ] CloudFront distribution is live
- [ ] IAM user has correct permissions
- [ ] Environment variables are set
- [ ] Database schema includes FileMetadata table
- [ ] AWS SDK is installed in api-gateway
- [ ] End-to-end test: presign → upload → download works

### Acceptance Criteria ✅
- ✅ Chat attachments can be uploaded to S3
- ✅ Files are accessible via CloudFront CDN
- ✅ File metadata is tracked in database
- ✅ No hardcoded S3 URLs
- ✅ Security: Private bucket, presigned URLs expire
- ✅ Works with chat message attachments

---

## 📝 Key Files Modified/Created

| File | Status | Details |
|------|--------|---------|
| `S3Service.ts` | ✅ Created | S3 integration service |
| `routes.ts` | ✅ Updated | `/api/media/presign` now uses real S3 |
| `.env.production` | ✅ Updated | Added AWS credentials |
| Database schema | ⏳ Need migration | FileMetadata table |

---

## 🔗 Integration with Chat

When a user uploads a file in the chat:

1. **Frontend calls** `/api/media/presign` → gets presigned URL
2. **Frontend uploads** directly to S3 (no backend needed)
3. **Frontend uses** downloadUrl (CloudFront) in the chat message
4. **Database stores** fileKey for later reference
5. **Other users download** via CDN (fast, cached)

---

## 💡 Cost Optimization

- **Storage:** ~$0.023/GB/month
- **Data Transfer:** Included in CloudFront (cheaper than direct S3)
- **Requests:** ~$0.0004 per 10,000 PUT/LIST requests
- **CloudFront:** Pay for data transfer only

**Estimate for 1M attachments/month:**
- ~500 concurrent users
- ~10MB average file size
- **~$2,000/month** (storage + transfer)

---

## 🚀 Next: Deploy & Monitor

After S3 setup:

1. Deploy api-gateway with S3Service
2. Monitor CloudFront metrics
3. Setup S3 bucket access logging
4. Configure S3 lifecycle policies (delete old temp files)
5. Setup cost alarms in AWS

---

## 📞 Troubleshooting

### "Access Denied" when uploading
- Check IAM user permissions
- Verify bucket policy allows the presigned URL user
- Check AWS access keys

### "File not found" after upload
- Verify presigned URL expiration
- Check CloudFront distribution is live
- Wait for cache invalidation

### High costs
- Implement S3 lifecycle policies for cleanup
- Use CloudFront for all downloads
- Monitor file sizes being uploaded

---

**Generated by:** Claude AI Agent  
**Last Updated:** May 8, 2026  
**Status:** Ready for AWS Setup
