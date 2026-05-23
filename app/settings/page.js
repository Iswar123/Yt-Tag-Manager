// app/settings/page.js
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState({ msg: '', type: 'info' });

  const [form, setForm] = useState({
    channel_id:       '',
    yt_client_id:     '',
    yt_client_secret: '',
    yt_refresh_token: '',
    ai_provider:      'openrouter',
    ai_api_key:       '',
  });

  const [showSecret, setShowSecret] = useState(false);
  const [showToken,  setShowToken]  = useState(false);
  const [showAiKey,  setShowAiKey]  = useState(false);

  // OAuth connect flow state
  const [oauthStep, setOauthStep]   = useState('idle'); // idle | waitingCode | fetching
  const [oauthCode, setOauthCode]   = useState('');
  const [oauthError, setOauthError] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUser(user);

    const { data } = await supabase
      .from('user_credentials')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setForm({
        channel_id:       data.channel_id       || '',
        yt_client_id:     data.yt_client_id     || '',
        yt_client_secret: data.yt_client_secret || '',
        yt_refresh_token: data.yt_refresh_token || '',
        ai_provider:      data.ai_provider      || 'openrouter',
        ai_api_key:       data.ai_api_key       || '',
      });
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
    setTimeout(() => setToast({ msg: '', type: 'info' }), 3500);
  }

  async function handleSave() {
    if (!form.yt_client_id || !form.yt_client_secret || !form.yt_refresh_token) {
      showToast('❌ YouTube credentials fill karo!', 'error'); return;
    }
    if (!form.ai_api_key) {
      showToast('❌ AI API key dalo!', 'error'); return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('user_credentials')
      .upsert({ user_id: user.id, ...form, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) {
      showToast('❌ Save fail: ' + error.message, 'error');
    } else {
      showToast('✅ Settings save ho gayi!', 'success');
    }
    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // ── YouTube OAuth Connect ──
  // Step 1: Open Google consent page using the client_id user entered
  function handleOpenOAuth() {
    if (!form.yt_client_id) {
      showToast('⚠️ Pehle Client ID dalo!', 'warn'); return;
    }
    if (!form.yt_client_secret) {
      showToast('⚠️ Pehle Client Secret dalo!', 'warn'); return;
    }
    setOauthError('');

    const redirectUri = 'urn:ietf:wg:oauth:2.0:oob'; // out-of-band — user gets code shown on screen
    const scope = encodeURIComponent([
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' '));

    const authUrl =
      `https://accounts.google.com/o/oauth2/auth` +
      `?client_id=${encodeURIComponent(form.yt_client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=offline` +
      `&prompt=consent`;

    window.open(authUrl, '_blank');
    setOauthStep('waitingCode');
  }

  // Step 2: Exchange auth code for refresh token
  async function handleFetchToken() {
    if (!oauthCode.trim()) {
      setOauthError('Authorization code daalo!'); return;
    }
    setOauthStep('fetching');
    setOauthError('');
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code:          oauthCode.trim(),
          client_id:     form.yt_client_id,
          client_secret: form.yt_client_secret,
          redirect_uri:  'urn:ietf:wg:oauth:2.0:oob',
          grant_type:    'authorization_code',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error_description || data.error);
      if (!data.refresh_token) throw new Error('Refresh token nahi mila — consent screen pe scope sahi set karo');

      setForm(f => ({ ...f, yt_refresh_token: data.refresh_token }));
      setOauthStep('idle');
      setOauthCode('');
      showToast('✅ Refresh Token mil gaya! Ab Save karo.', 'success');
    } catch (e) {
      setOauthError(e.message);
      setOauthStep('waitingCode');
    }
  }

  function cancelOAuth() {
    setOauthStep('idle');
    setOauthCode('');
    setOauthError('');
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808' }}>
      <div style={{ color: '#333', fontSize: 13 }}>Loading...</div>
    </div>
  );

  const tc = toastColors[toast.type] || toastColors.info;
  const ytConnected = !!form.yt_refresh_token;

  return (
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 80 }}>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 12,
          padding: '10px 20px', fontSize: 13, color: tc.color, zIndex: 999,
          whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', fontWeight: 600,
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
          style={{ background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer', padding: '4px 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#ff8c00', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚙️ Settings
        </span>
        <button onClick={handleLogout}
          style={{ background: '#100000', border: '1px solid #ff000022', color: '#ff4444', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ padding: '14px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* User info */}
        <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.user_metadata?.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid #ff8c0033' }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#ddd' }}>{user?.user_metadata?.full_name || 'User'}</div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>{user?.email}</div>
          </div>
          <div style={{ fontSize: 10, color: ytConnected ? '#44bb66' : '#666', background: ytConnected ? '#001a08' : '#111', border: `1px solid ${ytConnected ? '#44bb6622' : '#222'}`, borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>
            {ytConnected ? '✅ YT Connected' : '⬡ Not Connected'}
          </div>
        </div>

        {/* YouTube Section */}
        <Section title="🎬 YouTube Credentials">

          {/* Notice */}
          <div style={{ background: 'rgba(255,140,0,0.04)', border: '1px solid #ff8c0015', borderRadius: 10, padding: '10px 12px', fontSize: 11, color: '#ff8c0077', lineHeight: 1.7 }}>
            ⚠️ <strong style={{ color: '#ff8c00aa' }}>Pehli baar?</strong> Google Cloud Console → OAuth 2.0 Client → Client ID & Secret copy karo. Phir neeche "Connect YouTube" dabao.
          </div>

          <Field label="Channel ID (optional)">
            <input value={form.channel_id} onChange={e => setForm(p => ({ ...p, channel_id: e.target.value }))}
              placeholder="UCxxxxxxxxxxxxxxxx" style={inputStyle} />
          </Field>

          <Field label="Client ID">
            <input value={form.yt_client_id} onChange={e => setForm(p => ({ ...p, yt_client_id: e.target.value }))}
              placeholder="xxxx.apps.googleusercontent.com" style={inputStyle} />
          </Field>

          <Field label="Client Secret">
            <PasswordInput value={form.yt_client_secret} onChange={v => setForm(p => ({ ...p, yt_client_secret: v }))}
              placeholder="GOCSPX-xxxxxxxxx" show={showSecret} toggle={() => setShowSecret(p => !p)} />
          </Field>

          {/* ── Connect YouTube Button ── */}
          {oauthStep === 'idle' && (
            <button onClick={handleOpenOAuth}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, fontSize: 13, fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'linear-gradient(135deg, #001a0a, #001408)',
                border: '1px solid #00cc6633',
                color: '#00cc66',
                boxShadow: ytConnected ? 'none' : '0 0 20px rgba(0,204,102,0.08)',
                transition: 'all 0.2s',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {ytConnected ? '🔄 Re-connect YouTube' : '🔗 Connect YouTube'}
            </button>
          )}

          {/* OAuth Step: Waiting for code */}
          {(oauthStep === 'waitingCode' || oauthStep === 'fetching') && (
            <div style={{ background: '#080f08', border: '1px solid #00cc6622', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#00cc66', fontWeight: 800, marginBottom: 2 }}>
                📋 Step 2: Code Copy Karo
              </div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7 }}>
                Google ka page khul gaya hoga. Allow karo, phir jo <strong style={{ color: '#aaa' }}>Authorization Code</strong> screen pe dikhega woh yahan paste karo:
              </div>
              <input
                value={oauthCode}
                onChange={e => setOauthCode(e.target.value)}
                placeholder="4/0AX4XfWi... paste karo"
                style={{ ...inputStyle, borderColor: oauthCode ? '#00cc6633' : '#222', fontFamily: 'monospace', fontSize: 11 }}
                autoFocus
              />
              {oauthError && (
                <div style={{ background: '#100000', border: '1px solid #ff000022', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ff5555', lineHeight: 1.6 }}>
                  ❌ {oauthError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cancelOAuth}
                  style={{ flex: 1, background: '#0a0a0a', border: '1px solid #222', color: '#555', borderRadius: 10, padding: '10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleFetchToken} disabled={oauthStep === 'fetching' || !oauthCode.trim()}
                  style={{ flex: 2, background: oauthStep === 'fetching' ? '#0a0a0a' : 'linear-gradient(135deg,#001a0a,#000f06)', border: '1px solid #00cc6633', color: oauthStep === 'fetching' ? '#333' : '#00cc66', borderRadius: 10, padding: '10px', fontSize: 12, fontWeight: 800, cursor: oauthStep === 'fetching' ? 'not-allowed' : 'pointer' }}>
                  {oauthStep === 'fetching' ? '⏳ Fetching...' : '✅ Token Fetch Karo'}
                </button>
              </div>
            </div>
          )}

          <Field label="Refresh Token">
            <PasswordInput value={form.yt_refresh_token} onChange={v => setForm(p => ({ ...p, yt_refresh_token: v }))}
              placeholder="1//xxxxxxxxxxxxxxxxx (ya Connect YouTube se auto-fill)" show={showToken} toggle={() => setShowToken(p => !p)} />
          </Field>

          {ytConnected && (
            <div style={{ background: '#001a08', border: '1px solid #00cc6622', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#44bb66', display: 'flex', alignItems: 'center', gap: 6 }}>
              ✅ Refresh Token set hai — YouTube se connected!
            </div>
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
            <PasswordInput
              value={form.ai_api_key}
              onChange={v => setForm(p => ({ ...p, ai_api_key: v }))}
              placeholder={form.ai_provider === 'groq' ? 'gsk_xxxxxxxxxxxx' : 'sk-or-xxxxxxxxxxxx'}
              show={showAiKey} toggle={() => setShowAiKey(p => !p)}
            />
          </Field>

          <div style={{ background: '#080808', border: '1px solid #141414', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: '#333', lineHeight: 1.6 }}>
            Model:{' '}
            <span style={{ color: form.ai_provider === 'groq' ? '#00cc6677' : '#ff8c0077' }}>
              {form.ai_provider === 'groq' ? 'llama3-8b-8192' : 'openai/gpt-4o-mini'}
            </span>
            {form.ai_provider === 'groq' && <span style={{ color: '#2a2a2a' }}> — free tier available</span>}
          </div>
        </Section>

        {/* Save Button */}
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

// ── Sub-components ──

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

function PasswordInput({ value, onChange, placeholder, show, toggle }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      <button onClick={toggle}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 14, padding: 4, display: 'flex', alignItems: 'center' }}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#ddd',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 0.2s',
};
