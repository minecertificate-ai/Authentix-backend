# Local Frontend + Vercel Backend Setup

## Architecture

- **Backend**: Deployed on Vercel (`https://your-backend.vercel.app`)
- **Frontend**: Runs locally on `http://localhost:3000`

## Step 1: Deploy Backend to Vercel

Follow the deployment guide, but use these environment variables:

### Vercel Environment Variables

| Variable Name | Value | Environment |
|--------------|-------|-------------|
| `SUPABASE_URL` | `https://brkyyeropjslfzwnhxcw.supabase.co` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `your-service-role-key` | All |
| `FRONTEND_URL` | `http://localhost:3000` | All |
| `APP_URL` | `http://localhost:3000` | All |
| `LOG_LEVEL` | `info` | All |

**Important:** Use `http://localhost:3000` for FRONTEND_URL since frontend runs locally.

## Step 2: Get Your Backend URL

After deploying, Vercel will give you a URL like:
```
https://authentix-backend.vercel.app
```

Your API will be available at:
```
https://authentix-backend.vercel.app/api/v1
```

## Step 3: Update Frontend `.env.local`

Update your frontend `.env.local` to point to the deployed backend:

```env
# Frontend Environment Variables

# ============================================
# SUPABASE CONFIGURATION (Client-side)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://brkyyeropjslfzwnhxcw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# ============================================
# APP CONFIGURATION
# ============================================
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ============================================
# BACKEND API CONFIGURATION
# ============================================
# Point to your deployed backend on Vercel
NEXT_PUBLIC_API_URL=https://your-backend.vercel.app/api/v1
```

**Replace `https://your-backend.vercel.app` with your actual Vercel backend URL!**

## Step 4: Run Frontend Locally

```bash
cd /Users/int/Documents/GitHub/MineCertificate
npm run dev
```

Frontend will run on `http://localhost:3000` and make API calls to your Vercel backend.

## Step 5: Test the Setup

1. **Backend Health Check:**
   ```bash
   curl https://your-backend.vercel.app/health
   ```
   Should return: `{"status":"ok"}`

2. **Frontend Test:**
   - Open `http://localhost:3000`
   - Try logging in
   - Check browser console for API calls to your Vercel backend

## CORS Configuration

The backend is configured to accept requests from:
- `http://localhost:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:3001`
- The value set in `FRONTEND_URL` environment variable

## Troubleshooting

### CORS Errors

If you see CORS errors:
1. Check that `FRONTEND_URL` in Vercel is set to `http://localhost:3000`
2. Make sure frontend is running on port 3000
3. Check browser console for exact error message

### API Connection Errors

1. Verify `NEXT_PUBLIC_API_URL` in frontend `.env.local` points to correct backend URL
2. Check backend is deployed and accessible:
   ```bash
   curl https://your-backend.vercel.app/health
   ```
3. Check Vercel deployment logs for errors

### Authentication Issues

1. Make sure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly
2. Check that Supabase project is accessible
3. Verify JWT tokens are being sent in API requests (check browser Network tab)

## Development Workflow

1. **Backend Changes:**
   - Make changes in `/Users/int/Documents/GitHub/Authentix-backend`
   - Commit and push to trigger Vercel deployment
   - Or run `vercel --prod` to deploy manually

2. **Frontend Changes:**
   - Make changes in `/Users/int/Documents/GitHub/MineCertificate`
   - Restart local dev server: `npm run dev`
   - Changes are instant (hot reload)

## Benefits of This Setup

✅ **Fast Frontend Development**: No deployment needed for frontend changes  
✅ **Backend Stability**: Backend runs on Vercel with proper scaling  
✅ **Cost Effective**: Only backend uses Vercel resources  
✅ **Easy Testing**: Test frontend changes instantly without deployment  
✅ **Production-like Backend**: Backend runs in production environment  

## Production Deployment (Future)

When ready to deploy frontend:
1. Deploy frontend to Vercel or another hosting service
2. Update `FRONTEND_URL` in backend Vercel environment variables to production URL
3. Update `NEXT_PUBLIC_API_URL` in frontend to point to backend
4. Redeploy both
