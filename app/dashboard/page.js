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
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data.error
      ? (typeof data.error === 'string' ? data.error : data.error?.message || JSON.stringify(data.error))
      : `AI call failed (${res.status})`;
    throw new Error(msg);
  }
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

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [tags,          setTags]          = useState('');
  const [saving,        setSaving]        = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [status,        setStatus]        = useState('idle');

  const [urlInput,      setUrlInput]      = useState('');
  const [fetching,      setFetching]      = useState(false);

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

    if (!data || !data.yt_refresh_token || !data.ai_api_key) {
      setCreds(null);
      setCredsLoading(false);
      return;
    }

    setCreds(data);
    setCredsLoading(false);
  }

  async function handleFetch() {
    const id = extractVideoId(urlInput);
    if (!id) { showToast('⚠️ Video URL ya ID daalo!', 'warn'); return; }
    setFetching(true);
    setSelectedVideo(null);
    setTags('');
    try {
      const res  = await fetch(`/api/youtube?videoId=${id}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(
        typeof data.error === 'string' ? data.error : JSON.stringify(data.error) || 'Fetch fail'
      );
      setSelectedVideo(data);
      setTags((data.tags || []).join(', '));
      setStatus('idle');
      showToast('✅ Video fetch ho gaya!', 'success');
    } catch (e) {
      showToast('❌ ' + e.message, 'error');
    }
    setFetching(false);
  }

  async function generateTags() {
    if (!selectedVideo) return;
    if (!creds?.ai_api_key) { showToast('❌ AI key settings mein add karo!', 'error'); return; }
    setGenerating(true);
    try {
      const text = await aiCall(
        `You are a YouTube SEO expert.\n\nVideo title: "${selectedVideo.title}"\nCurrent tags: ${(selectedVideo.tags || []).join(', ') || 'none'}\nViews: ${selectedVideo.viewCount} | Likes: ${selectedVideo.likeCount}\n\nGenerate exactly 16 viral SEO YouTube tags for this video.\nRULES:\n- Mix of relevant language keywords based on video title\n- Include topic-specific tags, general category tags\n- Each tag max 3-4 words\n- Comma separated list\n- No # symbol, no quotes\n- Focus on high-search-volume keywords\nReturn ONLY the comma-separated tags, nothing else.`,
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
    if (!selectedVideo) { showToast('⚠️ Pehle video fetch karo!', 'warn'); return; }
    if (!tags.trim())   { showToast('⚠️ Tags khaali nahi ho sakte!', 'warn'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/youtube', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: selectedVideo.videoId, tags }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(
        typeof data.error === 'string' ? data.error : data.error?.message || JSON.stringify(data.error) || 'Update fail'
      );
      setStatus('saved');
      setSelectedVideo(prev => ({ ...prev, tags: tagList }));
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

  // ── No credentials → Setup screen ──
  if (!credsLoading && !creds) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
        <Topbar user={user} onSettings={() => router.push('/settings')} onLogout={handleLogout} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 28, boxShadow: '0 0 60px rgba(255,140,0,0.25)' }}>⚙️</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#eee' }}>Setup Karo Pehle</h2>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 1.8, maxWidth: 280 }}>
            YouTube credentials aur AI key add karo Settings mein — ek baar set karo, phir tag manager use karo!
          </p>
          {[
            { icon: '🔑', label: 'Google Cloud Console', sub: 'OAuth 2.0 Client banao' },
            { icon: '🤖', label: 'AI API Key', sub: 'Groq ya OpenRouter se' },
            { icon: '🚀', label: 'Done!', sub: 'Tags generate karo AI se' },
          ].map((step, i) => (
            <div key={i} style={{ width: '100%', maxWidth: 320, background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, background: '#1a1a1a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{step.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc' }}>{step.label}</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>{step.sub}</div>
              </div>
            </div>
          ))}
          <button onClick={() => router.push('/settings')}
            style={{ marginTop: 20, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', border: 'none', color: '#fff', borderRadius: 14, padding: '14px 36px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,140,0,0.35)' }}>
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
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)', fontWeight: 600,
          maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast.msg}
        </div>
      )}

      <Topbar user={user} onSettings={() => router.push('/settings')} onLogout={handleLogout} showBack={!!selectedVideo} onBack={() => { setSelectedVideo(null); setTags(''); setUrlInput(''); setStatus('idle'); }} />

      <div style={{ flex: 1, padding: '14px 12px 40px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* URL Input Box */}
        {!selectedVideo && (
          <div style={{ background: '#0c0c0c', border: '1px solid #1e1400', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, color: '#ff8c00', fontWeight: 800, marginBottom: 10, letterSpacing: '0.5px' }}>📹 VIDEO URL / ID</div>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              placeholder="YouTube URL ya Video ID daalo..."
              style={{ width: '100%', background: '#080808', border: '1px solid #252525', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#eee', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 }}
            />
            <button onClick={handleFetch} disabled={fetching || !urlInput.trim()}
              style={{
                width: '100%', padding: '13px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: fetching || !urlInput.trim() ? 'not-allowed' : 'pointer',
                background: fetching || !urlInput.trim() ? '#0a0a0a' : 'linear-gradient(135deg,#ff8c00,#ff4400)',
                border: fetching || !urlInput.trim() ? '1px solid #1a1a1a' : 'none',
                color: fetching || !urlInput.trim() ? '#333' : '#fff',
                boxShadow: fetching || !urlInput.trim() ? 'none' : '0 4px 20px rgba(255,140,0,0.3)',
              }}>
              {fetching ? '⏳ Fetching...' : '🔍 Fetch Video'}
            </button>
          </div>
        )}

        {/* Video Detail + Tag Editor */}
        {selectedVideo && (
          <>
            <div style={{ background: '#0c0c0c', border: '1px solid #1e1400', borderRadius: 14, overflow: 'hidden' }}>
              {selectedVideo.thumbnail && (
                <img src={selectedVideo.thumbnail} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              )}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#eee', lineHeight: 1.5, marginBottom: 8 }}>{selectedVideo.title}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#ff8800' }}>👁 {Number(selectedVideo.viewCount).toLocaleString()}</span>
                  <span style={{ fontSize: 10, color: '#44bb66' }}>👍 {selectedVideo.likeCount}</span>
                  <span style={{ fontSize: 9, background: '#0f0f0f', color: '#555', border: '1px solid #222', borderRadius: 8, padding: '1px 7px', fontWeight: 700 }}>🆔 {selectedVideo.videoId}</span>
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
                  style={{ flex: 1, background: generating ? '#0a0a0a' : 'linear-gradient(135deg,#120a22,#0a0014)', border: `1px solid ${generating ? '#222' : '#8855cc44'}`, color: generating ? '#444' : '#aa77ee', borderRadius: 10, padding: '12px', fontSize: 12, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {generating ? '⏳ Generating...' : '🤖 AI Generate'}
                </button>
                <button onClick={handleUpdate} disabled={saving || !isDirty}
                  style={{ flex: 1, background: saving ? '#0a0a0a' : isDirty ? 'linear-gradient(135deg,#2a1000,#1a0500)' : '#0a0a0a', border: `1px solid ${saving ? '#222' : isDirty ? '#ff8c0055' : '#1a1a1a'}`, color: saving ? '#444' : isDirty ? '#ff8c00' : '#333', borderRadius: 10, padding: '12px', fontSize: 12, fontWeight: 700, cursor: saving || !isDirty ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {saving ? '⏳ Updating...' : '🚀 Update'}
                </button>
              </div>
            </div>

            {/* Fetch another */}
            <button onClick={() => { setSelectedVideo(null); setTags(''); setUrlInput(''); setStatus('idle'); }}
              style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', color: '#555', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔁 Doosra Video Fetch Karo
            </button>
          </>
        )}

        {credsLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 12 }}>Loading...</div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }`}</style>
    </div>
  );
}

function Topbar({ user, onSettings, onLogout, showBack, onBack }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #161616',
      padding: '0 16px', height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showBack ? (
          <button onClick={onBack}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 0', fontWeight: 700 }}>
            ← Back
          </button>
        ) : (
          <>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎬</div>
            <span style={{ fontSize: 15, fontWeight: 900, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Tag Manager</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={onSettings}
          style={{ background: '#141414', border: '1px solid #222', color: '#555', borderRadius: 8, width: 32, height: 32, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ⚙️
        </button>
        {user?.user_metadata?.avatar_url && (
          <img src={user.user_metadata.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #2a2a2a' }} />
        )}
      </div>
    </div>
  );
}
