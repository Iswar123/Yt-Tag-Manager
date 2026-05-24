// app/api/youtube/route.js
export const revalidate = 0;

import { createClient } from '@/lib/supabase/server';
import { addQuotaUnits } from '@/lib/quota';

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

  if (!keys || keys.length === 0) return null;

  const key = keys[0];

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

// ── Fetch helpers ─────────────────────────────────────────────────
async function ytFetchOAuth(url, accessToken) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function ytFetchApiKey(url, apiKey) {
  return fetch(`${url}${url.includes('?') ? '&' : '?'}key=${apiKey}`);
}

async function ytFetchSmart(url, accessToken, apiKey) {
  if (apiKey) {
    const res = await ytFetchApiKey(url, apiKey);
    if (res.status === 403) {
      const data = await res.json();
      const reason = data?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'keyInvalid' || reason === 'CONSUMER_INVALID') {
        return { res: await ytFetchOAuth(url, accessToken), exhausted: true, data: null, usedOAuth: true };
      }
      return { res, exhausted: false, data, usedOAuth: false };
    }
    return { res, exhausted: false, data: null, usedOAuth: false };
  }
  return { res: await ytFetchOAuth(url, accessToken), exhausted: false, data: null, usedOAuth: true };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');

    const { clientId, clientSecret, refreshToken, channelId, userId, supabase } = await getUserCredentials();
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
    const apiKey = await getRotatedApiKey(supabase, userId);

    // ── Single video fetch ────────────────────────────────────────
    if (videoId) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`;
      let { res, exhausted, data, usedOAuth } = await ytFetchSmart(url, accessToken, apiKey);

      if (exhausted && apiKey) {
        await markKeyExhausted(supabase, userId, apiKey);
        const nextKey = await getRotatedApiKey(supabase, userId);
        const fallback = await ytFetchSmart(url, accessToken, nextKey);
        res      = fallback.res;
        data     = fallback.data;
        usedOAuth = fallback.usedOAuth;
      }

      if (!data) data = await res.json();
      if (!res.ok) throw new Error(`YouTube API error: ${JSON.stringify(data?.error || data)}`);

      const video = data.items?.[0];
      if (!video) return Response.json({ error: 'Video nahi mila' }, { status: 404 });

      // Track quota — +1 only if OAuth was used
      if (usedOAuth) await addQuotaUnits(supabase, userId, 1);

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

    // ── Channel info + recent videos ─────────────────────────────
    let chData;
    let channelUsedOAuth = false;

    if (channelId && apiKey) {
      const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet,statistics&id=${channelId}`;
      let { res, exhausted, data, usedOAuth } = await ytFetchSmart(url, accessToken, apiKey);
      if (exhausted && apiKey) {
        await markKeyExhausted(supabase, userId, apiKey);
        const nextKey = await getRotatedApiKey(supabase, userId);
        const fallback = await ytFetchSmart(url, accessToken, nextKey);
        res      = fallback.res;
        data     = fallback.data;
        usedOAuth = fallback.usedOAuth;
      }
      if (!data) data = await res.json();
      if (res.ok) {
        chData = data;
        channelUsedOAuth = usedOAuth;
      }
    }

    if (!chData) {
      // Fallback: OAuth mine=true
      const url = 'https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet,statistics&mine=true';
      const res  = await ytFetchOAuth(url, accessToken);
      chData = await res.json();
      if (!res.ok) throw new Error(`Channel fetch error: ${JSON.stringify(chData?.error)}`);
      channelUsedOAuth = true;
    }

    const channelItem     = chData.items?.[0];
    if (!channelItem) throw new Error('Channel nahi mila');

    const uploadsId        = channelItem.contentDetails?.relatedPlaylists?.uploads;
    const channelTitle     = channelItem.snippet?.title || 'My Channel';
    const channelAvatar    = channelItem.snippet?.thumbnails?.medium?.url
                          || channelItem.snippet?.thumbnails?.high?.url
                          || channelItem.snippet?.thumbnails?.default?.url
                          || '';
    const subscriberCount  = channelItem.statistics?.subscriberCount || '0';
    const subscriberHidden = channelItem.statistics?.hiddenSubscriberCount || false;

    if (!uploadsId) {
      // Only count channel call
      if (channelUsedOAuth) await addQuotaUnits(supabase, userId, 1);
      return Response.json({ videos: [], channelTitle, channelAvatar, subscriberCount, subscriberHidden });
    }

    // Recent 5 videos — playlist fetch
    const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=5`;
    const { res: plRes, data: plDataRaw, usedOAuth: plUsedOAuth } = await ytFetchSmart(plUrl, accessToken, apiKey);
    const plData = plDataRaw || await plRes.json();
    if (!plRes.ok) throw new Error(`Playlist error: ${JSON.stringify(plData?.error)}`);

    const videoIds = plData.items?.map(i => i.contentDetails?.videoId).filter(Boolean).join(',');
    if (!videoIds) {
      if (channelUsedOAuth) await addQuotaUnits(supabase, userId, 1);
      if (plUsedOAuth)      await addQuotaUnits(supabase, userId, 1);
      return Response.json({ videos: [], channelTitle, channelAvatar, subscriberCount, subscriberHidden });
    }

    // Videos detail fetch
    const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`;
    const { res: vRes, data: vDataRaw, usedOAuth: vUsedOAuth } = await ytFetchSmart(vUrl, accessToken, apiKey);
    const vData = vDataRaw || await vRes.json();
    if (!vRes.ok) throw new Error(`Videos error: ${JSON.stringify(vData?.error)}`);

    // Track all OAuth calls made during channel load
    let totalOAuthUnits = 0;
    if (channelUsedOAuth) totalOAuthUnits += 1;
    if (plUsedOAuth)      totalOAuthUnits += 1;
    if (vUsedOAuth)       totalOAuthUnits += 1;
    if (totalOAuthUnits > 0) await addQuotaUnits(supabase, userId, totalOAuthUnits);

    const videos = vData.items?.map(v => ({
      videoId:    v.id,
      title:      v.snippet?.title || '',
      thumbnail:  v.snippet?.thumbnails?.medium?.url || '',
      tags:       v.snippet?.tags || [],
      viewCount:  v.statistics?.viewCount || 0,
      likeCount:  v.statistics?.likeCount || 0,
      categoryId: v.snippet?.categoryId || '10',
    })) || [];

    return Response.json({ videos, channelTitle, channelAvatar, subscriberCount, subscriberHidden });

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

    const { clientId, clientSecret, refreshToken, userId, supabase } = await getUserCredentials();
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    // Snippet fetch — OAuth only (+1)
    const fetchRes  = await ytFetchOAuth(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
      accessToken
    );
    const fetchData = await fetchRes.json();
    if (!fetchRes.ok) throw new Error(`Snippet fetch error: ${JSON.stringify(fetchData?.error)}`);

    const currentSnippet = fetchData.items?.[0]?.snippet;
    if (!currentSnippet) return Response.json({ error: 'Video nahi mila' }, { status: 404 });

    // Tags update — OAuth (+50)
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

    await new Promise(r => setTimeout(r, 1500));

    // Verify — OAuth (+1)
    const verifyRes  = await ytFetchOAuth(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
      accessToken
    );
    const verifyData = await verifyRes.json();
    const updatedTags = verifyData.items?.[0]?.snippet?.tags || [];
    const firstNewTag = tagsArray[0]?.toLowerCase();
    const verified = updatedTags.some(t => t.toLowerCase() === firstNewTag);

    if (!verified) {
      throw new Error('Tags YouTube pe save nahi hue — Settings mein YouTube Re-connect karo (new permissions needed)');
    }

    // Track: fetch(1) + update(50) + verify(1) = 52 units — all OAuth
    await addQuotaUnits(supabase, userId, 52);

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
        user_id:   user.id,
        api_key,
        label:     label || `Key ${Date.now()}`,
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
