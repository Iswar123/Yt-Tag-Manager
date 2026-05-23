// app/dashboard/page.js
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// ── AI Call ──
async function aiCall(prompt, provider, apiKey) {
  const model = provider === 'groq' ? 'llama3-8b-8192' : 'openai/gpt-4o-mini';
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      api_key: apiKey,
      model,
      max_tokens: 1200,
      temperature: 0.7,
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

  const [toast, setToast] = useState('');

  const tagList  = tags.split(',').map(t => t.trim()).filter(Boolean);
  const tagCount = tagList.length;
  const isDirty  = selectedVideo && tags !== (selectedVideo.tags || []).join(', ');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
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
    } catch (e) {
      setLoadError(e.message);
      showToast('❌ ' + e.message);
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
    if (!id) { showToast('⚠️ Video ID daalo!'); return; }
    setFetchingCustom(true);
    try {
      const res  = await fetch(`/api/youtube?videoId=${id}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Fetch fail');
      selectVideo(data);
      setShowCustom(false);
      setCustomId('');
      showToast('✅ Video fetch ho gaya!');
    } catch (e) {
      showToast('❌ ' + e.message);
    }
    setFetchingCustom(false);
  }

  async function generateTags() {
    if (!selectedVideo) return;
    if (!creds?.ai_api_key) { showToast('❌ AI key settings mein add karo!'); return; }
    setGenerating(true);
    try {
      const text = await aiCall(
        `You are a YouTube SEO expert.

Video title: "${selectedVideo.title}"
Channel: "${channelTitle}"
Current tags: ${(selectedVideo.tags || []).join(', ') || 'none'}
Views: ${selectedVideo.viewCount} | Likes: ${selectedVideo.likeCount}

Generate exactly 16 viral SEO YouTube tags for this video.
RULES:
- Mix of relevant language keywords based on video title
- Include topic-specific tags, general category tags
- Each tag max 3-4 words
- Comma separated list
- No # symbol, no quotes
- Focus on high-search-volume keywords
Return ONLY the comma-separated tags, nothing else.`,
        creds.ai_provider || 'openrouter',
        creds.ai_api_key
      );
      setTags(text.trim());
      showToast('🤖 AI tags ready! Check karo phir update karo.');
    } catch (e) {
      showToast('❌ ' + e.message);
    }
    setGenerating(false);
  }

  async function handleUpdate() {
    if (!selectedVideo) { showToast('⚠️ Pehle video select karo!'); return; }
    if (!tags.trim())   { showToast('⚠️ Tags khaali nahi ho sakte!'); return; }
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
      showToast('✅ Tags YouTube pe update ho gaye!');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      showToast('❌ ' + e.message);
      setTimeout(() => setStatus('idle'), 3000);
    }
    setSaving(false);
  }

  // ── No credentials → Setup screen ──
  if (!credsLoading && !creds) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 900, color: '#eee' }}>Setup Karo Pehle</h2>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: '#555', lineHeight: 1.7 }}>
            Apne YouTube credentials aur AI API key add karo Settings mein — ek baar set karo, phir tag manager use karo!
          </p>
          <button onClick={() => router.push('/settings')}
            style={{ background: 'linear-gradient(135deg,#ff8c00,#ff4400)', border: 'none', color: '#fff', borderRadius: 14, padding: '13px 32px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,140,0,0.3)' }}>
            ⚙️ Settings Kholao
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
          padding: '10px 18px', fontSize: 13, color: '#eee', zIndex: 999,
          whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}

      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#080808', borderBottom: '1px solid #111',
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 900, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          🎬 Tag Manager
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedVideo && (
            <button onClick={() => { setSelectedVideo(null); setTags(''); setStatus('idle'); }}
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#888', borderRadius: 16, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ← Back
            </button>
          )}
          <button onClick={() => router.push('/settings')}
            style={{ background: '#1a1a1a', border: '1px solid #333', color: '#888', borderRadius: 16, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ⚙️
          </button>
          {!selectedVideo && (
            <button onClick={loadVideos} disabled={loading}
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#888', borderRadius: 16, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '...' : '🔄'}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Loading */}
        {(loading || credsLoading) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 12, padding: 12, display: 'flex', gap: 10 }}>
                <div style={{ width: 80, height: 45, background: '#1a1a1a', borderRadius: 8, flexShrink: 0 }} />
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
          <div style={{ background: '#1a0000', border: '1px solid #ff000033', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, color: '#ff4444', fontWeight: 700, marginBottom: 8 }}>❌ Error</div>
            <div style={{ fontSize: 11, color: '#cc3333', fontFamily: 'monospace', lineHeight: 1.6, wordBreak: 'break-all' }}>{loadError}</div>
            <button onClick={loadVideos}
              style={{ marginTop: 10, background: '#2a0000', border: '1px solid #ff000044', color: '#ff4444', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔁 Retry
            </button>
          </div>
        )}

        {/* Video List */}
        {!loading && !credsLoading && !loadError && !selectedVideo && (
          <>
            <div style={{ background: '#0f0f0f', border: '1px solid #2a1500', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: '#ff8c00', fontWeight: 700 }}>📺 {channelTitle}</div>
                <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>Latest 5 videos</div>
              </div>
              <button onClick={() => setShowCustom(v => !v)}
                style={{ background: '#1a0800', border: '1px solid #ff8c0033', color: '#ff8c00', borderRadius: 8, padding: '6px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                + Custom ID
              </button>
            </div>

            {showCustom && (
              <div style={{ background: '#0f0f0f', border: '1px solid #2a1500', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#ff8c00', fontWeight: 700, marginBottom: 8 }}>📹 Custom Video ID / URL</div>
                <input
                  value={customId}
                  onChange={e => setCustomId(e.target.value)}
                  placeholder="Video ID ya YouTube URL..."
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #222', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#eee', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 8 }}
                />
                <button onClick={handleCustomFetch} disabled={fetchingCustom || !customId.trim()}
                  style={{ width: '100%', background: '#1a0800', border: '1px solid #ff8c0055', color: '#ff8c00', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {fetchingCustom ? 'Fetch ho raha hai...' : '🔍 Fetch Karo'}
                </button>
              </div>
            )}

            {videos.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 13 }}>Koi video nahi mila</div>
            )}

            {videos.map(video => (
              <button key={video.videoId} onClick={() => selectVideo(video)}
                style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                {video.thumbnail && (
                  <img src={video.thumbnail} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#ddd', lineHeight: 1.4, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {video.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: '#ff8800' }}>👁 {Number(video.viewCount).toLocaleString()}</span>
                    <span style={{ fontSize: 9, color: '#44bb66' }}>👍 {video.likeCount}</span>
                    <span style={{ fontSize: 9, background: video.tags?.length >= 10 ? '#002a00' : '#2a1500', color: video.tags?.length >= 10 ? '#44bb66' : '#ff8800', border: `1px solid ${video.tags?.length >= 10 ? '#44bb6633' : '#ff880033'}`, borderRadius: 6, padding: '1px 5px', fontWeight: 700 }}>
                      🏷 {video.tags?.length || 0} tags
                    </span>
                  </div>
                </div>
                <span style={{ color: '#333', fontSize: 16, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </>
        )}

        {/* Tag Editor */}
        {!credsLoading && selectedVideo && (
          <>
            {/* Video card */}
            <div style={{ background: '#0f0f0f', border: '1px solid #2a1500', borderRadius: 12, overflow: 'hidden' }}>
              {selectedVideo.thumbnail && (
                <img src={selectedVideo.thumbnail} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} />
              )}
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#eee', lineHeight: 1.5, marginBottom: 6 }}>{selectedVideo.title}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#ff8800' }}>👁 {Number(selectedVideo.viewCount).toLocaleString()}</span>
                  <span style={{ fontSize: 10, color: '#44bb66' }}>👍 {selectedVideo.likeCount}</span>
                  <span style={{ fontSize: 9, background: '#0a1a0a', color: '#44bb66aa', border: '1px solid #44bb6622', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>📺 {channelTitle}</span>
                </div>
              </div>
            </div>

            {/* Tags Editor */}
            <div style={{ background: '#0f0f0f', border: `1px solid ${isDirty ? '#ff8c0044' : '#1e1e1e'}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: '#ff8c00', fontWeight: 700 }}>🏷️ TAGS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isDirty && <span style={{ fontSize: 9, background: 'rgba(255,140,0,0.12)', color: '#ff8c00', border: '1px solid #442200', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>Unsaved</span>}
                  {status === 'saved' && <span style={{ fontSize: 9, background: 'rgba(68,187,102,0.12)', color: '#44bb66', border: '1px solid rgba(68,187,102,0.3)', padding: '2px 7px', borderRadius: 20, fontWeight: 700 }}>✅ Updated</span>}
                  <span style={{ fontSize: 9, color: tagCount < 10 ? '#ffaa00' : '#44bb66', fontWeight: 700 }}>{tagCount} tags</span>
                </div>
              </div>

              <textarea
                value={tags}
                onChange={e => { setTags(e.target.value); setStatus('idle'); }}
                placeholder="tag1, tag2, tag3... (comma separated)"
                rows={4}
                style={{ width: '100%', background: '#0a0a0a', border: `1px solid ${isDirty ? '#ff8c0044' : '#222'}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#eee', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, marginBottom: 10 }}
              />

              {tagList.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                  {tagList.map((t, i) => (
                    <span key={i} style={{ background: '#2a1500', border: '1px solid #ff8c0033', color: '#ff8c00aa', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {tagCount > 0 && tagCount < 10 && (
                <div style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid #ffaa0033', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ffaa00', marginBottom: 10 }}>
                  ⚠️ {tagCount} tags hain — 15-16 tags recommended hain SEO ke liye!
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={generateTags} disabled={generating}
                  style={{ flex: 1, background: generating ? '#111' : 'linear-gradient(135deg,#1a0a2a,#0d0018)', border: `1px solid ${generating ? '#333' : '#cc88ff55'}`, color: generating ? '#555' : '#cc88ff', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {generating ? <>⏳ Generating...</> : '🤖 AI Generate'}
                </button>
                <button onClick={handleUpdate} disabled={saving || !isDirty}
                  style={{ flex: 1, background: saving ? '#111' : isDirty ? 'linear-gradient(135deg,#2a1000,#1a0500)' : '#111', border: `1px solid ${saving ? '#333' : isDirty ? '#ff8c00' : '#222'}`, color: saving ? '#555' : isDirty ? '#ff8c00' : '#333', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 700, cursor: saving || !isDirty ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {saving ? <>⏳ Updating...</> : '🚀 Update'}
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
