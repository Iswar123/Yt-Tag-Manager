// app/dashboard/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

function formatSubscribers(count) {
  const n = parseInt(count) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 100000)  return (n / 1000).toFixed(0) + 'K';
  if (n >= 10000)   return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

const MODEL_MAP = {
  groq:       'llama-3.3-70b-versatile',
  openrouter: 'openai/gpt-4o-mini',
};

async function aiCall(prompt, provider, apiKey) {
  const model = MODEL_MAP[provider] ?? MODEL_MAP['openrouter'];
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

// ── Skeleton block reused in multiple places ──────────────────────
function SkeletonBlock({ width = '100%', height = 14, radius = 6, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg,#1a1a1a,#242424,#1a1a1a)',
      backgroundSize: '200%',
      animation: 'shimmer 1.2s infinite',
      ...style,
    }} />
  );
}

// ── Quota Bar ─────────────────────────────────────────────────────
function QuotaBar({ used }) {
  const TOTAL   = 10000;
  const pct     = Math.min((used / TOTAL) * 100, 100);
  const color   = pct > 80 ? '#ff4444' : pct > 50 ? '#ff8c00' : '#00cc66';

  // Next reset = midnight Pacific Time
  const now    = new Date();
  const ptNow  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const ptReset = new Date(ptNow);
  ptReset.setDate(ptReset.getDate() + 1);
  ptReset.setHours(0, 0, 0, 0);
  const diffMs = ptReset - ptNow;
  const hh     = Math.floor(diffMs / 3600000);
  const mm     = Math.floor((diffMs % 3600000) / 60000);

  return (
    <div style={{
      background: '#090909',
      borderBottom: '1px solid #141414',
      padding: '6px 16px 8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 9, color: '#444', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
          📊 Quota Used (Est.)
        </span>
        <span style={{ fontSize: 9, color: '#333', fontWeight: 600 }}>
          🔄 {hh}h {mm}m mein reset
        </span>
      </div>
      <div style={{ height: 3, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: 'width 0.5s ease',
          boxShadow: pct > 0 ? `0 0 6px ${color}66` : 'none',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color }}>
          {used.toLocaleString()} units
        </span>
        <span style={{ fontSize: 9, color: '#2a2a2a', fontWeight: 600 }}>
          / 10,000
        </span>
      </div>
    </div>
  );
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

  const [urlInput, setUrlInput] = useState('');
  const [fetching, setFetching] = useState(false);

  const [toast,        setToast]        = useState({ msg: '', type: 'info' });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Quota state ───────────────────────────────────────────────
  const [quotaUsed, setQuotaUsed] = useState(0);

  const tagList  = tags.split(',').map(t => t.trim()).filter(Boolean);
  const tagCount = tagList.length;
  const isDirty  = selectedVideo && tags !== (selectedVideo.tags || []).join(', ');

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 3500);
  }

  useEffect(() => { init(); }, []);

  async function loadQuota(userId) {
    try {
      const ptDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      const { data } = await supabase
        .from('quota_usage')
        .select('units_used')
        .eq('user_id', userId)
        .eq('pt_date', ptDate)
        .single();
      setQuotaUsed(data?.units_used || 0);
    } catch {
      setQuotaUsed(0);
    }
  }

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

    if (!data || !data.yt_refresh_token || (!data.ai_api_key && !data.openrouter_api_key)) {
      setCreds(null);
    } else {
      setCreds(data);
    }

    await loadQuota(user.id);
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
      if (user) await loadQuota(user.id);
    } catch (e) {
      showToast('❌ ' + e.message, 'error');
    }
    setFetching(false);
  }

  async function generateTags() {
    if (!selectedVideo) return;
    const activeKey = creds?.ai_provider === 'groq' ? creds?.ai_api_key : creds?.openrouter_api_key;
    if (!activeKey) { showToast('❌ AI key settings mein add karo!', 'error'); return; }
    setGenerating(true);
    try {
      const text = await aiCall(
        `You are a YouTube SEO expert.\n\nVideo title: "${selectedVideo.title}"\nCurrent tags: ${(selectedVideo.tags || []).join(', ') || 'none'}\nViews: ${selectedVideo.viewCount} | Likes: ${selectedVideo.likeCount}\n\nGenerate exactly 16 viral SEO YouTube tags for this video.\nRULES:\n- Mix of relevant language keywords based on video title\n- Include topic-specific tags, general category tags\n- Each tag max 3-4 words\n- Comma separated list\n- No # symbol, no quotes\n- Focus on high-search-volume keywords\nReturn ONLY the comma-separated tags, nothing else.`,
        creds.ai_provider || 'openrouter',
        activeKey
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
      if (user) await loadQuota(user.id);
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

  function handleReset() {
    setSelectedVideo(null);
    setTags('');
    setUrlInput('');
    setStatus('idle');
  }

  async function refreshCreds() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (data) setCreds(data);
  }

  const toastColors = {
    success: { bg: '#001a0a', border: '#00cc6633', color: '#00cc66' },
    error:   { bg: '#1a0000', border: '#ff444433', color: '#ff6666' },
    warn:    { bg: '#1a0e00', border: '#ffaa0033', color: '#ffaa00' },
    info:    { bg: '#0a0a0f', border: '#4488ff33', color: '#88aaff' },
  };
  const tc = toastColors[toast.type] || toastColors.info;

  // ── credsLoading: full-screen spinner, Topbar nahi dikhta ────────
  if (credsLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, border: '3px solid #1a1a1a', borderTop: '3px solid #ff8c00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 11, color: '#333', fontWeight: 700 }}>Loading...</span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!creds) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>
        <Topbar user={user} onSettings={() => setSettingsOpen(true)} onLogout={handleLogout} />
        <QuotaBar used={quotaUsed} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 28, boxShadow: '0 0 60px rgba(255,140,0,0.25)' }}>⚙️</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#eee' }}>Setup Karo Pehle</h2>
          <p style={{ margin: '0 0 28px', fontSize: 13, color: '#555', textAlign: 'center', lineHeight: 1.8, maxWidth: 280 }}>
            YouTube credentials aur AI key add karo Settings mein — ek baar set karo, phir tag manager use karo!
          </p>
          {[
            { icon: '🔑', label: 'Google Cloud Console', sub: 'OAuth 2.0 Client banao' },
            { icon: '🤖', label: 'AI API Key',           sub: 'Groq ya OpenRouter se' },
            { icon: '🚀', label: 'Done!',                sub: 'Tags generate karo AI se' },
          ].map((step, i) => (
            <div key={i} style={{ width: '100%', maxWidth: 320, background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, background: '#1a1a1a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{step.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc' }}>{step.label}</div>
                <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>{step.sub}</div>
              </div>
            </div>
          ))}
          <button onClick={() => setSettingsOpen(true)}
            style={{ marginTop: 20, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', border: 'none', color: '#fff', borderRadius: 14, padding: '14px 36px', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,140,0,0.35)' }}>
            ⚙️ Settings Kholao
          </button>
        </div>
        {settingsOpen && (
          <SettingsDrawer
            supabase={supabase} user={user}
            onClose={() => { setSettingsOpen(false); refreshCreds(); }}
            showToast={showToast}
          />
        )}
        <GlobalStyles />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>

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

      <Topbar
        user={user}
        onSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
        showBack={!!selectedVideo}
        onBack={handleReset}
      />

      {/* ── Quota Bar — topbar ke niche ── */}
      <QuotaBar used={quotaUsed} />

      <div style={{ flex: 1, padding: '14px 12px 40px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {!selectedVideo && (
          <SearchSection
            urlInput={urlInput}
            setUrlInput={setUrlInput}
            fetching={fetching}
            onFetch={handleFetch}
            showToast={showToast}
          />
        )}

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

            <button onClick={handleReset}
              style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', color: '#555', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔁 Doosra Video Fetch Karo
            </button>
          </>
        )}
      </div>

      {settingsOpen && (
        <SettingsDrawer
          supabase={supabase} user={user}
          onClose={() => { setSettingsOpen(false); refreshCreds(); }}
          showToast={showToast}
        />
      )}

      <GlobalStyles />
    </div>
  );
}

// ── SearchSection ─────────────────────────────────────────────────
function SearchSection({ urlInput, setUrlInput, fetching, onFetch, showToast }) {
  const [focused,        setFocused]        = useState(false);
  const [typeText,       setTypeText]       = useState('');
  const [typeIndex,      setTypeIndex]      = useState(0);
  const [typing,         setTyping]         = useState(true);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const typeTimer = useRef(null);

  const placeholders = [
    'YouTube URL paste karo...',
    'youtu.be/dQw4w9WgXcQ',
    'Video ID daalo...',
    'https://youtube.com/watch?v=...',
  ];

  useEffect(() => {
    if (urlInput || focused) return;
    const current = placeholders[placeholderIdx];
    if (typing) {
      if (typeIndex < current.length) {
        typeTimer.current = setTimeout(() => {
          setTypeText(current.slice(0, typeIndex + 1));
          setTypeIndex(i => i + 1);
        }, 55);
      } else {
        typeTimer.current = setTimeout(() => setTyping(false), 1800);
      }
    } else {
      if (typeIndex > 0) {
        typeTimer.current = setTimeout(() => {
          setTypeText(current.slice(0, typeIndex - 1));
          setTypeIndex(i => i - 1);
        }, 28);
      } else {
        setPlaceholderIdx(i => (i + 1) % placeholders.length);
        setTyping(true);
      }
    }
    return () => clearTimeout(typeTimer.current);
  }, [typeIndex, typing, placeholderIdx, urlInput, focused]);

  const hasInput = urlInput.trim().length > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '0 4px' }}>
      <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#ff8c00,#ff4400)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: '0 0 40px rgba(255,140,0,0.3)', animation: 'pulse 2.5s ease-in-out infinite' }}>🎬</div>
        <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>YouTube Tag Manager</div>
      </div>

      <div style={{ width: '100%', marginTop: 16, background: '#111', border: `1.5px solid ${focused ? '#ff8c00' : hasInput ? '#ff8c0066' : '#2a2a2a'}`, borderRadius: 18, padding: 14, boxShadow: focused ? '0 0 0 3px rgba(255,140,0,0.1), 0 8px 32px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.3)', transition: 'all 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: hasInput ? '#ff8c00' : '#444', transition: 'background 0.3s', boxShadow: hasInput ? '0 0 8px #ff8c00' : 'none' }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: hasInput ? '#ff8c00' : '#555' }}>
            📹 Video URL / ID
          </span>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onFetch()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={focused ? 'Paste karo ya type karo...' : (typeText || 'YouTube URL daalo...')}
            style={{
              width: '100%', background: '#1a1a1a',
              border: `1px solid ${focused ? '#ff8c0055' : '#2a2a2a'}`,
              borderRadius: 12, padding: '13px 44px 13px 16px',
              fontSize: 13, color: '#fff', outline: 'none',
              boxSizing: 'border-box', fontFamily: 'inherit',
              transition: 'border-color 0.2s', caretColor: '#ff8c00',
            }}
          />
          {hasInput && (
            <button onClick={() => setUrlInput('')}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: '#2a2a2a', border: 'none', color: '#888', borderRadius: '50%', width: 22, height: 22, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
              ✕
            </button>
          )}
        </div>

        <button onClick={onFetch} disabled={fetching || !hasInput}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, fontSize: 13, fontWeight: 800,
            cursor: fetching || !hasInput ? 'not-allowed' : 'pointer',
            background: fetching ? 'linear-gradient(135deg,#1a0800,#100500)' : hasInput ? 'linear-gradient(135deg,#ff8c00,#ff4400)' : '#1a1a1a',
            border: fetching ? '1px solid #ff8c0033' : hasInput ? 'none' : '1px solid #2a2a2a',
            color: fetching ? '#ff8c0088' : hasInput ? '#fff' : '#444',
            boxShadow: hasInput && !fetching ? '0 4px 24px rgba(255,140,0,0.4)' : 'none',
            transition: 'all 0.25s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            animation: hasInput && !fetching ? 'btnGlow 1.8s ease-in-out infinite' : 'none',
            position: 'relative', overflow: 'hidden',
          }}>
          {hasInput && !fetching && (
            <span style={{ position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)', animation: 'shine 2s ease-in-out infinite' }} />
          )}
          {fetching ? (
            <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⏳</span> Fetching...</>
          ) : hasInput ? <>🚀 Fetch Video</> : <>🔍 Fetch Video</>}
        </button>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['youtube.com/watch?v=...', 'youtu.be/...', 'Video ID'].map((hint, i) => (
          <span key={i} style={{ fontSize: 9, color: '#444', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>{hint}</span>
        ))}
      </div>
    </div>
  );
}

// ── Settings Drawer ───────────────────────────────────────────────
function SettingsDrawer({ supabase, user, onClose, showToast }) {
  const [dataLoading,    setDataLoading]    = useState(true);
  const [channelLoading, setChannelLoading] = useState(false);

  const [form, setForm] = useState({
    channel_id:         '',
    yt_refresh_token:   '',
    ai_provider:        'openrouter',
    groq_api_key:       '',
    openrouter_api_key: '',
  });

  const [showGroqKey,       setShowGroqKey]       = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [channelInfo, setChannelInfo] = useState({ name: '', avatar: '', subscribers: '', subscriberHidden: false });

  const [apiKeys,          setApiKeys]          = useState([]);
  const [newKey,           setNewKey]           = useState('');
  const [newLabel,         setNewLabel]         = useState('');
  const [addingKey,        setAddingKey]        = useState(false);
  const [showAddKey,       setShowAddKey]       = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);

  const providerSaveTimer = useRef(null);
  useEffect(() => { return () => clearTimeout(providerSaveTimer.current); }, []);

  useEffect(() => { loadData(); loadApiKeys(); }, []);

  async function loadData() {
    setDataLoading(true);
    const { data } = await supabase
      .from('user_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setForm({
        channel_id:         data.channel_id         || '',
        yt_refresh_token:   data.yt_refresh_token   || '',
        ai_provider:        data.ai_provider        || 'openrouter',
        groq_api_key:       data.ai_api_key         || '',
        openrouter_api_key: data.openrouter_api_key || '',
      });

      if (data.yt_refresh_token) {
        setChannelLoading(true);
        try {
          const res    = await fetch('/api/youtube');
          const ytData = await res.json();
          if (ytData.channelTitle) {
            setChannelInfo({
              name:             ytData.channelTitle,
              avatar:           ytData.channelAvatar    || '',
              subscribers:      ytData.subscriberCount  || '0',
              subscriberHidden: ytData.subscriberHidden || false,
            });
          }
        } catch (_) {}
        setChannelLoading(false);
      }
    }
    setDataLoading(false);
  }

  async function loadApiKeys() {
    const res  = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) });
    const data = await res.json();
    if (data.keys) setApiKeys(data.keys);
  }

  async function handleProviderSwitch(provider) {
    setForm(f => ({ ...f, ai_provider: provider }));
    clearTimeout(providerSaveTimer.current);
    providerSaveTimer.current = setTimeout(async () => {
      await supabase.from('user_credentials').upsert({
        user_id: user.id, ai_provider: provider, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      showToast('✅ Provider save ho gaya!', 'success');
    }, 300);
  }

  async function handleKeyBlur(field) {
    const upsertData = { user_id: user.id, updated_at: new Date().toISOString() };
    if (field === 'groq')       upsertData.ai_api_key         = form.groq_api_key;
    if (field === 'openrouter') upsertData.openrouter_api_key = form.openrouter_api_key;
    const { error } = await supabase.from('user_credentials').upsert(upsertData, { onConflict: 'user_id' });
    if (!error) showToast('✅ Key save ho gayi!', 'success');
    else        showToast('❌ Save fail: ' + error.message, 'error');
  }

  async function handleDisconnect() {
    await supabase.from('user_credentials').upsert({
      user_id: user.id, yt_refresh_token: null, channel_id: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setForm(p => ({ ...p, yt_refresh_token: '', channel_id: '' }));
    setChannelInfo({ name: '', avatar: '', subscribers: '', subscriberHidden: false });
    showToast('🔌 YouTube disconnect ho gaya!', 'warn');
  }

  function handleConnectYouTube() {
    const redirectUri = `${window.location.origin}/api/auth/yt-callback`;
    const scope = encodeURIComponent([
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ].join(' '));
    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID;
    if (!clientId) { showToast('❌ Server config error', 'error'); return; }
    window.location.href =
      `https://accounts.google.com/o/oauth2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  }

  async function handleAddKey() {
    if (!newKey.trim()) { showToast('❌ API key daalo!', 'error'); return; }
    setAddingKey(true);
    const res  = await fetch('/api/youtube', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', api_key: newKey.trim(), label: newLabel.trim() || `Key ${apiKeys.length + 1}` }),
    });
    const data = await res.json();
    if (data.error) showToast('❌ ' + data.error, 'error');
    else { showToast('✅ Key add ho gayi!', 'success'); setNewKey(''); setNewLabel(''); setShowAddKey(false); loadApiKeys(); }
    setAddingKey(false);
  }

  async function handleDeleteKey(id) {
    await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', key_id: id }) });
    showToast('🗑️ Key delete ho gayi', 'warn');
    loadApiKeys();
  }

  async function handleReactivateKey(id) {
    await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reactivate', key_id: id }) });
    showToast('✅ Key reactivate ho gayi!', 'success');
    loadApiKeys();
  }

  const ytConnected   = !dataLoading && !!form.yt_refresh_token;
  const displayAvatar = (ytConnected && channelInfo.avatar)
    ? channelInfo.avatar
    : user?.user_metadata?.avatar_url || '';
  const displayName   = (ytConnected && channelInfo.name)
    ? channelInfo.name
    : user?.user_metadata?.full_name || 'User';

  return (
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, animation: 'fadeIn 0.2s ease' }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 101,
        width: '88vw', maxWidth: 420,
        background: '#0a0a0a', borderLeft: '1px solid #1e1e1e',
        borderRadius: '20px 0 0 20px', overflowY: 'auto',
        animation: 'slideInRight 0.28s cubic-bezier(0.32,0.72,0,1)',
        paddingBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 2, borderBottom: '1px solid #141414' }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#ff8c00' }}>⚙️ Settings</span>
          <button onClick={onClose}
            style={{ background: '#161616', border: '1px solid #2a2a2a', color: '#666', borderRadius: 8, width: 30, height: 30, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            ✕
          </button>
        </div>

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── User info card ── */}
          {dataLoading || channelLoading ? (
            <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <SkeletonBlock width={44} height={44} radius={22} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SkeletonBlock width="55%" />
                <SkeletonBlock width="40%" height={10} />
              </div>
              <SkeletonBlock width={80} height={24} radius={20} style={{ flexShrink: 0 }} />
            </div>
          ) : (
            <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {displayAvatar ? (
                  <img src={displayAvatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%', border: `2px solid ${ytConnected ? '#ff8c0055' : '#333'}`, display: 'block' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1a1a1a', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ytConnected
                    ? channelInfo.subscriberHidden
                      ? '🔒 Subscribers hidden'
                      : `👥 ${formatSubscribers(channelInfo.subscribers)} subscribers`
                    : user?.email}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '3px 10px', flexShrink: 0, color: ytConnected ? '#44bb66' : '#555', background: ytConnected ? '#001a08' : '#111', border: `1px solid ${ytConnected ? '#44bb6622' : '#222'}` }}>
                {ytConnected ? '✅ Connected' : '⬡ Not Connected'}
              </div>
            </div>
          )}

          {/* ── YouTube section ── */}
          <DrawerSection title="🎬 YouTube">
            {dataLoading ? (
              <SkeletonBlock height={48} radius={12} />
            ) : ytConnected ? (
              <>
                <div style={{ background: '#001a08', border: '1px solid #00cc6622', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#44bb66', fontWeight: 700, marginBottom: 8 }}>✅ YouTube Connected</div>
                  {form.channel_id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#444', fontWeight: 700, textTransform: 'uppercase' }}>Channel ID:</span>
                      <span style={{ fontSize: 11, color: '#44bb6699', fontFamily: 'monospace', background: '#001208', border: '1px solid #44bb6618', borderRadius: 6, padding: '2px 8px' }}>{form.channel_id}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleConnectYouTube}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', background: '#080f08', border: '1px solid #44bb6622', color: '#44bb6677' }}>
                    🔄 Re-connect
                  </button>
                  <button onClick={handleDisconnect}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', background: '#100000', border: '1px solid #ff000022', color: '#ff4444' }}>
                    🔌 Disconnect
                  </button>
                </div>
              </>
            ) : (
              <button onClick={handleConnectYouTube}
                style={{ width: '100%', padding: '13px', borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(135deg,#001a0a,#001408)', border: '1px solid #00cc6644', color: '#00cc66' }}>
                🔗 Connect YouTube
              </button>
            )}
          </DrawerSection>

          {/* ── AI Settings ── */}
          <DrawerSection title="🤖 AI Settings">
            <div style={{ display: 'flex', gap: 8 }}>
              {['openrouter', 'groq'].map(p => (
                <button key={p} onClick={() => handleProviderSwitch(p)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    background: form.ai_provider === p ? (p === 'groq' ? '#001208' : '#120800') : '#0a0a0a',
                    border: `1px solid ${form.ai_provider === p ? (p === 'groq' ? '#00cc6644' : '#ff8c0044') : '#1a1a1a'}`,
                    color: form.ai_provider === p ? (p === 'groq' ? '#00cc66' : '#ff8c00') : '#444',
                    transition: 'all 0.15s',
                  }}>
                  {p === 'openrouter' ? '🔶 OpenRouter' : '⚡ Groq'}
                </button>
              ))}
            </div>

            {form.ai_provider === 'openrouter' ? (
              <div>
                <div style={{ fontSize: 10, color: '#ff8c00', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  🔶 OpenRouter API Key <span style={{ color: '#ff8c0055', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>← active</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showOpenrouterKey ? 'text' : 'password'}
                    value={form.openrouter_api_key}
                    onChange={e => setForm(f => ({ ...f, openrouter_api_key: e.target.value }))}
                    onBlur={() => handleKeyBlur('openrouter')}
                    placeholder="sk-or-xxxxxxxxxxxx"
                    style={{ ...inputStyle, paddingRight: 44, borderColor: '#ff8c0033' }}
                  />
                  <button onClick={() => setShowOpenrouterKey(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 14, padding: 4 }}>
                    {showOpenrouterKey ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, color: '#00cc66', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  ⚡ Groq API Key <span style={{ color: '#00cc6655', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>← active</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showGroqKey ? 'text' : 'password'}
                    value={form.groq_api_key}
                    onChange={e => setForm(f => ({ ...f, groq_api_key: e.target.value }))}
                    onBlur={() => handleKeyBlur('groq')}
                    placeholder="gsk_xxxxxxxxxxxx"
                    style={{ ...inputStyle, paddingRight: 44, borderColor: '#00cc6633' }}
                  />
                  <button onClick={() => setShowGroqKey(p => !p)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 14, padding: 4 }}>
                    {showGroqKey ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ background: '#080808', border: '1px solid #141414', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#2a2a2a', lineHeight: 1.6 }}>
              Active model:{' '}
              <span style={{ color: form.ai_provider === 'groq' ? '#00cc6655' : '#ff8c0055' }}>
                {MODEL_MAP[form.ai_provider] ?? MODEL_MAP['openrouter']}
              </span>
            </div>
          </DrawerSection>

          {/* ── YouTube API Keys ── */}
          <DrawerSection title="🔑 YouTube API Keys (Quota Rotation)">
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6, background: '#0a0a0a', border: '1px solid #141414', borderRadius: 10, padding: '8px 12px' }}>
              💡 Multiple projects ke API keys add karo — quota khatam hone par automatically next key use hogi
            </div>
            <button onClick={() => setShowApiKeysModal(true)}
              style={{ width: '100%', background: '#0a0a0a', border: '1px solid #ff8c0033', color: '#ff8c00', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              🔑 Manage API Keys
              <span style={{ background: '#1a0a00', border: '1px solid #ff8c0033', borderRadius: 20, padding: '1px 8px', fontSize: 10, color: '#ff8c0099' }}>
                {apiKeys.length} added
              </span>
            </button>
          </DrawerSection>

          {/* ── API Keys Modal ── */}
          {showApiKeysModal && (
            <>
              <div onClick={() => { setShowApiKeysModal(false); setShowAddKey(false); setNewKey(''); setNewLabel(''); }}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, animation: 'fadeIn 0.15s ease' }} />

              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
                background: '#0e0e0e', borderTop: '1px solid #222',
                borderRadius: '20px 20px 0 0', maxHeight: '75vh',
                display: 'flex', flexDirection: 'column',
                animation: 'slideUp 0.25s cubic-bezier(0.32,0.72,0,1)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #181818', flexShrink: 0 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#ff8c00' }}>🔑 YouTube API Keys</div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>Quota rotation ke liye multiple keys add karo</div>
                  </div>
                  <button onClick={() => { setShowApiKeysModal(false); setShowAddKey(false); setNewKey(''); setNewLabel(''); }}
                    style={{ background: '#161616', border: '1px solid #2a2a2a', color: '#666', borderRadius: 8, width: 28, height: 28, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                    ✕
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {apiKeys.length === 0 && !showAddKey && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#333', fontSize: 12 }}>Koi key add nahi hui abhi</div>
                  )}
                  {apiKeys.map(k => (
                    <div key={k.id} style={{ background: '#0a0a0a', border: `1px solid ${k.is_active ? '#ff8c0022' : '#ff000022'}`, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: k.is_active ? '#ff8c00' : '#ff4444', marginBottom: 3 }}>
                          {k.is_active ? '🟢' : '🔴'} {k.label}
                        </div>
                        <div style={{ fontSize: 10, color: '#333', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>Used: {k.use_count || 0}x</span>
                          {k.exhausted_at && <span style={{ color: '#ff4444' }}>• Quota exhausted</span>}
                          {k.last_used_at && <span>• {new Date(k.last_used_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {!k.is_active && (
                          <button onClick={() => handleReactivateKey(k.id)}
                            style={{ background: '#001a08', border: '1px solid #44bb6622', color: '#44bb66', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                            ↺ Reset
                          </button>
                        )}
                        <button onClick={() => handleDeleteKey(k.id)}
                          style={{ background: '#100000', border: '1px solid #ff000033', color: '#ff4444', borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}

                  {showAddKey && (
                    <div style={{ background: '#0c0c0c', border: '1px solid #252525', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (e.g. Project 1)" style={{ ...inputStyle, fontSize: 12 }} />
                      <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="AIza... (YouTube Data API v3 key)" style={{ ...inputStyle, fontSize: 12, fontFamily: 'monospace' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleAddKey} disabled={addingKey}
                          style={{ flex: 1, background: addingKey ? '#0a0a0a' : 'linear-gradient(135deg,#ff8c00,#ff4400)', border: 'none', color: addingKey ? '#333' : '#fff', borderRadius: 8, padding: '10px', fontSize: 12, fontWeight: 700, cursor: addingKey ? 'not-allowed' : 'pointer' }}>
                          {addingKey ? '⏳ Adding...' : '✅ Add Key'}
                        </button>
                        <button onClick={() => { setShowAddKey(false); setNewKey(''); setNewLabel(''); }}
                          style={{ background: '#0a0a0a', border: '1px solid #222', color: '#555', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {!showAddKey && (
                  <div style={{ padding: '10px 14px 20px', flexShrink: 0, borderTop: '1px solid #141414' }}>
                    <button onClick={() => setShowAddKey(true)}
                      style={{ width: '100%', background: 'linear-gradient(135deg,#ff8c00,#ff4400)', border: 'none', color: '#fff', borderRadius: 12, padding: '13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(255,140,0,0.25)' }}>
                      + Naya API Key Add Karo
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}

function DrawerSection({ title, children }) {
  return (
    <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#ff8c00', letterSpacing: '0.3px' }}>{title}</div>
      {children}
    </div>
  );
}

function Topbar({ user, onSettings, onLogout, showBack, onBack }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  const avatar = user?.user_metadata?.avatar_url;
  const name   = user?.user_metadata?.full_name || user?.email || 'User';
  const email  = user?.email || '';

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'rgba(8,8,8,0.95)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #161616', padding: '0 16px', height: 52,
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

      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button onClick={() => setProfileOpen(p => !p)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          {avatar ? (
            <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${profileOpen ? '#ff8c00' : '#2a2a2a'}`, transition: 'border-color 0.15s' }} />
          ) : (
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1a1a1a', border: `1.5px solid ${profileOpen ? '#ff8c00' : '#2a2a2a'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👤</div>
          )}
        </button>

        {profileOpen && (
          <div style={{
            position: 'absolute', top: 38, right: 0,
            background: '#0e0e0e', border: '1px solid #222',
            borderRadius: 14, minWidth: 210, zIndex: 50,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            animation: 'fadeIn 0.15s ease', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #181818', display: 'flex', alignItems: 'center', gap: 10 }}>
              {avatar ? (
                <img src={avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #ff8c0044', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: 10, color: '#444', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
              </div>
            </div>
            <button onClick={() => { setProfileOpen(false); onSettings(); }}
              style={{ width: '100%', background: 'none', border: 'none', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#aaa', fontSize: 12, fontWeight: 700, textAlign: 'left' }}>
              <span style={{ fontSize: 15 }}>⚙️</span> Settings
            </button>
            <div style={{ height: 1, background: '#161616', margin: '0 14px' }} />
            <button onClick={() => { setProfileOpen(false); onLogout(); }}
              style={{ width: '100%', background: 'none', border: 'none', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#ff4444', fontSize: 12, fontWeight: 700, textAlign: 'left' }}>
              <span style={{ fontSize: 15 }}>🚪</span> Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      @keyframes slideUp      { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes fadeIn       { from { opacity: 0; }               to { opacity: 1; } }
      @keyframes spin         { from { transform: rotate(0deg); }  to { transform: rotate(360deg); } }
      @keyframes shimmer      { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      @keyframes pulse        { 0%,100% { box-shadow: 0 0 30px rgba(255,140,0,0.25); } 50% { box-shadow: 0 0 50px rgba(255,140,0,0.5); } }
      @keyframes btnGlow      { 0%,100% { box-shadow: 0 4px 20px rgba(255,140,0,0.3); } 50% { box-shadow: 0 4px 32px rgba(255,140,0,0.55); } }
      @keyframes shine        { 0% { left: -100%; } 100% { left: 200%; } }
    `}</style>
  );
}

const inputStyle = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#ddd',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
