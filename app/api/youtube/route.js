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

  const { yt_refresh_token, channel_id } = data;
  if (!yt_refresh_token) throw new Error('YouTube connect nahi hai — Settings mein Connect YouTube dabao');

  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Server config error: YouTube credentials missing');

  return { clientId, clientSecret, refreshToken: yt_refresh_token, channelId: channel_id };
}

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

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get('videoId');

    const { clientId, clientSecret, refreshToken } = await getUserCredentials();
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    // ── Single video ──
    if (videoId) {
      const res  = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(`YouTube API error: ${JSON.stringify(data?.error || data)}`);

      const video = data.items?.[0];
      if (!video) return Response.json({ error: 'Video nahi mila' }, { status: 404 });

      return Response.json({
        videoId:   video.id,
        title:     video.snippet?.title || '',
        thumbnail: video.snippet?.thumbnails?.medium?.url || '',
        tags:      video.snippet?.tags || [],
        viewCount: video.statistics?.viewCount || 0,
        likeCount: video.statistics?.likeCount || 0,
        categoryId: video.snippet?.categoryId || '10',
      });
    }

    // ── Latest 5 videos ──
    const channelRes  = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const channelData = await channelRes.json();
    if (!channelRes.ok) throw new Error(`Channel fetch error: ${JSON.stringify(channelData?.error)}`);

    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    const channelTitle      = channelData.items?.[0]?.snippet?.title || 'My Channel';
    if (!uploadsPlaylistId) throw new Error('Uploads playlist nahi mila');

    const playlistRes  = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const playlistData = await playlistRes.json();
    if (!playlistRes.ok) throw new Error(`Playlist error: ${JSON.stringify(playlistData?.error)}`);

    const videoIds = playlistData.items
      ?.map(i => i.contentDetails?.videoId).filter(Boolean).join(',');

    if (!videoIds) return Response.json({ videos: [], channelTitle });

    const videosRes  = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const videosData = await videosRes.json();
    if (!videosRes.ok) throw new Error(`Videos error: ${JSON.stringify(videosData?.error)}`);

    const videos = videosData.items?.map(v => ({
      videoId:   v.id,
      title:     v.snippet?.title || '',
      thumbnail: v.snippet?.thumbnails?.medium?.url || '',
      tags:      v.snippet?.tags || [],
      viewCount: v.statistics?.viewCount || 0,
      likeCount: v.statistics?.likeCount || 0,
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

    const updateRes  = await fetch(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet',
      {
        method:  'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: videoId, snippet: { ...currentSnippet, tags: tagsArray } }),
      }
    );
    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      throw new Error(updateData?.error?.message || 'YouTube update fail');
    }

    return Response.json({ success: true, tagsUpdated: updateData.snippet?.tags?.length || 0 });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
