# 🎬 Iswar — YouTube Helper

Multi-user YouTube Tag Manager with AI tag generation.

## Setup Steps

### 1. Supabase Setup
- supabase.com pe naya project banao
- SQL Editor mein `supabase-schema.sql` run karo
- Authentication → Providers → Google → Enable
- Google Cloud Console se OAuth Client ID + Secret lo → Supabase mein dalo
- Redirect URL: `https://your-project.supabase.co/auth/v1/callback`

### 2. .env.local fill karo
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
```

### 3. Install + Run
```bash
npm install
npm run dev
```

### 4. Vercel Deploy
- Vercel pe import karo
- Environment variables add karo
- Deploy!

## User Flow
1. Google se login
2. Settings → YouTube OAuth credentials + AI key dalo
3. Dashboard → videos fetch → AI tags generate → YouTube update!

## Per-User Settings
Har user apna dalega:
- YouTube Client ID + Secret + Refresh Token
- Channel ID (optional)
- AI Provider: OpenRouter ya Groq
- AI API Key
