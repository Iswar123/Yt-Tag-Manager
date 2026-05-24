// app/login/page.js
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Tag Generator',
    desc: 'GPT-4 aur Llama se instant YouTube tags generate karo — views badhao automatically',
    color: '#ff8c00',
  },
  {
    icon: '📊',
    title: 'Channel Analytics',
    desc: 'Subscriber count, video stats, aur performance ek jagah dekho',
    color: '#4488ff',
  },
  {
    icon: '✏️',
    title: 'One-Click Tag Update',
    desc: 'AI se tags generate karo aur seedha YouTube pe update karo — copy-paste nahi',
    color: '#00cc66',
  },
  {
    icon: '🔑',
    title: 'API Key Rotation',
    desc: 'Multiple Google API keys add karo — quota khatam hone par automatically next key use hogi',
    color: '#aa44ff',
  },
  {
    icon: '🎬',
    title: 'Video Manager',
    desc: 'Recent 5 videos ek jagah — kisi bhi video ke tags instantly edit karo',
    color: '#ff4488',
  },
  {
    icon: '🔒',
    title: 'Secure & Private',
    desc: 'Tumhara data sirf tumhara — end-to-end secure OAuth, koi data share nahi hota',
    color: '#ffaa00',
  },
];

export default function LoginPage() {
  const [loading,    setLoading]    = useState(false);
  const [mounted,    setMounted]    = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setActiveFeature(p => (p + 1) % FEATURES.length);
    }, 2800);
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
    }}>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse   { 0%,100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.08); } }
        @keyframes float   { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes borderGlow { 0%,100% { border-color: #ff8c0044; } 50% { border-color: #ff8c00aa; } }

        .login-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(255,140,0,0.35) !important;
        }
        .feature-card {
          transition: all 0.3s ease;
        }
        .feature-card:hover {
          transform: translateY(-2px);
          border-color: #ff8c0033 !important;
        }
        .google-btn:hover:not(:disabled) {
          background: #f0f0f0 !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(255,255,255,0.15) !important;
        }
      `}</style>

      {/* Hero Section */}
      <div style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '60px 24px 40px',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Bg glow blobs */}
        <div style={{
          position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
          width: 320, height: 320,
          background: 'radial-gradient(circle, rgba(255,140,0,0.08) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none',
          animation: 'pulse 4s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '-10%',
          width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(68,136,255,0.06) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none',
          animation: 'pulse 5s ease-in-out infinite 1s',
        }} />

        {/* Logo */}
        <div style={{
          animation: mounted ? 'fadeUp 0.6s ease forwards' : 'none',
          textAlign: 'center', marginBottom: 32,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #ff8c00, #ff4400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, boxShadow: '0 12px 40px rgba(255,140,0,0.4)',
            animation: 'float 3s ease-in-out infinite',
          }}>🎬</div>

          <h1 style={{
            margin: 0, fontSize: 32, fontWeight: 900, letterSpacing: '-1px',
            background: 'linear-gradient(135deg, #ff8c00 0%, #ff4400 50%, #ff8c00 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'shimmer 3s linear infinite',
          }}>YT Tag Manager</h1>

          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#555', fontWeight: 500, letterSpacing: '0.2px' }}>
            AI-powered YouTube Tag Studio
          </p>
        </div>

        {/* Active Feature Highlight */}
        <div style={{
          width: '100%', maxWidth: 360, marginBottom: 28,
          animation: mounted ? 'fadeUp 0.6s ease 0.15s forwards' : 'none',
          opacity: 0,
        }}>
          <div style={{
            background: '#0e0e0e',
            border: `1px solid ${FEATURES[activeFeature].color}44`,
            borderRadius: 16, padding: '16px 18px',
            transition: 'border-color 0.5s ease',
            boxShadow: `0 0 30px ${FEATURES[activeFeature].color}11`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                fontSize: 28, lineHeight: 1,
                filter: 'drop-shadow(0 0 8px rgba(255,140,0,0.5))',
              }}>{FEATURES[activeFeature].icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: FEATURES[activeFeature].color, marginBottom: 4 }}>
                  {FEATURES[activeFeature].title}
                </div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                  {FEATURES[activeFeature].desc}
                </div>
              </div>
            </div>
            {/* Dots */}
            <div style={{ display: 'flex', gap: 5, marginTop: 12, justifyContent: 'center' }}>
              {FEATURES.map((_, i) => (
                <div key={i} onClick={() => setActiveFeature(i)} style={{
                  width: i === activeFeature ? 18 : 5,
                  height: 5, borderRadius: 3,
                  background: i === activeFeature ? FEATURES[activeFeature].color : '#222',
                  transition: 'all 0.3s ease', cursor: 'pointer',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Login Button */}
        <div style={{
          width: '100%', maxWidth: 360,
          animation: mounted ? 'fadeUp 0.6s ease 0.3s forwards' : 'none',
          opacity: 0,
        }}>
          <button
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 20px',
              background: loading ? '#1a1a1a' : '#fff',
              border: 'none', borderRadius: 14,
              fontSize: 14, fontWeight: 700,
              color: loading ? '#444' : '#111',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 20px rgba(255,255,255,0.08)',
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
                Google se Login karo
              </>
            )}
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: '#2a2a2a', marginTop: 12, lineHeight: 1.6 }}>
            Login karne se tum hamare Terms aur Privacy Policy se agree karte ho
          </p>
        </div>

        {/* Scroll hint */}
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          animation: mounted ? 'fadeIn 1s ease 1s forwards' : 'none', opacity: 0,
        }}>
          <div style={{ fontSize: 10, color: '#2a2a2a', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
            Features dekhne ke liye scroll karo
          </div>
          <div style={{ fontSize: 16, color: '#333', animation: 'float 1.5s ease-in-out infinite' }}>↓</div>
        </div>
      </div>

      {/* Features Section */}
      <div style={{ padding: '0 20px 60px', maxWidth: 440, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#ff8c0066', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
            Ye sab kar sakte ho
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ddd', letterSpacing: '-0.5px' }}>
            Ek Tool, Sab Kaam
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="feature-card"
              style={{
                background: '#0c0c0c',
                border: '1px solid #161616',
                borderRadius: 14, padding: '14px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: `${f.color}11`,
                border: `1px solid ${f.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>{f.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ddd', marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{ marginTop: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#ff8c0066', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
              Kaise kaam karta hai
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ddd', letterSpacing: '-0.5px' }}>
              3 Steps, Done
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { step: '01', title: 'Google se Login karo', desc: 'Ek click mein — koi password nahi', color: '#ff8c00' },
              { step: '02', title: 'YouTube Connect karo', desc: 'OAuth se secure connection — Settings mein', color: '#4488ff' },
              { step: '03', title: 'AI Tags Generate karo', desc: 'Video select karo → Generate → Update!', color: '#00cc66' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                {/* Line connector */}
                {i < 2 && (
                  <div style={{
                    position: 'absolute', left: 19, top: 44, width: 2, height: 'calc(100% - 12px)',
                    background: 'linear-gradient(to bottom, #1e1e1e, transparent)',
                  }} />
                )}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `${s.color}11`, border: `1px solid ${s.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: s.color, zIndex: 1,
                }}>{s.step}</div>
                <div style={{ paddingBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ddd', marginTop: 10 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{
          background: 'linear-gradient(135deg, #0f0800, #080808)',
          border: '1px solid #ff8c0022', borderRadius: 18, padding: 24,
          textAlign: 'center', marginTop: 32,
          animation: 'borderGlow 3s ease-in-out infinite',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🚀</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#eee', marginBottom: 6 }}>
            Shuru karo aaj se
          </div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 20, lineHeight: 1.6 }}>
            Free hai — bas Google account chahiye
          </div>
          <button
            className="login-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '13px',
              background: loading ? '#111' : 'linear-gradient(135deg, #ff8c00, #ff4400)',
              border: 'none', borderRadius: 12,
              fontSize: 13, fontWeight: 800, color: loading ? '#333' : '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 20px rgba(255,140,0,0.25)',
            }}
          >
            {loading ? '⏳ Redirecting...' : '🎬 Google se Login karo'}
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
