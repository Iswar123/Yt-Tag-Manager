// app/admin/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const SECTIONS = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'users',    icon: '👥', label: 'Users' },
  { id: 'logs',     icon: '📋', label: 'Activity' },
];

export default function AdminPanel() {
  const supabase = createClient();
  const router   = useRouter();

  const [section,     setSection]     = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [users,       setUsers]       = useState([]);
  const [stats,       setStats]       = useState(null);
  const [toast,       setToast]       = useState({ msg: '', type: 'info' });
  const [editingUser, setEditingUser] = useState(null);
  const [savingLimit, setSavingLimit] = useState(false);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState('all');
  const [adminUser,   setAdminUser]   = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    loadAll();
    supabase.auth.getUser().then(({ data: { user } }) => setAdminUser(user));
  }, []);

  useEffect(() => { setSidebarOpen(false); }, [section]);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin?action=users'),
        fetch('/api/admin?action=stats'),
      ]);
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      if (usersData.error) showToast('❌ Users: ' + usersData.error, 'error');
      else if (usersData.users) setUsers(usersData.users);
      if (!statsData.error) setStats(statsData);
    } catch (e) {
      showToast('❌ Load failed: ' + e.message, 'error');
    }
    setLoading(false);
  }

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 3500);
  }

  async function toggleEnable(userId) {
    const res  = await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_enable', user_id: userId }),
    });
    const data = await res.json();
    if (data.error) { showToast('❌ ' + data.error, 'error'); return; }
    showToast(data.is_enabled ? '✅ User enabled!' : '🚫 User disabled!', data.is_enabled ? 'success' : 'warn');
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_enabled: data.is_enabled } : u));
    setStats(prev => prev ? {
      ...prev,
      active:   data.is_enabled ? prev.active + 1 : prev.active - 1,
      disabled: data.is_enabled ? prev.disabled - 1 : prev.disabled + 1,
    } : prev);
  }

  async function saveLimit() {
    if (!editingUser) return;
    setSavingLimit(true);
    const res  = await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_limits', user_id: editingUser.id,
        daily_limit: editingUser.daily_limit,
        total_limit: editingUser.total_limit,
      }),
    });
    const data = await res.json();
    if (data.error) showToast('❌ ' + data.error, 'error');
    else {
      showToast('✅ Limits saved!', 'success');
      setUsers(prev => prev.map(u => u.id === editingUser.id
        ? { ...u, daily_limit: editingUser.daily_limit, total_limit: editingUser.total_limit } : u));
      setEditingUser(null);
    }
    setSavingLimit(false);
  }

  async function resetUsage(userId, email) {
    if (!confirm(`Reset usage for ${email}?`)) return;
    const res  = await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_usage', user_id: userId }),
    });
    const data = await res.json();
    if (data.error) { showToast('❌ ' + data.error, 'error'); return; }
    showToast('🔄 Usage reset!', 'success');
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, daily_used: 0, total_used: 0 } : u));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const filtered = users.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase()) ||
                        u.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ? true :
                        filter === 'active' ? u.is_enabled !== false : u.is_enabled === false;
    return matchSearch && matchFilter;
  });

  const toastColors = {
    success: { bg: '#001a0a', border: '#00cc6633', color: '#00cc66' },
    error:   { bg: '#1a0000', border: '#ff444433', color: '#ff6666' },
    warn:    { bg: '#1a0e00', border: '#ffaa0033', color: '#ffaa00' },
    info:    { bg: '#0a0a0f', border: '#4488ff33', color: '#88aaff' },
  };
  const tc = toastColors[toast.type] || toastColors.info;

  const avatar = adminUser?.user_metadata?.avatar_url;
  const name   = adminUser?.user_metadata?.full_name || 'Admin';
  const email  = adminUser?.email || '';

  return (
    <div style={{
      minHeight: '100vh', background: '#060606',
      fontFamily: "'SF Pro Display', -apple-system, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>

      <style>{`
        @keyframes slideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        .action-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .user-card:hover  { border-color: #252525 !important; }
        .nav-item:hover   { background: #111 !important; }
        .profile-menu-btn:hover { background: #161616 !important; }
      `}</style>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 12,
          padding: '10px 20px', fontSize: 13, color: tc.color, zIndex: 9999,
          maxWidth: '90vw', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.8)', fontWeight: 700,
        }}>{toast.msg}</div>
      )}

      {/* Limit Edit Modal */}
      {editingUser && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: '#0e0e0e', border: '1px solid #252525', borderRadius: 20,
            padding: 24, width: '100%', maxWidth: 320,
            boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#eee', marginBottom: 4 }}>✏️ Set Limits</div>
            <div style={{ fontSize: 11, color: '#444', marginBottom: 20 }}>{editingUser.email}</div>

            {[
              { key: 'daily_limit', label: 'Daily Limit (resets every day)', max: 9999 },
              { key: 'total_limit', label: 'Total Lifetime Limit',           max: 99999 },
            ].map(({ key, label, max }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#555', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{label}</div>
                <input
                  type="number" min="0" max={max}
                  value={editingUser[key]}
                  onChange={e => setEditingUser(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={saveLimit} disabled={savingLimit} style={{
                flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                cursor: savingLimit ? 'not-allowed' : 'pointer',
                background: savingLimit ? '#111' : 'linear-gradient(135deg, #ff8c00, #ff4400)',
                border: 'none', color: savingLimit ? '#333' : '#fff',
              }}>
                {savingLimit ? '⏳...' : '💾 Save'}
              </button>
              <button onClick={() => setEditingUser(null)} style={{
                padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                cursor: 'pointer', background: '#111', border: '1px solid #222', color: '#555',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            zIndex: 40, animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 220,
        background: '#0a0a0a', borderRight: '1px solid #111',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: sidebarOpen ? '4px 0 40px rgba(0,0,0,0.8)' : 'none',
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '20px 16px 16px', borderBottom: '1px solid #111',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, #ff8c00, #ff4400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 900, flexShrink: 0,
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#eee' }}>Admin Panel</div>
            <div style={{ fontSize: 9, color: '#444', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>YT Tag Manager</div>
          </div>
        </div>

        {/* Nav Items — only Overview, Users, Activity. NO Dashboard button */}
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className="nav-item"
              onClick={() => setSection(s.id)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 10,
                background: section === s.id ? '#161616' : 'transparent',
                border: `1px solid ${section === s.id ? '#ff8c0022' : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: section === s.id ? '#ff8c00' : '#555',
              }}>{s.label}</span>
              {section === s.id && (
                <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: '50%', background: '#ff8c00' }} />
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer — only logout, NO dashboard button */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid #0e0e0e' }}>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: '#100000', border: '1px solid #ff000022', color: '#ff4444',
            cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>🚪</span> Logout
          </button>
        </div>
      </div>

      {/* ── Top Bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(6,6,6,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #0e0e0e',
        height: 52, padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(p => !p)}
          style={{
            background: sidebarOpen ? '#161616' : '#0e0e0e',
            border: `1px solid ${sidebarOpen ? '#ff8c0033' : '#1a1a1a'}`,
            borderRadius: 8, width: 34, height: 34,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s',
          }}
        >
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: sidebarOpen ? (i === 1 ? 0 : 14) : 14, height: 1.5,
              background: sidebarOpen ? '#ff8c00' : '#555',
              borderRadius: 1, transition: 'all 0.2s',
              transform: sidebarOpen ? (i === 0 ? 'rotate(45deg) translate(3px, 3px)' : i === 2 ? 'rotate(-45deg) translate(3px, -3px)' : 'none') : 'none',
            }} />
          ))}
        </button>

        {/* Section Title */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#eee' }}>
            {SECTIONS.find(s => s.id === section)?.icon} {SECTIONS.find(s => s.id === section)?.label}
          </div>
        </div>

        {/* Refresh */}
        <button onClick={loadAll} style={{
          background: '#0e0e0e', border: '1px solid #1a1a1a', color: '#444',
          borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>🔄</button>

        {/* ── Google-style Profile Avatar + Dropdown ── */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(p => !p)}
            style={{
              background: 'none', border: `2px solid ${profileOpen ? '#ff8c00' : '#2a2a2a'}`,
              padding: 0, cursor: 'pointer', borderRadius: '50%',
              width: 34, height: 34, overflow: 'hidden',
              transition: 'border-color 0.15s', flexShrink: 0,
            }}
          >
            {avatar ? (
              <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#ff8c00,#ff4400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff', fontWeight: 700 }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div style={{
              position: 'absolute', top: 42, right: 0,
              background: '#0e0e0e', border: '1px solid #222',
              borderRadius: 16, width: 230, zIndex: 100,
              boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
              animation: 'fadeIn 0.15s ease', overflow: 'hidden',
            }}>
              {/* Profile Info */}
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #181818', textAlign: 'center' }}>
                {avatar ? (
                  <img src={avatar} alt="" style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid #ff8c0055', margin: '0 auto 10px', display: 'block' }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#ff8c00,#ff4400)', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', fontWeight: 700 }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 800, color: '#eee', marginBottom: 3 }}>{name}</div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#ff8c0011', border: '1px solid #ff8c0033', borderRadius: 20, padding: '3px 10px' }}>
                  <span style={{ fontSize: 8, color: '#ff8c00', fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' }}>⚡ Admin</span>
                </div>
              </div>

              {/* Logout */}
              <div style={{ padding: '6px' }}>
                <button
                  className="profile-menu-btn"
                  onClick={() => { setProfileOpen(false); handleLogout(); }}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    padding: '10px 12px', borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontSize: 15 }}>🚪</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ff4444' }}>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '14px 16px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* OVERVIEW */}
        {section === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ fontSize: 11, color: '#333', fontWeight: 700 }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCard label="Total Users"  value={stats?.total}     icon="👥" color="#4488ff" />
              <StatCard label="Active"       value={stats?.active}    icon="✅" color="#00cc66" />
              <StatCard label="Disabled"     value={stats?.disabled}  icon="🚫" color="#ff4444" />
              <StatCard label="Tags Today"   value={stats?.todayTags} icon="⚡" color="#ff8c00" />
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #0f0800, #080808)',
              border: '1px solid #ff8c0022', borderRadius: 16, padding: '20px',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{ fontSize: 36 }}>📊</div>
              <div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#ff8c00', lineHeight: 1 }}>{stats?.totalTags ?? 0}</div>
                <div style={{ fontSize: 11, color: '#555', fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Total Tags Generated</div>
              </div>
            </div>

            <div style={{ background: '#0c0c0c', border: '1px solid #161616', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#ff8c00', marginBottom: 12 }}>👥 Recent Users</div>
              {loading ? (
                <div style={{ fontSize: 12, color: '#333', textAlign: 'center', padding: 16 }}>Loading...</div>
              ) : users.length === 0 ? (
                <div style={{ fontSize: 12, color: '#333', textAlign: 'center', padding: 16 }}>No users yet</div>
              ) : users.slice(0, 3).map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #0e0e0e' }}>
                  {u.avatar ? (
                    <img src={u.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#161616', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>👤</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: '#444' }}>{u.total_used} tags total</div>
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '2px 8px',
                    color: u.is_enabled !== false ? '#44bb66' : '#ff4444',
                    background: u.is_enabled !== false ? '#001a08' : '#1a0000',
                  }}>{u.is_enabled !== false ? '● Active' : '● Off'}</div>
                </div>
              ))}
              {users.length > 3 && (
                <button onClick={() => setSection('users')} style={{
                  width: '100%', marginTop: 10, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: 'transparent', border: '1px solid #1a1a1a', color: '#444', cursor: 'pointer',
                }}>
                  View all ({users.length} users) →
                </button>
              )}
            </div>
          </div>
        )}

        {/* USERS */}
        {section === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeIn 0.2s ease' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search by email or name..."
              style={{ ...inputStyle, fontSize: 12 }}
            />

            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'all',      label: '🌐 All',      count: users.length },
                { id: 'active',   label: '✅ Active',   count: users.filter(u => u.is_enabled !== false).length },
                { id: 'disabled', label: '🚫 Disabled', count: users.filter(u => u.is_enabled === false).length },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: filter === f.id ? '#111' : '#0a0a0a',
                  border: `1px solid ${filter === f.id ? '#ff8c0033' : '#161616'}`,
                  color: filter === f.id ? '#ff8c00' : '#444',
                }}>
                  {f.label} <span style={{ opacity: 0.5 }}>{f.count}</span>
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 13 }}>⏳ Loading users...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 13 }}>No users found</div>
            ) : filtered.map(user => (
              <UserCard
                key={user.id} user={user}
                onToggle={() => toggleEnable(user.id)}
                onEditLimit={() => setEditingUser({ ...user })}
                onReset={() => resetUsage(user.id, user.email)}
              />
            ))}

            <div style={{ textAlign: 'center', fontSize: 10, color: '#222', paddingTop: 4 }}>
              {filtered.length} of {users.length} users
            </div>
          </div>
        )}

        {/* ACTIVITY */}
        {section === 'logs' && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <div style={{ background: '#0c0c0c', border: '1px solid #161616', borderRadius: 14, padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#555', marginBottom: 8 }}>Activity Logs</div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.6 }}>
                Admin actions are logged here — enable/disable, limit changes, usage resets
              </div>
              <div style={{ marginTop: 16, fontSize: 11, color: '#2a2a2a' }}>
                Supabase → Table Editor → admin_logs
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{ background: '#0c0c0c', border: '1px solid #161616', borderRadius: 12, padding: '14px' }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: '#444', fontWeight: 700, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    </div>
  );
}

function UserCard({ user, onToggle, onEditLimit, onReset }) {
  const enabled  = user.is_enabled !== false;
  const dailyPct = user.daily_limit > 0 ? Math.min(100, (user.daily_used / user.daily_limit) * 100) : 0;
  const totalPct = user.total_limit > 0 ? Math.min(100, (user.total_used / user.total_limit) * 100) : 0;
  const joinDate = user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <div className="user-card" style={{
      background: '#0c0c0c',
      border: `1px solid ${enabled ? '#1a1a1a' : '#2a0000'}`,
      borderRadius: 14, padding: '14px',
      opacity: enabled ? 1 : 0.8, transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {user.avatar ? (
          <img src={user.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${enabled ? '#ff8c0033' : '#ff000033'}`, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#161616', border: `2px solid ${enabled ? '#ff8c0022' : '#ff000022'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>👤</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
          <div style={{ fontSize: 10, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 1 }}>Joined {joinDate}</div>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '3px 9px', flexShrink: 0,
          color: enabled ? '#44bb66' : '#ff4444',
          background: enabled ? '#001a08' : '#1a0000',
          border: `1px solid ${enabled ? '#44bb6622' : '#ff444422'}`,
        }}>
          {enabled ? '● Active' : '● Off'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <UsageBar label="Daily" used={user.daily_used} limit={user.daily_limit} pct={dailyPct} />
        <UsageBar label="Total" used={user.total_used} limit={user.total_limit} pct={totalPct} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: enabled ? '🚫 Disable' : '✅ Enable', onClick: onToggle,     bg: enabled ? '#1a0000' : '#001a08', border: enabled ? '#ff000033' : '#00cc6633', color: enabled ? '#ff4444' : '#00cc66' },
          { label: '✏️ Limits',                          onClick: onEditLimit,  bg: '#0f0800', border: '#ff8c0033', color: '#ff8c00' },
          { label: '🔄 Reset',                           onClick: onReset,      bg: '#080814', border: '#4488ff33', color: '#4488ff' },
        ].map((btn, i) => (
          <button key={i} className="action-btn" onClick={btn.onClick} style={{
            flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 10, fontWeight: 800,
            cursor: 'pointer', background: btn.bg, border: `1px solid ${btn.border}`, color: btn.color,
            transition: 'all 0.15s',
          }}>{btn.label}</button>
        ))}
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit, pct }) {
  const color = pct >= 90 ? '#ff4444' : pct >= 60 ? '#ffaa00' : '#00cc66';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: '#444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 800 }}>{used} / {limit}</span>
      </div>
      <div style={{ height: 4, background: '#161616', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#ddd',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
