// app/settings/page.js
'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#080808' }} />}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const supabase     = createClient();
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [user,        setUser]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState({ msg: '', type: 'info' });
  const [channelInfo, setChannelInfo] = useState({ name: '', avatar: '' }); // NEW

  const [form, setForm] = useState({
    channel_id:       '',
    yt_refresh_token: '',
    ai_provider:      'openrouter',
    ai_api_key:       '',
  });

  const [showToken, setShowToken] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);

  // API Keys state
  const [apiKeys,    setApiKeys]    = useState([]);
  const [newKey,     setNewKey]     = useState('');
  const [newLabel,   setNewLabel]   = useState('');
  const [addingKey,  setAddingKey]  = useState(false);
  const [showAddKey, setShowAddKey] = useState(false);

  useEffect(() => { loadData(); loadApiKeys(); }, []);

  // Handle redirect back from Google OAuth
  useEffect(() => {
    const ytConnected = searchParams.get('yt_connected');
    const ytError     = searchParams.get('yt_error');
    if (ytConnected === 'true') {
      loadData();
      showToast('✅ YouTube connect ho gaya!', 'success');
      router.replace('/settings');
    } else if (ytError) {
      const msgs = {
        no_code:          'Google se code nahi mila — phir try karo.',
        no_refresh_token: 'Refresh token nahi mila. Google Cloud Console mein "Web Application" type select karo aur redirect URI add karo.',
        env_missing:      'Server config error — Vercel mein env variables set karo.',
        access_denied:    'Access deny kiya — phir se try karo.',
      };
      showToast('❌ ' + (msgs[ytError] || decodeURIComponent(ytError)), 'error');
      router.replace('/settings');
    }
  }, [searchParams]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUser(user);

    const { data } = await supabase
      .from('user_credentials')
      .select('channel_id, yt_refresh_token, ai_provider, ai_api_key')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setForm({
        channel_id:       data.channel_id       || '',
        yt_refresh_token: data.yt_refresh_token || '',
        ai_provider:      data.ai_provider      || 'openrouter',
        ai_api_key:       data.ai_api_key       || '',
      });

      // Fetch YouTube channel info if connected
      if (data.yt_refresh_token) {
        try {
          const res    = await fetch('/api/youtube');
          const ytData = await res.json();
          if (ytData.channelTitle) {
            setChannelInfo({
              name:   ytData.channelTitle,
              avatar: ytData.channelAvatar || '',
            });
          }
        } catch (e) {
          // Silently fail — fallback to Google profile
        }
      }
    }
    setLoading(false);
  }

  const toastColors = {
    success: { bg: '#001a0a', border: '#00cc6633', color: '#00cc66' },
    error:   { bg: '#1a0000', border: '#ff444433', color: '#ff6666' },
    warn:    { bg: '#1a0e00', border: '#ffaa0033', color: '#ffaa00' },
    info:    { bg: '#0a0a0f', border: '#4488ff33', color: '#88aaff' },
  };

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 4000);
  }

  async function handleSave() {
    if (!form.ai_api_key) {
      showToast('❌ AI API key dalo!', 'error'); return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('user_credentials')
      .upsert({
        user_id:          user.id,
        channel_id:       form.channel_id,
        yt_refresh_token: form.yt_refresh_token,
        ai_provider:      form.ai_provider,
        ai_api_key:       form.ai_api_key,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) showToast('❌ Save fail: ' + error.message, 'error');
    else        showToast('✅ Settings save ho gayi!', 'success');
    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function loadApiKeys() {
    const res  = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) });
    const data = await res.json();
    if (data.keys) setApiKeys(data.keys);
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
    else { showToast('✅ API key add ho gaya!', 'success'); setNewKey(''); setNewLabel(''); setShowAddKey(false); loadApiKeys(); }
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

  async function handleDisconnect() {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('user_credentials')
      .upsert({
        user_id:          user.id,
        yt_refresh_token: null,
        channel_id:       null,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' });
    setForm(p => ({ ...p, yt_refresh_token: '', channel_id: '' }));
    setChannelInfo({ name: '', avatar: '' }); // Reset channel info
    showToast('🔌 YouTube disconnect ho gaya!', 'warn');
  }

  function handleConnectYouTube() {
    const redirectUri = `${window.location.origin}/api/auth/yt-callback`;
    const scope = encodeURIComponent([
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ].join(' '));

    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID;
    if (!clientId) {
      showToast('❌ Server config error — admin se contact karo', 'error'); return;
    }

    const authUrl =
      `https://accounts.google.com/o/oauth2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=offline` +
      `&prompt=consent`;

    window.location.href = authUrl;
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808' }}>
      <div style={{ color: '#333', fontSize: 13 }}>Loading...</div>
    </div>
  );

  const tc          = toastColors[toast.type] || toastColors.info;
  const ytConnected = !!form.yt_refresh_token;

  // Avatar and display name logic
  const displayAvatar = ytConnected && channelInfo.avatar ? channelInfo.avatar : user?.user_metadata?.avatar_url;
  const displayName   = ytConnected && channelInfo.name   ? channelInfo.name   : user?.user_metadata?.full_name || 'User';

  return (
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 80 }}>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 12,
          padding: '10px 20px', fontSize: 13, color: tc.color, zIndex: 999,
          whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', fontWeight: 600,
          maxWidth: '90vw', whiteSpace: 'normal', textAlign: 'center',
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
        <button onClick={() => router.push('/dashboard')}
          style={{ background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer', padding: '4px 0', fontWeight: 700 }}>
          ← Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#ff8c00' }}>⚙️ Settings</span>
        <button onClick={handleLogout}
          style={{ background: '#100000', border: '1px solid #ff000022', color: '#ff4444', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ padding: '14px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* User info */}
        <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt=""
              style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${ytConnected ? '#ff8c0055' : '#ff8c0033'}` }}
            />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1a1a1a', border: '2px solid #ff8c0033', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
              👤
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#ddd' }}>{displayName}</div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
              {ytConnected && channelInfo.name
                ? <span style={{ color: '#333' }}>{user?.email}</span>
                : user?.email
              }
            </div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '3px 10px',
            color:      ytConnected ? '#44bb66' : '#555',
            background: ytConnected ? '#001a08' : '#111',
            border:     `1px solid ${ytConnected ? '#44bb6622' : '#222'}`,
          }}>
            {ytConnected ? '✅ YT Connected' : '⬡ Not Connected'}
          </div>
        </div>

        {/* YouTube Section */}
        <Section title="🎬 YouTube">

          {ytConnected ? (
            <>
              <div style={{ background: '#001a08', border: '1px solid #00cc6622', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#44bb66', fontWeight: 700, marginBottom: 8 }}>✅ YouTube Connected</div>
                {form.channel_id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Channel ID:</span>
                    <span style={{ fontSize: 11, color: '#44bb6699', fontFamily: 'monospace', background: '#001208', border: '1px solid #44bb6618', borderRadius: 6, padding: '2px 8px' }}>{form.channel_id}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: '#333' }}>Channel ID fetch nahi hua — re-connect karo</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleConnectYouTube}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#080f08', border: '1px solid #44bb6622', color: '#44bb6677' }}>
                  <GoogleIcon /> 🔄 Re-connect
                </button>
                <button onClick={handleDisconnect}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', background: '#100000', border: '1px solid #ff000022', color: '#ff4444' }}>
                  🔌 Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={handleConnectYouTube}
                style={{ width: '100%', padding: '13px', borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg, #001a0a, #001408)', border: '1px solid #00cc6644', color: '#00cc66', boxShadow: '0 0 24px rgba(0,204,102,0.1)' }}>
                <GoogleIcon /> 🔗 Connect YouTube
              </button>
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#444', lineHeight: 1.7 }}>
                ↑ Button dabao → Google account se allow karo → automatically connect ho jayega
              </div>
            </>
          )}
        </Section>

        {/* AI Section */}
        <Section title="🤖 AI Settings">
          <Field label="AI Provider">
            <div style={{ display: 'flex', gap: 8 }}>
              {['openrouter', 'groq'].map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, ai_provider: p }))}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    background: form.ai_provider === p ? (p === 'groq' ? '#001208' : '#120800') : '#0a0a0a',
                    border: `1px solid ${form.ai_provider === p ? (p === 'groq' ? '#00cc6644' : '#ff8c0044') : '#1a1a1a'}`,
                    color: form.ai_provider === p ? (p === 'groq' ? '#00cc66' : '#ff8c00') : '#333',
                    transition: 'all 0.2s',
                  }}>
                  {p === 'openrouter' ? '🔶 OpenRouter' : '⚡ Groq'}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`${form.ai_provider === 'groq' ? 'Groq' : 'OpenRouter'} API Key`}>
            <div style={{ position: 'relative' }}>
              <input
                type={showAiKey ? 'text' : 'password'}
                value={form.ai_api_key}
                onChange={e => { const v=e.target.value; const dp=v.startsWith('gsk_')?'groq':v.startsWith('sk-or-')?'openrouter':null; setForm(p => ({ ...p, ai_api_key: v, ...(dp?{ai_provider:dp}:{}) })); }}
                placeholder={form.ai_provider === 'groq' ? 'gsk_xxxxxxxxxxxx' : 'sk-or-xxxxxxxxxxxx'}
                style={{ ...inputStyle, paddingRight: 44 }}
              />
              <button onClick={() => setShowAiKey(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 14, padding: 4 }}>
                {showAiKey ? '🙈' : '👁'}
              </button>
            </div>
          </Field>

          <div style={{ background: '#080808', border: '1px solid #141414', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#2a2a2a', lineHeight: 1.6 }}>
            Model:{' '}
            <span style={{ color: form.ai_provider === 'groq' ? '#00cc6655' : '#ff8c0055' }}>
              {form.ai_provider === 'groq' ? 'llama-3.3-70b-versatile (free tier available)' : 'openai/gpt-4o-mini'}
            </span>
          </div>
        </Section>

        {/* YouTube API Keys Section */}
        <Section title="🔑 YouTube API Keys (Quota Rotation)">
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7, background: '#0a0a0a', border: '1px solid #141414', borderRadius: 10, padding: '8px 12px' }}>
            💡 Google Cloud Console se multiple projects ke API keys add karo — quota khatam hone par automatically next key use hogi
          </div>

          {apiKeys.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {apiKeys.map(k => (
                <div key={k.id} style={{ background: '#0a0a0a', border: `1px solid ${k.is_active ? '#ff8c0018' : '#ff000018'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: k.is_active ? '#ff8c00' : '#ff4444', marginBottom: 2 }}>
                      {k.is_active ? '🟢' : '🔴'} {k.label}
                    </div>
                    <div style={{ fontSize: 9, color: '#333' }}>
                      Used: {k.use_count || 0} times
                      {k.exhausted_at && <span style={{ color: '#ff4444', marginLeft: 6 }}>• Quota exhausted</span>}
                      {k.last_used_at && <span style={{ marginLeft: 6 }}>• Last: {new Date(k.last_used_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!k.is_active && (
                      <button onClick={() => handleReactivateKey(k.id)}
                        style={{ background: '#001a08', border: '1px solid #44bb6622', color: '#44bb66', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                        ↺ Reset
                      </button>
                    )}
                    <button onClick={() => handleDeleteKey(k.id)}
                      style={{ background: '#100000', border: '1px solid #ff000022', color: '#ff4444', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAddKey ? (
            <div style={{ background: '#0c0c0c', border: '1px solid #252525', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Label (e.g. Project 1, Project 2)"
                style={{ ...inputStyle, fontSize: 12 }}
              />
              <input
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="AIza... (YouTube Data API v3 key)"
                style={{ ...inputStyle, fontSize: 12, fontFamily: 'monospace' }}
              />
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
          ) : (
            <button onClick={() => setShowAddKey(true)}
              style={{ width: '100%', background: '#0a0a0a', border: '1px solid #ff8c0022', color: '#ff8c0066', borderRadius: 10, padding: '11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              + Naya API Key Add Karo
            </button>
          )}
        </Section>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontSize: 14, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? '#0a0a0a' : 'linear-gradient(135deg, #ff8c00, #ff4400)',
            border: saving ? '1px solid #1a1a1a' : 'none',
            color: saving ? '#333' : '#fff',
            boxShadow: saving ? 'none' : '0 4px 24px rgba(255,140,0,0.3)',
            transition: 'all 0.2s',
          }}>
          {saving ? '⏳ Save ho raha hai...' : '💾 Save Settings'}
        </button>

      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#ff8c00', letterSpacing: '0.3px' }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#444', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#ddd',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
