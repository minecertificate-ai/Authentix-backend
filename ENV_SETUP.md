# Environment Variables Setup Guide

## Step 1: Copy Credentials from Frontend

Your frontend `.env.local` file should have these variables. Copy them to the backend:

### From Frontend `.env.local` → Backend `.env.local`

| Frontend Variable | Backend Variable | Notes |
|------------------|------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` | Same value, different name |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Same value |
| `NEXT_PUBLIC_APP_URL` | `FRONTEND_URL` | Same value |
| `NEXT_PUBLIC_APP_URL` | `APP_URL` | Same value (duplicate for compatibility) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID_PROD` | `RAZORPAY_KEY_ID_PROD` | Same value |
| `RAZORPAY_KEY_SECRET_PROD` | `RAZORPAY_KEY_SECRET_PROD` | Same value |
| `RAZORPAY_WEBHOOK_SECRET_PROD` | `RAZORPAY_WEBHOOK_SECRET_PROD` | Same value |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID_TEST` | `RAZORPAY_KEY_ID_TEST` | Same value (if using test mode) |
| `RAZORPAY_KEY_SECRET_TEST` | `RAZORPAY_KEY_SECRET_TEST` | Same value (if using test mode) |
| `RAZORPAY_WEBHOOK_SECRET_TEST` | `RAZORPAY_WEBHOOK_SECRET_TEST` | Same value (if using test mode) |

## Step 2: Create Backend `.env.local`

1. Copy the template:
   ```bash
   cd /Users/int/Documents/GitHub/Authentix-backend
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in the values from your frontend `.env.local`

3. Verify all required variables are set:
   - ✅ `SUPABASE_URL`
   - ✅ `SUPABASE_SERVICE_ROLE_KEY`
   - ✅ `FRONTEND_URL` (or `APP_URL`)
   - ✅ Razorpay credentials (at least TEST or PROD)

## Step 3: Test Locally

```bash
cd /Users/int/Documents/GitHub/Authentix-backend
npm install
npm run dev
```

The server should start on `http://localhost:3000`

## Step 4: Prepare for Vercel Deployment

Before deploying, make sure you have all the environment variables ready. You'll need to add them in Vercel dashboard.

### Required Variables for Vercel:

1. **Supabase**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Frontend URL**
   - `FRONTEND_URL` (your production frontend URL, e.g., `https://your-app.vercel.app`)
   - `APP_URL` (same as FRONTEND_URL)

3. **Razorpay (Production)**
   - `RAZORPAY_KEY_ID_PROD`
   - `RAZORPAY_KEY_SECRET_PROD`
   - `RAZORPAY_WEBHOOK_SECRET_PROD`

4. **Optional**
   - `LOG_LEVEL=info` (defaults to 'info' if not set)
   - `NODE_ENV=production` (Vercel sets this automatically)

## Step 5: Deploy to Vercel

See `DEPLOYMENT.md` for detailed deployment instructions.
