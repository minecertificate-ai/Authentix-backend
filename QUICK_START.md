# Quick Start - Copy Credentials & Deploy

## 🚀 Quick Setup (5 minutes)

### 1. Copy Environment Variables from Frontend

Your frontend has `.env.local` with credentials. Copy them to backend:

```bash
# Navigate to backend
cd /Users/int/Documents/GitHub/Authentix-backend

# Create .env.local from template
cp .env.example .env.local
```

### 2. Fill in `.env.local` with values from frontend `.env.local`

Open both files side-by-side and copy these values:

```env
# From frontend .env.local → Backend .env.local

SUPABASE_URL=<value from NEXT_PUBLIC_SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<same value>
FRONTEND_URL=<value from NEXT_PUBLIC_APP_URL>
APP_URL=<value from NEXT_PUBLIC_APP_URL>
RAZORPAY_KEY_ID_PROD=<value from NEXT_PUBLIC_RAZORPAY_KEY_ID_PROD>
RAZORPAY_KEY_SECRET_PROD=<same value>
RAZORPAY_WEBHOOK_SECRET_PROD=<same value>
```

### 3. Test Locally

```bash
npm install
npm run dev
```

Visit: http://localhost:3000/health

### 4. Deploy to Vercel

```bash
# Login (first time only)
vercel login

# Deploy
vercel --prod
```

### 5. Set Environment Variables in Vercel

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add all variables from your `.env.local`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`
- `APP_URL`
- `RAZORPAY_KEY_ID_PROD`
- `RAZORPAY_KEY_SECRET_PROD`
- `RAZORPAY_WEBHOOK_SECRET_PROD`

**Important:** Set environment to **Production** for all variables.

### 6. Redeploy (to pick up env vars)

```bash
vercel --prod
```

### 7. Update Frontend

After backend is deployed, update frontend `.env.local`:

```env
NEXT_PUBLIC_API_URL=https://your-backend.vercel.app/api/v1
```

And add this to Vercel environment variables for the frontend project.

## ✅ Done!

Your backend is now deployed and ready to receive requests from the frontend.

## 📚 More Details

- See `ENV_SETUP.md` for detailed environment variable mapping
- See `DEPLOYMENT.md` for comprehensive deployment guide
