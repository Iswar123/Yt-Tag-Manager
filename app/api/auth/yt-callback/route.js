// app/api/auth/yt-callback/route.js
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${origin}/settings?yt_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/settings?yt_error=no_code`);
  }

  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(`${origin}/login`);
    }

    // Client ID + Secret env se aata hai — Supabase se nahi lena
    const clientId     = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${origin}/settings?yt_error=env_missing`);
    }

    const redirectUri = `${origin}/api/auth/yt-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.redirect(`${origin}/settings?yt_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    }

    if (!tokenData.refresh_token) {
      return NextResponse.redirect(`${origin}/settings?yt_error=no_refresh_token`);
    }

    // Sirf refresh_token save karo — client_id/secret env mein hain
    await supabase
      .from('user_credentials')
      .upsert({
        user_id:          user.id,
        yt_refresh_token: tokenData.refresh_token,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' });

    return NextResponse.redirect(`${origin}/settings?yt_connected=true`);

  } catch (e) {
    return NextResponse.redirect(`${origin}/settings?yt_error=${encodeURIComponent(e.message)}`);
  }
}
