# Deployment Summary - Backend Only on Vercel

## 🎯 Setup Overview

- **Backend**: Deployed on Vercel
- **Frontend**: Runs locally on `http://localhost:3000`

## 📋 Step 1: Add Environment Variables in Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these **exact variables**:

| Variable Name | Value | Select All Environments |
|--------------|-------|-------------------------|
| `SUPABASE_URL` | `https://brkyyeropjslfzwnhxcw.supabase.co` | ✅ Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya3l5ZXJvcGpzbGZ6d25oeGN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDI1MjcxNiwiZXhwIjoyMDc5ODI4NzE2fQ.hRJhu1jNsA6FYvG3kHLamQFuyIEV77DywNknSCGJHvA` | ✅ Production, Preview, Development |
| `FRONTEND_URL` | `http://localhost:3000` | ✅ Production, Preview, Development |
| `APP_URL` | `http://localhost:3000` | ✅ Production, Preview, Development |
| `LOG_LEVEL` | `info` | ✅ Production, Preview, Development |

**Important:** Use `http://localhost:3000` for FRONTEND_URL since frontend runs locally!

## 📋 Step 2: Deploy Backend

```bash
cd /Users/int/Documents/GitHub/Authentix-backend
vercel --prod
```

After deployment, Vercel will give you a URL like:
```
https://authentix-backend.vercel.app
```

Your API will be at:
```
https://authentix-backend.vercel.app/api/v1
```

## 📋 Step 3: Update Frontend `.env.local`

Update `/Users/int/Documents/GitHub/MineCertificate/.env.local`:

```env
# Frontend Environment Variables

# Supabase (for client-side auth)
NEXT_PUBLIC_SUPABASE_URL=https://brkyyeropjslfzwnhxcw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya3l5ZXJvcGpzbGZ6d25oeGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNTI3MTYsImV4cCI6MjA3OTgyODcxNn0.vyC8v8RFnQ8xIB4Iz8LotE3WZP1Cykf1Uxm6yfB49dk

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Backend API URL - REPLACE WITH YOUR VERCEL BACKEND URL
NEXT_PUBLIC_API_URL=https://your-backend.vercel.app/api/v1
```

**Replace `https://your-backend.vercel.app` with your actual Vercel backend URL!**

## 📋 Step 4: Run Frontend Locally

```bash
cd /Users/int/Documents/GitHub/MineCertificate
npm run dev
```

Frontend will run on `http://localhost:3000` and make API calls to your Vercel backend.

## ✅ Test the Setup

1. **Test Backend:**
   ```bash
   curl https://your-backend.vercel.app/health
   ```
   Should return: `{"status":"ok"}`

2. **Test Frontend:**
   - Open `http://localhost:3000`
   - Try logging in
   - Check browser console (Network tab) - you should see API calls to your Vercel backend

## 🔒 CORS Configuration

The backend is configured to accept requests from:
- ✅ `http://localhost:3000`
- ✅ `http://localhost:3001`
- ✅ `http://127.0.0.1:3000`
- ✅ `http://127.0.0.1:3001`

No CORS errors should occur when frontend runs locally.

## 🚨 Troubleshooting

### CORS Errors
- Make sure `FRONTEND_URL` in Vercel is set to `http://localhost:3000`
- Check that frontend is running on port 3000

### API Connection Errors
- Verify `NEXT_PUBLIC_API_URL` in frontend `.env.local` points to correct backend URL
- Check backend is accessible: `curl https://your-backend.vercel.app/health`

### Authentication Issues
- Make sure Supabase credentials are correct in frontend `.env.local`
- Check browser Network tab to see if API requests include Authorization header

## 📚 More Information

- See `LOCAL_FRONTEND_SETUP.md` for detailed setup guide
- See `VERCEL_ENV_VARIABLES.md` for complete environment variables reference
