// app/dashboard/page.js
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

async function aiCall(prompt, provider, apiKey) {
  const model = provider === 'groq' ? 'llama3-8b-8192' : 'openai/gpt-4o-mini';
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider, api_key: apiKey, model,
      max_tokens: 1200, temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI call failed (${res.status})`);
  }
  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'AI error');
  return (data.choices?.[0]?.message?.content || '').trim();
}

function extractVideoId(input) {
  const match = input.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : input.trim();
}

export default function DashboardPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [user,         setUser]         = useState(null);
  const [creds,        setCreds]        = useState(null);
  const [credsLoading, setCredsLoading] = useState(true);

  const [videos,       setVideos]       = useState([]);
  const [channelTitle, setChannelTitle] = useState('My Channel');
  const [channelAvatar, setChannelAvatar] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [loadError,    setLoadError]    = useState(null);

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [tags,          setTags]          = useState('');
  const [saving,        setSaving]        = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [status,        setStatus]        = useState('idle');

  const [customId,      setCustomId]      = useState('');
  const [fetchingCustom, setFetchingCustom] = useState(false);
  const [showCustom,    setShowCustom]    = useState(false);

  const [toast, setToast] = useState({ msg: '', type: 'info' });

  const tagList  = tags.split(',').map(t => t.trim()).filter(Boolean);
  const tagCount = tagList.length;
  const isDirty  = selectedVideo && tags !== (selectedVideo.tags || []).join(', ');

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 3500);
  }

  useEffect(() => { init(); }, []);

  async function init() {
    setCredsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUser(user);

    const { data } = await supabase
      .from('user_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!data || !data.yt_client_id || !data.yt_refresh_token || !data.ai_api_key) {
      setCreds(null);
      setCredsLoading(false);
      return;
    }

    setCreds(data);
    setCredsLoading(false);
    loadVideos();
  }

  async function loadVideos() {
    setLoading(true);
    setLoadError(null);
    try {
      const res  = await fetch('/api/youtube');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Fetch fail');
      setVideos(data.videos || []);
      setChannelTitle(data.channelTitle || 'My Channel');
      setChannelAvatar(data.channelAvatar || '');
    } catch (e) {
      setLoadError(e.message);
      showToast('❌ ' + e.message, 'error');
    }
    setLoading(false);
  }

  function selectVideo(video) {
    setSelectedVideo(video);
    setTags((video.tags || []).join(', '));
    setStatus('idle');
  }

  async function handleCustomFetch() {
    const id = extractVideoId(customId);
    if (!id) { showToast('⚠️ Video ID daalo!', 'warn'); return; }
    setFetchingCustom(true);
    try {
      const res  = await fetch(`/api/youtube?videoId=${id}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Fetch fail');
      selectVideo(data);
      setShowCustom(false);
      setCustomId('');
      showToast('✅ Video fetch ho gaya!', 'success');
    } catch (e) {
      showToast('❌ ' + e.message, 'error');
    }
    setFetchingCustom(false);
  }

  async function generateTags() {
    if (!selectedVideo) return;
    if (!creds?.ai_api_key) { showToast('❌ AI key settings mein add karo!', 'error'); return; }
    setGenerating(true);
    try {
      const text = await aiCall(
        `You are a YouTube SEO expert.\n\nVideo title: "${selectedVideo.title}"\nChannel: "${channelTitle}"\nCurrent tags: ${(selectedVideo.tags || []).join(', ') || 'none'}\nViews: ${selectedVideo.viewCount} | Likes: ${selectedVideo.likeCount}\n\nGenerate exactly 16 viral SEO YouTube tags for this video.\nRULES:\n- Mix of relevant language keywords based on video title\n- Include topic-specific tags, general category tags\n- Each tag max 3-4 words\n- Comma separated list\n- No # symbol, no quotes\n- Focus on high-search-volume keywords\nReturn ONLY the comma-separated tags, nothing else.`,
        creds.ai_provider || 'openrouter',
        creds.ai_api_key
      );
      setTags(text.trim());
      showToast('🤖 AI tags ready! Check karo phir update karo.', 'success');
    } catch (e) {
      showToast('❌ ' + e.message, 'error');
    }
    setGenerating(false);
  }

  async function handleUpdate() {
    if (!selectedVideo) { showToast('⚠️ Pehle video select karo!', 'warn'); return; }
    if (!tags.trim())   { showToast('⚠️ Tags khaali nahi ho sakte!', 'warn'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/youtube', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: selectedVideo.videoId, tags }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Update fail');
      setStatus('saved');
      const updatedTags = tagList;
      setSelectedVideo(prev => ({ ...prev, tags: updatedTags }));
      setVideos(prev => prev.map(v =>
        v.videoId === selectedVideo.videoId ? { ...v, tags: updatedTags } : v
      ));
      showToast('✅ Tags YouTube pe update ho gaye!', 'success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      showToast('❌ ' + e.message, 'error');
      setTimeout(() => setStatus('idle'), 3000);
    }
    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const toastColors = {
    success: { bg: '#001a0a', border: '#00cc6633', color: '#00cc66' },
    error:   { bg: '#1a0000', border: '#ff444433', color: '#ff6666' },
    warn:    { bg: '#1a0e00', border: '#ffaa0033', color: '#ffaa00' },
    info:    { bg: '#0a0a0f', border: '#4488ff33', color: '#88aaff' },
  };
  const tc = toastColors[toast.type] || toastColors.info;

  // ── No credentials → Setup screen with proper topbar ──
  if (!credsLoading && !creds) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar — same as main dashboard */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #161616',
          padding: '0 16px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>
            <span style={{ fontSize: 15, fontWeight: 900, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.3px' }}>
              Tag Manager
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {user?.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #333' }} />
            )}
            <button onClick={handleLogout}
              style={{ background: 'transparent', border: '1px solid #222', color: '#555', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Logout
            </button>
          </div>
        </div>

        {/* Setup content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {/* Glow orb */}
          <div style={{ position: 'relative', marginBottom: 32 }}>
            <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, boxShadow: '0 0 60px rgba(255,140,0,0.25), 0 0 120px rgba(255,140,0,0.1)' }}>
              ⚙️
            </div>
          </div>

          <div style={{ textAlign: 'center', maxWidth: 300, marginBottom: 32 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#eee', letterSpacing: '-0.5px' }}>Setup Karo Pehle</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.8 }}>
              YouTube credentials aur AI key add karo Settings mein — ek baar set karo, phir tag manager use karo!
            </p>
          </div>

          {/* Steps */}
          <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {[
              { n: '1', icon: '🔑', label: 'Google Cloud Console', sub: 'OAuth 2.0 Client banao' },
              { n: '2', icon: '🤖', label: 'AI API Key', sub: 'Groq ya OpenRouter se' },
              { n: '3', icon: '🚀', label: 'Done!', sub: 'Tags generate karo AI se' },
            ].map(step => (
              <div key={step.n} style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, background: '#1a1a1a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{step.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc' }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>{step.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => router.push('/settings')}
            style={{ background: 'linear-gradient(135deg,#ff8c00,#ff4400)', border: 'none', color: '#fff', borderRadius: 14, padding: '14px 36px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,140,0,0.35)', letterSpacing: '0.3px' }}>
            ⚙️ Settings Kholao
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 12,
          padding: '10px 18px', fontSize: 13, color: tc.color, zIndex: 999,
          whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          fontWeight: 600,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #161616',
        padding: '0 16px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedVideo ? (
            <button onClick={() => { setSelectedVideo(null); setTags(''); setStatus('idle'); }}
              style={{ background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
              ← Back
            </button>
          ) : (
            <>
              <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>
              <span style={{ fontSize: 15, fontWeight: 900, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.3px' }}>
                Tag Manager
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!selectedVideo && (
            <button onClick={loadVideos} disabled={loading}
              style={{ background: '#141414', border: '1px solid #222', color: '#555', borderRadius: 8, width: 32, height: 32, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loading ? '·' : '🔄'}
            </button>
          )}
          <button onClick={() => router.push('/settings')}
            style={{ background: '#141414', border: '1px solid #222', color: '#555', borderRadius: 8, width: 32, height: 32, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ⚙️
          </button>
          {user?.user_metadata?.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #2a2a2a' }} />
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 32px', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Loading skeletons */}
        {(loading || credsLoading) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 12, padding: 12, display: 'flex', gap: 10 }}>
                <div style={{ width: 80, height: 45, background: '#1a1a1a', borderRadius: 8, flexShrink: 0, animation: 'pulse 1.5s ease infinite' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 10, background: '#1a1a1a', borderRadius: 4, marginBottom: 6, width: '80%' }} />
                  <div style={{ height: 8, background: '#1a1a1a', borderRadius: 4, width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {loadError && !loading && (
          <div style={{ background: '#100000', border: '1px solid #ff000022', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#ff4444', fontWeight: 800, marginBottom: 6 }}>❌ Load Error</div>
            <div style={{ fontSize: 11, color: '#cc3333', fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all' }}>{loadError}</div>
            <button onClick={loadVideos}
              style={{ marginTop: 12, background: '#1a0000', border: '1px solid #ff000044', color: '#ff4444', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔁 Retry
            </button>
          </div>
        )}

        {/* Video List */}
        {!loading && !credsLoading && !loadError && !selectedVideo && (
          <>
            {/* Channel header */}
            <div style={{ background: '#0c0c0c', border: '1px solid #1e1400', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {channelAvatar ? (
                  <img src={channelAvatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #ff8c0033' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#ff8c00,#ff4400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📺</div>
                )}
                <div>
                  <div style={{ fontSize: 13, color: '#ddd', fontWeight: 800 }}>{channelTitle}</div>
                  <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>Latest {videos.length} videos</div>
                </div>
              </div>
              <button onClick={() => setShowCustom(v => !v)}
                style={{ background: showCustom ? '#2a1500' : '#141414', border: `1px solid ${showCustom ? '#ff8c0055' : '#222'}`, color: showCustom ? '#ff8c00' : '#555', borderRadius: 8, padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                {showCustom ? '✕ Close' : '+ Custom'}
              </button>
            </div>

            {showCustom && (
              <div style={{ background: '#0c0c0c', border: '1px solid #2a1500', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 11, color: '#ff8c00', fontWeight: 700, marginBottom: 10 }}>📹 Custom Video ID / URL</div>
                <input
                  value={customId}
                  onChange={e => setCustomId(e.target.value)}
                  placeholder="Video ID ya YouTube URL..."
                  style={{ width: '100%', background: '#080808', border: '1px solid #222', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#eee', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8 }}
                />
                <button onClick={handleCustomFetch} disabled={fetchingCustom || !customId.trim()}
                  style={{ width: '100%', background: fetchingCustom ? '#111' : 'linear-gradient(135deg,#2a1000,#1a0500)', border: '1px solid #ff8c0033', color: fetchingCustom ? '#444' : '#ff8c00', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: fetchingCustom || !customId.trim() ? 'not-allowed' : 'pointer' }}>
                  {fetchingCustom ? '⏳ Fetching...' : '🔍 Fetch Karo'}
                </button>
              </div>
            )}

            {videos.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 48, color: '#2a2a2a', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                Koi video nahi mila
              </div>
            )}

            {videos.map(video => (
              <button key={video.videoId} onClick={() => selectVideo(video)}
                style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.2s' }}>
                {video.thumbnail && (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img src={video.thumbnail} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 8 }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d0d0d0', lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {video.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: '#ff8800' }}>👁 {Number(video.viewCount).toLocaleString()}</span>
                    <span style={{ fontSize: 9, color: '#44bb66' }}>👍 {video.likeCount}</span>
                    <span style={{ fontSize: 9, background: video.tags?.length >= 10 ? '#001a08' : '#1a0a00', color: video.tags?.length >= 10 ? '#44bb66' : '#ff8800', border: `1px solid ${video.tags?.length >= 10 ? '#44bb6622' : '#ff880022'}`, borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>
                      🏷 {video.tags?.length || 0}
                    </span>
                  </div>
                </div>
                <span style={{ color: '#2a2a2a', fontSize: 18, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </>
        )}

        {/* Tag Editor */}
        {!credsLoading && selectedVideo && (
          <>
            <div style={{ background: '#0c0c0c', border: '1px solid #1e1400', borderRadius: 14, overflow: 'hidden' }}>
              {selectedVideo.thumbnail && (
                <img src={selectedVideo.thumbnail} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} />
              )}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#eee', lineHeight: 1.5, marginBottom: 8 }}>{selectedVideo.title}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#ff8800' }}>👁 {Number(selectedVideo.viewCount).toLocaleString()}</span>
                  <span style={{ fontSize: 10, color: '#44bb66' }}>👍 {selectedVideo.likeCount}</span>
                  <span style={{ fontSize: 9, background: '#0a0f0a', color: '#44bb6688', border: '1px solid #44bb6622', borderRadius: 8, padding: '1px 7px', fontWeight: 700 }}>📺 {channelTitle}</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#0c0c0c', border: `1px solid ${isDirty ? '#ff8c0033' : '#1a1a1a'}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: '#ff8c00', fontWeight: 800, letterSpacing: '0.5px' }}>🏷️ TAGS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isDirty && <span style={{ fontSize: 9, background: 'rgba(255,140,0,0.1)', color: '#ff8c00', border: '1px solid #44220055', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>Unsaved</span>}
                  {status === 'saved' && <span style={{ fontSize: 9, background: 'rgba(68,187,102,0.1)', color: '#44bb66', border: '1px solid rgba(68,187,102,0.2)', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>✅ Updated</span>}
                  <span style={{ fontSize: 9, color: tagCount < 10 ? '#ffaa00' : '#44bb66', fontWeight: 700, background: tagCount < 10 ? 'rgba(255,170,0,0.08)' : 'rgba(68,187,102,0.08)', padding: '2px 7px', borderRadius: 12 }}>{tagCount}/16</span>
                </div>
              </div>

              <textarea
                value={tags}
                onChange={e => { setTags(e.target.value); setStatus('idle'); }}
                placeholder="tag1, tag2, tag3... (comma separated)"
                rows={4}
                style={{ width: '100%', background: '#080808', border: `1px solid ${isDirty ? '#ff8c0033' : '#1e1e1e'}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#eee', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, marginBottom: 10 }}
              />

              {tagList.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                  {tagList.map((t, i) => (
                    <span key={i} style={{ background: '#1a0e00', border: '1px solid #ff8c0022', color: '#ff8c0088', borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 600 }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {tagCount > 0 && tagCount < 10 && (
                <div style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid #ffaa0022', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ffaa00', marginBottom: 10 }}>
                  ⚠️ {tagCount} tags hain — 15-16 tags recommended hain SEO ke liye!
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={generateTags} disabled={generating}
                  style={{ flex: 1, background: generating ? '#0a0a0a' : 'linear-gradient(135deg,#120a22,#0a0014)', border: `1px solid ${generating ? '#222' : '#8855cc44'}`, color: generating ? '#444' : '#aa77ee', borderRadius: 10, padding: '12px', fontSize: 12, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                  {generating ? '⏳ Generating...' : '🤖 AI Generate'}
                </button>
                <button onClick={handleUpdate} disabled={saving || !isDirty}
                  style={{ flex: 1, background: saving ? '#0a0a0a' : isDirty ? 'linear-gradient(135deg,#2a1000,#1a0500)' : '#0a0a0a', border: `1px solid ${saving ? '#222' : isDirty ? '#ff8c0055' : '#1a1a1a'}`, color: saving ? '#444' : isDirty ? '#ff8c00' : '#333', borderRadius: 10, padding: '12px', fontSize: 12, fontWeight: 700, cursor: saving || !isDirty ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                  {saving ? '⏳ Updating...' : '🚀 Update'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
      `}</style>
    </div>
  );
}
