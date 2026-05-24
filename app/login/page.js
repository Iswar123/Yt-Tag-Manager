// app/login/page.js
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const FEATURES = [
  { icon: '🤖', title: 'AI Tag Generator',  desc: 'Generate instant YouTube tags with GPT-4 and Llama — boost your views automatically', color: '#ff8c00' },
  { icon: '📊', title: 'Channel Analytics', desc: 'View subscriber count, video stats, and performance all in one place',               color: '#4488ff' },
  { icon: '✏️', title: 'One-Click Update',  desc: 'Generate tags with AI and update directly to YouTube — no copy-paste needed',        color: '#00cc66' },
  { icon: '🔑', title: 'API Key Rotation',  desc: 'Add multiple Google API keys — auto-switches when quota runs out',                   color: '#aa44ff' },
  { icon: '🎬', title: 'Video Manager',     desc: 'Your recent 5 videos in one place — instantly edit tags for any video',             color: '#ff4488' },
  { icon: '🔒', title: 'Secure & Private',  desc: 'Your data stays yours — end-to-end secure OAuth, nothing is shared',                color: '#ffaa00' },
];

const ACTIVITY_ITEMS = [
  { icon: '🔍', text: 'Fetching video data...',      color: '#4488ff' },
  { icon: '🤖', text: 'AI generating tags...',       color: '#aa44ff' },
  { icon: '✅', text: 'Tags updated on YouTube',     color: '#00cc66' },
  { icon: '⚡', text: '16 SEO tags generated',       color: '#ff8c00' },
  { icon: '📊', text: 'Channel analytics loaded',    color: '#4488ff' },
  { icon: '🔄', text: 'Refreshing video list...',    color: '#ffaa00' },
  { icon: '🎯', text: 'Tags optimized for search',   color: '#00cc66' },
  { icon: '🏷️', text: 'Tags applied: travel vlog',  color: '#ff8c00' },
  { icon: '🔑', text: 'API key rotated',             color: '#aa44ff' },
  { icon: '📈', text: 'SEO score improved',          color: '#00cc66' },
];

function ActivityFeed() {
  const [items, setItems] = useState([
    { ...ACTIVITY_ITEMS[0], id: 1, ts: '11:14 AM' },
  ]);

  useEffect(() => {
    let index = 1;
    const interval = setInterval(() => {
      const item = ACTIVITY_ITEMS[index % ACTIVITY_ITEMS.length];
      const ts = new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
      setItems(prev => [{ ...item, id: Date.now(), ts }, ...prev].slice(0, 4));
      index++;
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      background: 'rgba(10,10,10,0.7)',
      border: '1px solid #1e1e1e',
      borderRadius: 14, padding: '12px 14px',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ fontSize: 9, color: '#ff8c0066', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
        ● Live Activity
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 0',
            borderBottom: i < items.length - 1 ? '1px solid #111' : 'none',
            opacity: 1 - i * 0.18,
            animation: i === 0 ? 'slideDown 0.35s ease' : 'none',
          }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 11, color: item.color, fontWeight: 600, flex: 1 }}>{item.text}</span>
            <span style={{ fontSize: 9, color: '#2a2a2a', flexShrink: 0 }}>{item.ts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [loading,       setLoading]       = useState(false);
  const [mounted,       setMounted]       = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setActiveFeature(p => (p + 1) % FEATURES.length), 2800);
    return () => clearInterval(interval);
  }, []);

  async function handleGoogleLogin() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    });
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060606',
      overflowY: 'auto',
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
    }}>

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes fadeUp    { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse     { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.06); } }
        @keyframes float     { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
        @keyframes shimmer   { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gridMove  { from { transform: translateY(0); } to { transform: translateY(40px); } }
        @keyframes borderPulse { 0%,100% { border-color: #ff8c0033; } 50% { border-color: #ff8c0088; } }

        .google-btn:hover:not(:disabled) {
          background: #f0f0f0 !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(255,255,255,0.18) !important;
        }
        .google-btn:active:not(:disabled) { transform: translateY(0px); }
        .feature-card:hover { transform: translateY(-2px); border-color: #ff8c0033 !important; }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(255,140,0,0.4) !important;
        }
      `}</style>

      {/* ── Animated grid background ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none',
      }}>
        {/* Grid lines */}
        <div style={{
          position: 'absolute', inset: '-40px',
          backgroundImage: `
            linear-gradient(rgba(255,140,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,140,0,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          animation: 'gridMove 8s linear infinite',
        }} />
        {/* Orange radial top */}
        <div style={{
          position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(255,140,0,0.12) 0%, transparent 65%)',
          animation: 'pulse 5s ease-in-out infinite',
        }} />
        {/* Blue radial bottom-right */}
        <div style={{
          position: 'absolute', bottom: '-5%', right: '-10%',
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(68,136,255,0.08) 0%, transparent 65%)',
          animation: 'pulse 6s ease-in-out infinite 1.5s',
        }} />
        {/* Purple radial bottom-left */}
        <div style={{
          position: 'absolute', bottom: '20%', left: '-5%',
          width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(170,68,255,0.06) 0%, transparent 65%)',
          animation: 'pulse 7s ease-in-out infinite 0.5s',
        }} />
      </div>

      {/* ── Hero Section ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px 32px',
      }}>

        {/* Logo */}
        <div style={{
          textAlign: 'center', marginBottom: 24,
          animation: mounted ? 'fadeUp 0.5s ease forwards' : 'none',
          opacity: 0,
        }}>
          <div style={{
            width: 68, height: 68, borderRadius: 20, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #ff8c00, #ff4400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, boxShadow: '0 0 40px rgba(255,140,0,0.5), 0 12px 40px rgba(0,0,0,0.4)',
            animation: 'float 3s ease-in-out infinite',
          }}>🎬</div>

          <h1 style={{
            margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-1px',
            background: 'linear-gradient(135deg, #ff8c00 0%, #ff4400 50%, #ff8c00 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'shimmer 3s linear infinite',
          }}>YT Tag Manager</h1>

          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#555', fontWeight: 500 }}>
            AI-powered YouTube Tag Studio
          </p>
        </div>

        {/* Live Activity */}
        <div style={{
          width: '100%', maxWidth: 360, marginBottom: 16,
          animation: mounted ? 'fadeUp 0.5s ease 0.1s forwards' : 'none',
          opacity: 0,
        }}>
          <ActivityFeed />
        </div>

        {/* Feature Carousel */}
        <div style={{
          width: '100%', maxWidth: 360, marginBottom: 20,
          animation: mounted ? 'fadeUp 0.5s ease 0.2s forwards' : 'none',
          opacity: 0,
        }}>
          <div style={{
            background: 'rgba(14,14,14,0.85)',
            border: `1px solid ${FEATURES[activeFeature].color}44`,
            borderRadius: 16, padding: '14px 16px',
            backdropFilter: 'blur(8px)',
            boxShadow: `0 0 30px ${FEATURES[activeFeature].color}0d`,
            transition: 'border-color 0.4s, box-shadow 0.4s',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 26 }}>{FEATURES[activeFeature].icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: FEATURES[activeFeature].color, marginBottom: 3 }}>
                  {FEATURES[activeFeature].title}
                </div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                  {FEATURES[activeFeature].desc}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 10, justifyContent: 'center' }}>
              {FEATURES.map((_, i) => (
                <div key={i} onClick={() => setActiveFeature(i)} style={{
                  width: i === activeFeature ? 18 : 5, height: 5, borderRadius: 3,
                  background: i === activeFeature ? FEATURES[activeFeature].color : '#222',
                  transition: 'all 0.3s', cursor: 'pointer',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Login Button — visible, not hidden ── */}
        <div style={{
          width: '100%', maxWidth: 360,
          animation: mounted ? 'fadeUp 0.5s ease 0.3s forwards' : 'none',
          opacity: 0,
        }}>
          {/* Google sign in */}
          <button
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 20px',
              background: loading ? '#1a1a1a' : '#ffffff',
              border: 'none', borderRadius: 14,
              fontSize: 14, fontWeight: 700,
              color: loading ? '#444' : '#111',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 24px rgba(255,255,255,0.1), 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: 16, height: 16, border: '2px solid #333',
                  borderTopColor: '#888', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Redirecting...
              </>
            ) : (
              <>
                <GoogleIcon />
                Continue with Google
              </>
            )}
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: '#2a2a2a', marginTop: 10, lineHeight: 1.6 }}>
            By signing in you agree to our Terms and Privacy Policy
          </p>
        </div>
      </div>

      {/* ── Features List (scroll karke dekho) ── */}
      <div style={{ position: 'relative', zIndex: 1, padding: '0 20px 60px', maxWidth: 440, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#ff8c0055', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
            Everything you need
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#ccc', letterSpacing: '-0.5px' }}>
            One Tool, All Tasks
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="feature-card" style={{
              background: 'rgba(12,12,12,0.8)',
              border: '1px solid #161616', borderRadius: 14, padding: '12px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 12,
              backdropFilter: 'blur(4px)', transition: 'all 0.25s',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: `${f.color}11`, border: `1px solid ${f.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>{f.icon}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ddd', marginBottom: 3 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{ marginTop: 36 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#ff8c0055', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>How it works</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#ccc' }}>3 Steps, Done</h2>
          </div>
          {[
            { step: '01', title: 'Sign in with Google', desc: 'One click — no password needed',        color: '#ff8c00' },
            { step: '02', title: 'Connect YouTube',     desc: 'Secure OAuth — inside Settings',        color: '#4488ff' },
            { step: '03', title: 'Generate AI Tags',    desc: 'Select video → Generate → Update!',     color: '#00cc66' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, position: 'relative' }}>
              {i < 2 && <div style={{ position: 'absolute', left: 17, top: 42, width: 2, height: 'calc(100% - 10px)', background: 'linear-gradient(to bottom, #1e1e1e, transparent)' }} />}
              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${s.color}11`, border: `1px solid ${s.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: s.color, zIndex: 1 }}>{s.step}</div>
              <div style={{ paddingBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ddd', marginTop: 8 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{
          background: 'linear-gradient(135deg, #0f0800, #080808)',
          border: '1px solid #ff8c0022', borderRadius: 18, padding: 22,
          textAlign: 'center', marginTop: 28,
          animation: 'borderPulse 3s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>🚀</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#eee', marginBottom: 5 }}>Get started today</div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 18, lineHeight: 1.6 }}>Free — just a Google account required</div>
          <button className="login-btn" onClick={handleGoogleLogin} disabled={loading} style={{
            width: '100%', padding: '13px',
            background: loading ? '#111' : 'linear-gradient(135deg, #ff8c00, #ff4400)',
            border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 800,
            color: loading ? '#333' : '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', boxShadow: '0 4px 20px rgba(255,140,0,0.25)',
          }}>
            {loading ? '⏳ Redirecting...' : '🎬 Continue with Google'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
