# Vercel Deployment Guide

## Prerequisites

1. ✅ Backend code is ready
2. ✅ Environment variables are documented in `.env.example`
3. ✅ You have a Vercel account
4. ✅ You have the Vercel CLI installed (`npm i -g vercel`)

## Step 1: Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
```

## Step 2: Login to Vercel

```bash
cd /Users/int/Documents/GitHub/Authentix-backend
vercel login
```

## Step 3: Initialize Vercel Project

```bash
vercel
```

Follow the prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → Your account
- **Link to existing project?** → No (first time) or Yes (if updating)
- **Project name?** → `authentix-backend` (or your preferred name)
- **Directory?** → `./` (current directory)
- **Override settings?** → No

## Step 4: Set Environment Variables in Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (`authentix-backend`)
3. Go to **Settings** → **Environment Variables**
4. Add each variable:

   **Supabase:**
   - `SUPABASE_URL` = `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `your-service-role-key`

   **Frontend:**
   - `FRONTEND_URL` = `https://your-frontend.vercel.app` (your production frontend URL)
   - `APP_URL` = `https://your-frontend.vercel.app` (same as above)

   **Razorpay (Production):**
   - `RAZORPAY_KEY_ID_PROD` = `your-prod-key-id`
   - `RAZORPAY_KEY_SECRET_PROD` = `your-prod-key-secret`
   - `RAZORPAY_WEBHOOK_SECRET_PROD` = `your-prod-webhook-secret`

   **Optional:**
   - `LOG_LEVEL` = `info`
   - `NODE_ENV` = `production` (Vercel sets this automatically)

5. **Important:** Set the environment for each variable:
   - Select **Production**, **Preview**, and **Development** (or just Production for secrets)

### Option B: Via Vercel CLI

```bash
# Set environment variables
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add FRONTEND_URL production
vercel env add APP_URL production
vercel env add RAZORPAY_KEY_ID_PROD production
vercel env add RAZORPAY_KEY_SECRET_PROD production
vercel env add RAZORPAY_WEBHOOK_SECRET_PROD production
vercel env add LOG_LEVEL production
```

## Step 5: Deploy to Production

```bash
vercel --prod
```

Or push to your main branch (if connected to Git):
```bash
git push origin main
```

## Step 6: Verify Deployment

1. Check the deployment URL (shown after `vercel --prod`)
2. Test the health endpoint:
   ```bash
   curl https://your-backend.vercel.app/health
   ```
   Should return: `{"status":"ok"}`

3. Test an API endpoint (requires auth):
   ```bash
   curl https://your-backend.vercel.app/api/v1/templates
   ```

## Step 7: Update Frontend Environment Variable

After deployment, update your frontend `.env.local` (and Vercel environment variables):

```env
NEXT_PUBLIC_API_URL=https://your-backend.vercel.app/api/v1
```

## Step 8: Configure CORS (if needed)

The backend is configured to accept requests from `FRONTEND_URL`. Make sure:
- `FRONTEND_URL` in backend matches your frontend production URL
- Frontend `NEXT_PUBLIC_API_URL` points to backend URL

## Troubleshooting

### Error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
- Check that environment variables are set in Vercel
- Make sure they're set for the correct environment (Production/Preview/Development)

### Error: "Razorpay credentials not configured"
- Check that Razorpay environment variables are set
- Verify `NODE_ENV` or `VERCEL_ENV` is set correctly

### CORS Errors
- Verify `FRONTEND_URL` matches your frontend production URL exactly
- Check that frontend is sending requests to the correct backend URL

### 404 on API Routes
- Verify `vercel.json` routes are configured correctly
- Check that the build is using `@vercel/node`

## Next Steps

1. ✅ Backend deployed
2. ✅ Environment variables configured
3. ✅ Health check passing
4. ⏭️ Update frontend `NEXT_PUBLIC_API_URL`
5. ⏭️ Test full integration
6. ⏭️ Set up custom domain (optional)
