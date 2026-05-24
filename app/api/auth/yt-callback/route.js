// app/api/auth/yt-callback/route.js
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) return NextResponse.redirect(`${origin}/dashboard?yt_error=${encodeURIComponent(error)}`);
  if (!code)  return NextResponse.redirect(`${origin}/dashboard?yt_error=no_code`);

  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.redirect(`${origin}/login`);

    const clientId     = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return NextResponse.redirect(`${origin}/dashboard?yt_error=env_missing`);

    // Step 1: Code → Tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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

    if (tokenData.error)          return NextResponse.redirect(`${origin}/dashboard?yt_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
    if (!tokenData.refresh_token) return NextResponse.redirect(`${origin}/dashboard?yt_error=no_refresh_token`);

    // Step 2: Is account ke channels fetch karo
    let newChannels = [];
    try {
      const chRes  = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50',
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const chData = await chRes.json();
      newChannels = (chData.items || []).map(ch => ({
        channel_id: ch.id,
        title:      ch.snippet?.title || '',
        avatar_url: ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url || '',
      }));
    } catch (_) {}

    // Step 3: Token save — latest refresh_token store karo
    // channel_id = pehla naya channel (active hoga)
    const firstNewChannelId = newChannels[0]?.channel_id || null;
    await supabase
      .from('user_credentials')
      .upsert({
        user_id:          user.id,
        yt_refresh_token: tokenData.refresh_token,
        channel_id:       firstNewChannelId,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' });

    // Step 4: Existing channels fetch karo — MERGE karo, delete mat karo
    const { data: existingChannels } = await supabase
      .from('user_channels')
      .select('channel_id')
      .eq('user_id', user.id);

    const existingIds = new Set((existingChannels || []).map(c => c.channel_id));

    // Pehle sab is_active = false karo
    await supabase
      .from('user_channels')
      .update({ is_active: false })
      .eq('user_id', user.id);

    // Naye channels insert karo (jo pehle se hain unhe skip karo)
    const toInsert = newChannels.filter(ch => !existingIds.has(ch.channel_id));
    if (toInsert.length > 0) {
      const rows = toInsert.map(ch => ({
        user_id:    user.id,
        channel_id: ch.channel_id,
        title:      ch.title,
        avatar_url: ch.avatar_url,
        is_active:  false,
      }));
      await supabase.from('user_channels').insert(rows);
    }

    // Naye connected channel ko active mark karo
    if (firstNewChannelId) {
      await supabase
        .from('user_channels')
        .update({ is_active: true })
        .eq('user_id', user.id)
        .eq('channel_id', firstNewChannelId);
    }

    return NextResponse.redirect(`${origin}/dashboard?yt_connected=true`);

  } catch (e) {
    return NextResponse.redirect(`${origin}/dashboard?yt_error=${encodeURIComponent(e.message)}`);
  }
}
