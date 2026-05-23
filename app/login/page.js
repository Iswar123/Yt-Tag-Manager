// app/login/page.js
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleGoogleLogin() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    });
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #080808 0%, #0f0a00 100%)',
      padding: 24,
    }}>
      {/* Logo / Title */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🎬</div>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 900,
          background: 'linear-gradient(135deg, #ff8c00, #ff4400)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.5px',
        }}>
          Iswar
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#555', fontWeight: 500 }}>
          YouTube Helper
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: '#0f0f0f', border: '1px solid #1e1e1e',
        borderRadius: 20, padding: 32, width: '100%', maxWidth: 360,
        textAlign: 'center',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#eee' }}>
          Welcome 👋
        </h2>
        <p style={{ margin: '0 0 28px', fontSize: 13, color: '#555', lineHeight: 1.6 }}>
          Apne YouTube channel ke tags AI se generate karo aur update karo
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '13px 20px',
            background: loading ? '#1a1a1a' : '#fff',
            border: '1px solid #333',
            borderRadius: 12, fontSize: 14, fontWeight: 700,
            color: loading ? '#444' : '#111',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'all 0.2s',
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: 16, height: 16, border: '2px solid #333',
                borderTopColor: '#888', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Logging in...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google se Login karo
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
