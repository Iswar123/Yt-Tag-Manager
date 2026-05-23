// app/api/youtube/route.js
export const revalidate = 0;

import { createClient } from '@/lib/supabase/server';

async function getUserCredentials() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Login karo pehle');

  const { data, error } = await supabase
    .from('user_credentials')
    .select('yt_refresh_token, channel_id')
    .eq('user_id', user.id)
    .single();

  if (error || !data) throw new Error('Pehle YouTube connect karo Settings mein');
  if (!data.yt_refresh_token) throw new Error('YouTube connect nahi hai — Settings mein Connect YouTube dabao');

  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Server config error: YouTube credentials missing');

  return { clientId, clientSecret, refreshToken: data.yt_refresh_token, channelId: data.channel_id, userId: user.id, supabase };
}

// ── API Key Rotation ──────────────────────────────────────────────
async function getRotatedApiKey(supabase, userId) {
  const { data: keys } = await supabase
    .from('yt_api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('last_used_at', { ascending: true, nullsFirst: true });

  if (!keys || keys.length === 0) return null; // No keys — OAuth only mode

  // Pick least recently used key
  const key = keys[0];

  // Update last_used_at
  await supabase
    .from('yt_api_keys')
    .update({ last_used_at: new Date().toISOString(), use_count: (key.use_count || 0) + 1 })
    .eq('id', key.id);

  return key.api_key;
}

async function markKeyExhausted(supabase, userId, apiKey) {
  await supabase
    .from('yt_api_keys')
    .update({ is_active: false, exhausted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('api_key', apiKey);
}

// ── Token Exchange ────────────────────────────────────────────────
async function getAccessToken(clientId, clientSecret, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Fetch with API key fallback ───────────────────────────────────
async function ytFetch(url, accessToken, apiKey) {
  // Try with OAuth token first
  const res = await fetch(apiKey ? `${url}&key=${apiKey}` : url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');

    const { clientId, clientSecret, refreshToken, userId, supabase } = await getUserCredentials();
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
    const apiKey = await getRotatedApiKey(supabase, userId);

    // ── Single video ──
    if (videoId) {
      let res = await ytFetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
        accessToken, apiKey
      );
      let data = await res.json();

      // If quota exceeded, mark key exhausted and try next
      if (!res.ok && data?.error?.errors?.[0]?.reason === 'quotaExceeded' && apiKey) {
        await markKeyExhausted(supabase, userId, apiKey);
        const nextKey = await getRotatedApiKey(supabase, userId);
        res  = await ytFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`, accessToken, nextKey);
        data = await res.json();
      }

      if (!res.ok) throw new Error(`YouTube API error: ${JSON.stringify(data?.error || data)}`);

      const video = data.items?.[0];
      if (!video) return Response.json({ error: 'Video nahi mila' }, { status: 404 });

      return Response.json({
        videoId:    video.id,
        title:      video.snippet?.title || '',
        thumbnail:  video.snippet?.thumbnails?.medium?.url || '',
        tags:       video.snippet?.tags || [],
        viewCount:  video.statistics?.viewCount || 0,
        likeCount:  video.statistics?.likeCount || 0,
        categoryId: video.snippet?.categoryId || '10',
      });
    }

    // ── Channel videos (latest 5) ──
    let chRes  = await ytFetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true', accessToken, apiKey);
    let chData = await chRes.json();

    if (!chRes.ok && chData?.error?.errors?.[0]?.reason === 'quotaExceeded' && apiKey) {
      await markKeyExhausted(supabase, userId, apiKey);
      const nextKey = await getRotatedApiKey(supabase, userId);
      chRes  = await ytFetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true', accessToken, nextKey);
      chData = await chRes.json();
    }
    if (!chRes.ok) throw new Error(`Channel fetch error: ${JSON.stringify(chData?.error)}`);

    const uploadsId    = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    const channelTitle = chData.items?.[0]?.snippet?.title || 'My Channel';
    if (!uploadsId) throw new Error('Uploads playlist nahi mila');

    const plRes  = await ytFetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=5`, accessToken, apiKey);
    const plData = await plRes.json();
    if (!plRes.ok) throw new Error(`Playlist error: ${JSON.stringify(plData?.error)}`);

    const videoIds = plData.items?.map(i => i.contentDetails?.videoId).filter(Boolean).join(',');
    if (!videoIds) return Response.json({ videos: [], channelTitle });

    const vRes  = await ytFetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`, accessToken, apiKey);
    const vData = await vRes.json();
    if (!vRes.ok) throw new Error(`Videos error: ${JSON.stringify(vData?.error)}`);

    const videos = vData.items?.map(v => ({
      videoId:    v.id,
      title:      v.snippet?.title || '',
      thumbnail:  v.snippet?.thumbnails?.medium?.url || '',
      tags:       v.snippet?.tags || [],
      viewCount:  v.statistics?.viewCount || 0,
      likeCount:  v.statistics?.likeCount || 0,
      categoryId: v.snippet?.categoryId || '10',
    })) || [];

    return Response.json({ videos, channelTitle });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const { videoId, tags } = await req.json();
    if (!videoId) return Response.json({ error: 'videoId required' }, { status: 400 });
    if (!tags)    return Response.json({ error: 'tags required' },    { status: 400 });

    const tagsArray = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : tags;

    const { clientId, clientSecret, refreshToken } = await getUserCredentials();
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    const fetchRes  = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const fetchData = await fetchRes.json();
    if (!fetchRes.ok) throw new Error(`Snippet fetch error: ${JSON.stringify(fetchData?.error)}`);

    const currentSnippet = fetchData.items?.[0]?.snippet;
    if (!currentSnippet) return Response.json({ error: 'Video nahi mila' }, { status: 404 });

    const updateRes = await fetch(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet',
      {
        method:  'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: videoId,
          snippet: {
            title:           currentSnippet.title,
            description:     currentSnippet.description,
            categoryId:      currentSnippet.categoryId,
            defaultLanguage: currentSnippet.defaultLanguage,
            tags:            tagsArray,
          },
        }),
      }
    );
    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      throw new Error(updateData?.error?.message || JSON.stringify(updateData?.error) || 'YouTube update fail');
    }

    // Verify tags actually saved
    await new Promise(r => setTimeout(r, 1500));
    const verifyRes  = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const verifyData = await verifyRes.json();
    const updatedTags = verifyData.items?.[0]?.snippet?.tags || [];
    const firstNewTag = tagsArray[0]?.toLowerCase();
    const verified = updatedTags.some(t => t.toLowerCase() === firstNewTag);

    if (!verified) {
      throw new Error('Tags YouTube pe save nahi hue — Settings mein YouTube Re-connect karo (new permissions needed)');
    }

    return Response.json({ success: true, tagsUpdated: updatedTags.length });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ── API Keys CRUD ─────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { action, api_key, key_id, label } = await req.json();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Login karo' }, { status: 401 });

    if (action === 'add') {
      if (!api_key) return Response.json({ error: 'API key required' }, { status: 400 });
      const { error } = await supabase.from('yt_api_keys').insert({
        user_id:  user.id,
        api_key,
        label:    label || `Key ${Date.now()}`,
        is_active: true,
      });
      if (error) throw new Error(error.message);
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      await supabase.from('yt_api_keys').delete().eq('id', key_id).eq('user_id', user.id);
      return Response.json({ success: true });
    }

    if (action === 'reactivate') {
      await supabase.from('yt_api_keys').update({ is_active: true, exhausted_at: null }).eq('id', key_id).eq('user_id', user.id);
      return Response.json({ success: true });
    }

    if (action === 'list') {
      const { data } = await supabase.from('yt_api_keys').select('id, label, is_active, use_count, last_used_at, exhausted_at').eq('user_id', user.id).order('created_at');
      return Response.json({ keys: data || [] });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
