// app/api/auth/yt-callback/route.js
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) return NextResponse.redirect(`${origin}/settings?yt_error=${encodeURIComponent(error)}`);
  if (!code)  return NextResponse.redirect(`${origin}/settings?yt_error=no_code`);

  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.redirect(`${origin}/login`);

    const clientId     = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return NextResponse.redirect(`${origin}/settings?yt_error=env_missing`);

    // Step 1: Code → Tokens
    const tokenRes  = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  `${origin}/api/auth/yt-callback`,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error)          return NextResponse.redirect(`${origin}/settings?yt_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    if (!tokenData.refresh_token) return NextResponse.redirect(`${origin}/settings?yt_error=no_refresh_token`);

    // Step 2: Is Gmail se saare channels fetch karo
    let channels = [];
    try {
      const chRes  = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const chData = await chRes.json();
      channels = (chData.items || []).map(ch => ({
        channel_id: ch.id,
        title:      ch.snippet?.title || '',
        avatar_url: ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url || '',
      }));
    } catch (_) {}

    const firstChannelId = channels[0]?.channel_id || null;

    // Step 3: Token save karo user_credentials mein
    await supabase
      .from('user_credentials')
      .upsert({
        user_id:          user.id,
        yt_refresh_token: tokenData.refresh_token,
        channel_id:       firstChannelId,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' });

    // Step 4: user_channels mein saare channels save karo
    // Pehle existing channels delete karo
    await supabase.from('user_channels').delete().eq('user_id', user.id);

    if (channels.length > 0) {
      const rows = channels.map((ch, i) => ({
        user_id:    user.id,
        channel_id: ch.channel_id,
        title:      ch.title,
        avatar_url: ch.avatar_url,
        is_active:  i === 0, // pehla channel default active
      }));
      await supabase.from('user_channels').insert(rows);
    }

    return NextResponse.redirect(`${origin}/settings?yt_connected=true`);

  } catch (e) {
    return NextResponse.redirect(`${origin}/settings?yt_error=${encodeURIComponent(e.message)}`);
  }
}
