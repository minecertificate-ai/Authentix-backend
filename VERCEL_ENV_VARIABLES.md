# Vercel Environment Variables - Complete Checklist

## 📋 Step-by-Step: Add These Variables in Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

### ✅ REQUIRED Variables (Must Add)

Add these **exact variable names** with their values:

| Variable Name | Value | Environment | Notes |
|--------------|-------|-------------|-------|
| `SUPABASE_URL` | `https://brkyyeropjslfzwnhxcw.supabase.co` | Production, Preview, Development | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Production, Preview, Development | Your Supabase service role key (from backend .env.local) |
| `FRONTEND_URL` | `http://localhost:3000` | Production, Preview, Development | Frontend runs locally (use localhost) |
| `APP_URL` | `http://localhost:3000` | Production, Preview, Development | Same as FRONTEND_URL (frontend runs locally) |

### ⚙️ OPTIONAL Variables (Recommended)

| Variable Name | Value | Environment | Notes |
|--------------|-------|-------------|-------|
| `LOG_LEVEL` | `info` | Production, Preview, Development | Logging level (defaults to 'info' if not set) |

### 💳 RAZORPAY Variables (Add When Available)

If you have Razorpay credentials, add these:

| Variable Name | Value | Environment | Notes |
|--------------|-------|-------------|-------|
| `RAZORPAY_KEY_ID_PROD` | `your-prod-key-id` | Production only | Razorpay production key ID |
| `RAZORPAY_KEY_SECRET_PROD` | `your-prod-key-secret` | Production only | Razorpay production key secret |
| `RAZORPAY_WEBHOOK_SECRET_PROD` | `your-prod-webhook-secret` | Production only | Razorpay production webhook secret |
| `RAZORPAY_KEY_ID_TEST` | `your-test-key-id` | Preview, Development | Razorpay test key ID (for preview/dev) |
| `RAZORPAY_KEY_SECRET_TEST` | `your-test-key-secret` | Preview, Development | Razorpay test key secret |
| `RAZORPAY_WEBHOOK_SECRET_TEST` | `your-test-webhook-secret` | Preview, Development | Razorpay test webhook secret |

### ❌ DO NOT ADD (Set Automatically by Vercel)

- `NODE_ENV` - Vercel sets this automatically to `production`
- `PORT` - Vercel sets this automatically
- `HOST` - Not needed on Vercel
- `VERCEL_ENV` - Vercel sets this automatically (`production`, `preview`, or `development`)

---

## 🎯 Quick Copy-Paste Checklist

### Minimum Required (Copy these first):

```
SUPABASE_URL=https://brkyyeropjslfzwnhxcw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya3l5ZXJvcGpzbGZ6d25oeGN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI1MjcxNiwiZXhwIjoyMDc5ODI4NzE2fQ.hRJhu1jNsA6FYvG3kHLamQFuyIEV77DywNknSCGJHvA
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
LOG_LEVEL=info
```

**⚠️ IMPORTANT:** Use `http://localhost:3000` since frontend runs locally (not deployed)

---

## 📝 How to Add in Vercel Dashboard

1. **Go to your project** in Vercel Dashboard
2. Click **Settings** (gear icon)
3. Click **Environment Variables** in the left sidebar
4. For each variable:
   - Click **Add New**
   - Enter the **Variable Name** (exactly as shown above)
   - Enter the **Value**
   - Select **Environment(s)**: 
     - ✅ Production (for production deployments)
     - ✅ Preview (for pull request previews)
     - ✅ Development (for local development with Vercel CLI)
   - Click **Save**
5. **Redeploy** after adding variables (Vercel will automatically redeploy, or click "Redeploy")

---

## 🔍 How to Verify

After adding variables and deploying:

1. Check deployment logs in Vercel
2. Test health endpoint:
   ```bash
   curl https://your-backend.vercel.app/health
   ```
3. Check for errors in logs - if you see "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", the variables aren't set correctly

---

## 🚨 Common Mistakes

1. ❌ **Wrong variable name** - Must match exactly (case-sensitive)
2. ❌ **Not setting for all environments** - Make sure to select Production, Preview, and Development
3. ❌ **Wrong FRONTEND_URL** - Must be your actual frontend production URL
4. ❌ **Missing quotes** - Don't add quotes around values in Vercel
5. ❌ **Extra spaces** - Make sure there are no leading/trailing spaces

---

## ✅ After Adding Variables

1. Variables are saved automatically
2. Vercel will trigger a new deployment
3. Wait for deployment to complete
4. Test your backend API endpoints:
   ```bash
   curl https://your-backend.vercel.app/health
   ```
5. **Update frontend `.env.local`:**
   - Set `NEXT_PUBLIC_API_URL=https://your-backend.vercel.app/api/v1`
   - Replace with your actual Vercel backend URL
6. Run frontend locally: `cd /Users/int/Documents/GitHub/MineCertificate && npm run dev`

**Note:** Frontend runs locally, so `FRONTEND_URL` should be `http://localhost:3000`
