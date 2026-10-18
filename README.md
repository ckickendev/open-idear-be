# OpenIdear Backend (`open-trash-tech-be`)

Backend API and video delivery services for the OpenIdear Course Platform, powered by Node.js, Express, MongoDB, and **Bunny Stream**.

---

## 📹 Video Streaming Architecture (Bunny Stream)

Bunny Stream is the exclusive video streaming and transcoding provider for OpenIdear. Cloudflare Stream has been completely migrated and decommissioned.

### Architecture Overview

1. **Direct TUS Uploads**:
   - Course creators initiate an upload session via `POST /media/bunny/upload-signature`.
   - The backend validates course/lesson ownership and creates a video container on Bunny Stream.
   - The frontend streams binary data directly to `https://video.bunnycdn.com/tusupload` with chunk progress tracking, never proxying multi-gigabyte video files through the application server.
2. **Readiness & Webhooks**:
   - Video processing is asynchronous (resolutions: 1080p, 720p, 480p, 360p).
   - Bunny Stream emits webhook events to `POST /media/bunny/webhook`.
   - Payloads are validated via HMAC-SHA256 signature matching `BUNNY_STREAM_WEBHOOK_SECRET`.
   - Videos are gated: they do not become playable until status `ready` (Status 3/4) is verified.
3. **Secure Tokenized Playback**:
   - Clients request signed playback via `GET /media/bunny/playback/:lessonId`.
   - The backend enforces course publication, free preview permissions, and active student enrollment.
   - Authorized sessions receive short-lived tokens (1 hour / 3600s) generated via SHA-256 HMAC:  
     `SHA256_HEX(TokenSecurityKey + VideoId + Expires)`.
   - Embed URL (`player.mediadelivery.net`) and HLS stream (`*.b-cdn.net/.../playlist.m3u8`) are restricted to verified students.
4. **Decoupled Learning Records**:
   - Course curriculum, chapter ordering, lesson progress, and completion are stored in MongoDB decoupled from external video URLs.
   - Captions and transcripts are automatically ingested from Bunny Stream VTT files, with automated Gemini AI speech/video fallback.

---

## ⚙️ Environment Configuration

Set the following variables in your `.env` file:

```env
# MongoDB Connection
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>

# Application URLs & CORS
ROOT_BACKEND=http://localhost:5001
ROOT_FRONTEND=http://localhost:3000
CORS_ALLOW_ORIGINS=https://openidear.xyz,https://www.openidear.xyz,http://localhost:3000

# Bunny Stream Video Provider (Required)
BUNNY_STREAM_LIBRARY_ID=123456
BUNNY_STREAM_API_KEY=your-bunny-api-key
BUNNY_STREAM_TOKEN_KEY=your-token-authentication-key
BUNNY_STREAM_CDN_HOSTNAME=video.openidear.xyz
BUNNY_STREAM_WEBHOOK_SECRET=your-webhook-signing-secret

# AI Studio
GEMINI_API_KEY=your-gemini-api-key
```

---

## 🛠️ Bunny Stream Dashboard Setup

To configure your Bunny Stream Video Library:

1. **Create Video Library**: Go to **Bunny Stream** -> **Add Video Library** (e.g. `openidar-production`).
2. **Token Authentication**: Under **Video Library -> Security**:
   - Toggle **Enable Token Authentication** to **ON**.
   - Copy the generated authentication key into `BUNNY_STREAM_TOKEN_KEY`.
   - Toggle **Block Direct Playback** to **ON** to reject unsigned requests.
3. **Allowed Referrers**:
   - Add your platform domains: `https://openidear.xyz`, `https://www.openidear.xyz`, and `http://localhost:3000`.
4. **Webhooks**: Under **Video Library -> Webhooks**:
   - Set Webhook URL to: `https://api.openidear.xyz/media/bunny/webhook`.
   - Set the Signing Secret and copy into `BUNNY_STREAM_WEBHOOK_SECRET`.

---

## 🧪 Test Suites

Run all unit, pipeline, security, and migration tests:

```bash
# Run all Bunny Stream test suites
npm test

# Run individual test suites
node tests/bunnyStream.test.js
node tests/bunnyStreamUploadPipeline.test.js
node -r ts-node/register tests/bunnyStreamSecurityAuth.test.js
node tests/cleanupLegacyTestVideos.test.js
```

---

## 🧹 Test Video Cleanup

A repeatable, safe script is provided to identify and clean up disposable test video assets without touching active course lessons:

```bash
# 1. Safe dry-run report (no database modifications)
npm run cleanup:test-videos:dry

# 2. Explicit apply mode (requires both --apply and --confirm flags)
npm run cleanup:test-videos
```

---

## 🔍 Troubleshooting & Error Codes

| HTTP Code | Error Code | Description | Resolution |
|---|---|---|---|
| **401** | `UNAUTHENTICATED` | User is not logged in on a locked lesson. | Log in with an active account. |
| **403** | `LESSON_LOCKED` | Lesson requires active course enrollment. | Enroll in the course. |
| **403** | `COURSE_UNPUBLISHED` | Course is a draft and not published. | Only the course instructor can view draft lessons. |
| **403** | `FORBIDDEN_COURSE_OWNER` | Attempt to upload or modify another instructor's course. | Verify instructor user ID. |
| **403** | `FORBIDDEN_MEDIA_OWNER` | Attempt to overwrite another user's media document. | Ensure video upload session belongs to the requesting user. |
| **410** | `PROVIDER_DEPRECATED` | Attempt to access decommissioned `/media/cloudflare/*` endpoints. | Update client to use `/media/bunny/*`. |
