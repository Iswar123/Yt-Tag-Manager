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
  const [saved,   setSaved]   = useState(false);
  const [toast,   setToast]   = useState('');

  const [form, setForm] = useState({
    channel_id:       '',
    yt_client_id:     '',
    yt_client_secret: '',
    yt_refresh_token: '',
    ai_provider:      'openrouter',
    ai_api_key:       '',
  });

  // Show fields based on provider
  const [showSecret, setShowSecret] = useState(false);
  const [showToken,  setShowToken]  = useState(false);
  const [showAiKey,  setShowAiKey]  = useState(false);

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

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleSave() {
    if (!form.yt_client_id || !form.yt_client_secret || !form.yt_refresh_token) {
      showToast('❌ YouTube credentials fill karo!'); return;
    }
    if (!form.ai_api_key) {
      showToast('❌ AI API key dalo!'); return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('user_credentials')
      .upsert({ user_id: user.id, ...form, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) {
      showToast('❌ Save fail: ' + error.message);
    } else {
      setSaved(true);
      showToast('✅ Settings save ho gayi!');
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808' }}>
      <div style={{ color: '#444', fontSize: 13 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#080808', paddingBottom: 80 }}>

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
        <button onClick={() => router.push('/dashboard')}
          style={{ background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', padding: '4px 8px' }}>
          ← Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#ff8c00' }}>⚙️ Settings</span>
        <button onClick={handleLogout}
          style={{ background: '#1a0000', border: '1px solid #ff000033', color: '#ff4444', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* User info */}
        <div style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.user_metadata?.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: '50%' }} />
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#eee' }}>{user?.user_metadata?.full_name || 'User'}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{user?.email}</div>
          </div>
        </div>

        {/* Setup notice */}
        <div style={{ background: 'rgba(255,140,0,0.06)', border: '1px solid #ff8c0022', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#ff8c00aa', lineHeight: 1.7 }}>
          ⚠️ <strong>Pehli baar?</strong> YouTube OAuth credentials chahiye. Google Cloud Console → Create OAuth 2.0 Client → Refresh Token generate karo.
        </div>

        {/* YouTube Section */}
        <Section title="🎬 YouTube Credentials">
          <Field label="Channel ID (optional)" placeholder="UCxxxxxxxxxxxxxxxx">
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
          <Field label="Refresh Token">
            <PasswordInput value={form.yt_refresh_token} onChange={v => setForm(p => ({ ...p, yt_refresh_token: v }))}
              placeholder="1//xxxxxxxxxxxxxxxxx" show={showToken} toggle={() => setShowToken(p => !p)} />
          </Field>
        </Section>

        {/* AI Section */}
        <Section title="🤖 AI Settings">
          <Field label="AI Provider">
            <div style={{ display: 'flex', gap: 8 }}>
              {['openrouter', 'groq'].map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, ai_provider: p }))}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: form.ai_provider === p ? (p === 'groq' ? '#001a0a' : '#1a0a00') : '#111',
                    border: `1px solid ${form.ai_provider === p ? (p === 'groq' ? '#00ff8844' : '#ff8c0044') : '#222'}`,
                    color: form.ai_provider === p ? (p === 'groq' ? '#00cc66' : '#ff8c00') : '#444',
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
          {form.ai_provider === 'groq' && (
            <div style={{ fontSize: 11, color: '#444', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 }}>
              Model: <span style={{ color: '#00cc66aa' }}>llama3-8b-8192</span> (fast + free tier available)
            </div>
          )}
          {form.ai_provider === 'openrouter' && (
            <div style={{ fontSize: 11, color: '#444', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 }}>
              Model: <span style={{ color: '#ff8c00aa' }}>openai/gpt-4o-mini</span>
            </div>
          )}
        </Section>

        {/* Save Button */}
        <button onClick={handleSave} disabled={saving}
          style={{
            width: '100%', padding: '14px', borderRadius: 14, fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? '#111' : 'linear-gradient(135deg, #ff8c00, #ff4400)',
            border: 'none', color: saving ? '#444' : '#fff',
            boxShadow: saving ? 'none' : '0 4px 20px rgba(255,140,0,0.3)',
            transition: 'all 0.2s',
          }}>
          {saving ? 'Save ho raha hai...' : saved ? '✅ Saved!' : '💾 Save Settings'}
        </button>

      </div>
    </div>
  );
}

// ── Sub-components ──

function Section({ title, children }) {
  return (
    <div style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#ff8c00', marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#555', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
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
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 14, padding: 4 }}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#0a0a0a', border: '1px solid #222',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#eee',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
