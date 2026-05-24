'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function AdminPanel() {
  const supabase = createClient();
  const router   = useRouter();

  const [loading,      setLoading]      = useState(true);
  const [users,        setUsers]        = useState([]);
  const [stats,        setStats]        = useState(null);
  const [toast,        setToast]        = useState({ msg: '', type: 'info' });
  const [editingUser,  setEditingUser]  = useState(null); // { id, daily_limit, total_limit }
  const [savingLimit,  setSavingLimit]  = useState(false);
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('all'); // all | active | disabled

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin?action=users'),
        fetch('/api/admin?action=stats'),
      ]);
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      if (usersData.users) setUsers(usersData.users);
      if (!statsData.error) setStats(statsData);
    } catch (e) {
      showToast('❌ Load fail: ' + e.message, 'error');
    }
    setLoading(false);
  }

  function showToast(msg, type = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'info' }), 3500);
  }

  async function toggleEnable(userId, currentState) {
    const res  = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:      'set_limits',
        user_id:     editingUser.id,
        daily_limit: editingUser.daily_limit,
        total_limit: editingUser.total_limit,
      }),
    });
    const data = await res.json();
    if (data.error) { showToast('❌ ' + data.error, 'error'); }
    else {
      showToast('✅ Limits save ho gayi!', 'success');
      setUsers(prev => prev.map(u => u.id === editingUser.id
        ? { ...u, daily_limit: editingUser.daily_limit, total_limit: editingUser.total_limit }
        : u
      ));
      setEditingUser(null);
    }
    setSavingLimit(false);
  }

  async function resetUsage(userId, email) {
    if (!confirm(`Reset usage for ${email}?`)) return;
    const res  = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_usage', user_id: userId }),
    });
    const data = await res.json();
    if (data.error) { showToast('❌ ' + data.error, 'error'); return; }
    showToast('🔄 Usage reset ho gaya!', 'success');
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, daily_used: 0, total_used: 0 } : u));
  }

  const filtered = users.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase()) ||
                        u.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ? true :
                        filter === 'active' ? u.is_enabled !== false :
                        u.is_enabled === false;
    return matchSearch && matchFilter;
  });

  const toastColors = {
    success: { bg: '#001a0a', border: '#00cc6633', color: '#00cc66' },
    error:   { bg: '#1a0000', border: '#ff444433', color: '#ff6666' },
    warn:    { bg: '#1a0e00', border: '#ffaa0033', color: '#ffaa00' },
    info:    { bg: '#0a0a0f', border: '#4488ff33', color: '#88aaff' },
  };
  const tc = toastColors[toast.type] || toastColors.info;

  return (
    <div style={{ minHeight: '100vh', background: '#060606', fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>

      {/* Toast */}
      {toast.msg && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 12,
          padding: '10px 20px', fontSize: 13, color: tc.color, zIndex: 9999,
          whiteSpace: 'normal', textAlign: 'center', maxWidth: '90vw',
          boxShadow: '0 4px 24px rgba(0,0,0,0.8)', fontWeight: 700,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Limit Edit Modal */}
      {editingUser && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: '#0e0e0e', border: '1px solid #252525', borderRadius: 18,
            padding: 24, width: '100%', maxWidth: 340,
            boxShadow: '0 24px 80px rgba(0,0,0,0.9)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#ff8c00', marginBottom: 4 }}>
              ✏️ Limits Set Karo
            </div>
            <div style={{ fontSize: 11, color: '#444', marginBottom: 20 }}>
              {editingUser.email}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: '#555', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                  Daily Limit (per din)
                </div>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={editingUser.daily_limit}
                  onChange={e => setEditingUser(p => ({ ...p, daily_limit: parseInt(e.target.value) || 0 }))}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#555', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                  Total Limit (lifetime)
                </div>
                <input
                  type="number"
                  min="0"
                  max="99999"
                  value={editingUser.total_limit}
                  onChange={e => setEditingUser(p => ({ ...p, total_limit: parseInt(e.target.value) || 0 }))}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={saveLimit}
                disabled={savingLimit}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                  cursor: savingLimit ? 'not-allowed' : 'pointer',
                  background: savingLimit ? '#111' : 'linear-gradient(135deg, #ff8c00, #ff4400)',
                  border: 'none', color: savingLimit ? '#333' : '#fff',
                }}
              >
                {savingLimit ? '⏳...' : '💾 Save'}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                style={{
                  padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                  cursor: 'pointer', background: '#111', border: '1px solid #222', color: '#555',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(6,6,6,0.96)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #111',
        padding: '0 16px', height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: 'linear-gradient(135deg, #ff8c00, #ff4400)',
            borderRadius: 8, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900,
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#eee', lineHeight: 1 }}>Admin Panel</div>
            <div style={{ fontSize: 9, color: '#444', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>YT Tag Manager</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={loadAll}
            style={{ background: '#111', border: '1px solid #1e1e1e', color: '#555', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ background: '#111', border: '1px solid #1e1e1e', color: '#555', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            ← Dashboard
          </button>
        </div>
      </div>

      <div style={{ padding: '14px', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <StatCard label="Total Users"   value={stats.total}     icon="👥" color="#4488ff" />
            <StatCard label="Active"        value={stats.active}    icon="✅" color="#00cc66" />
            <StatCard label="Tags Today"    value={stats.todayTags} icon="⚡" color="#ff8c00" />
            <StatCard label="Tags Total"    value={stats.totalTags} icon="📊" color="#aa44ff" />
          </div>
        )}

        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by email or name..."
            style={{ ...inputStyle, flex: 1, fontSize: 12 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'active', 'disabled'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1, padding: '7px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                cursor: 'pointer', transition: 'all 0.15s',
                background: filter === f ? (f === 'disabled' ? '#1a0000' : f === 'active' ? '#001a08' : '#111') : '#0a0a0a',
                border: `1px solid ${filter === f ? (f === 'disabled' ? '#ff000033' : f === 'active' ? '#00cc6633' : '#ff8c0033') : '#161616'}`,
                color: filter === f ? (f === 'disabled' ? '#ff4444' : f === 'active' ? '#00cc66' : '#ff8c00') : '#444',
              }}
            >
              {f === 'all' ? '🌐 All' : f === 'active' ? '✅ Active' : '🚫 Disabled'}
              <span style={{ marginLeft: 5, opacity: 0.6 }}>
                {f === 'all' ? users.length : f === 'active' ? users.filter(u => u.is_enabled !== false).length : users.filter(u => u.is_enabled === false).length}
              </span>
            </button>
          ))}
        </div>

        {/* Users List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 13 }}>
            ⏳ Loading users...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#333', fontSize: 13 }}>
            No users found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(user => (
              <UserCard
                key={user.id}
                user={user}
                onToggle={() => toggleEnable(user.id, user.is_enabled)}
                onEditLimit={() => setEditingUser({ ...user })}
                onReset={() => resetUsage(user.id, user.email)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 10, color: '#222', paddingTop: 8 }}>
          {filtered.length} of {users.length} users shown
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{
      background: '#0c0c0c', border: '1px solid #161616', borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: '#444', fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
    </div>
  );
}

function UserCard({ user, onToggle, onEditLimit, onReset }) {
  const enabled       = user.is_enabled !== false;
  const dailyPercent  = user.daily_limit > 0 ? Math.min(100, (user.daily_used / user.daily_limit) * 100) : 0;
  const totalPercent  = user.total_limit > 0 ? Math.min(100, (user.total_used / user.total_limit) * 100) : 0;
  const joinDate      = user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <div style={{
      background: '#0c0c0c',
      border: `1px solid ${enabled ? '#1a1a1a' : '#2a0000'}`,
      borderRadius: 14, padding: '14px',
      opacity: enabled ? 1 : 0.75,
      transition: 'all 0.2s',
    }}>
      {/* User info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {user.avatar ? (
          <img src={user.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${enabled ? '#ff8c0033' : '#ff000033'}` }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#161616', border: `2px solid ${enabled ? '#ff8c0022' : '#ff000022'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            👤
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name}
          </div>
          <div style={{ fontSize: 10, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </div>
          <div style={{ fontSize: 9, color: '#2a2a2a', marginTop: 1 }}>Joined {joinDate}</div>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '3px 9px',
          color:      enabled ? '#44bb66' : '#ff4444',
          background: enabled ? '#001a08' : '#1a0000',
          border:     `1px solid ${enabled ? '#44bb6622' : '#ff444422'}`,
          whiteSpace: 'nowrap',
        }}>
          {enabled ? '● Active' : '● Disabled'}
        </div>
      </div>

      {/* Usage bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <UsageBar label="Daily" used={user.daily_used} limit={user.daily_limit} percent={dailyPercent} />
        <UsageBar label="Total" used={user.total_used} limit={user.total_limit} percent={totalPercent} />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 10, fontWeight: 800,
            cursor: 'pointer',
            background: enabled ? '#1a0000' : '#001a08',
            border: `1px solid ${enabled ? '#ff000033' : '#00cc6633'}`,
            color: enabled ? '#ff4444' : '#00cc66',
          }}
        >
          {enabled ? '🚫 Disable' : '✅ Enable'}
        </button>
        <button
          onClick={onEditLimit}
          style={{
            flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 10, fontWeight: 800,
            cursor: 'pointer', background: '#0f0800', border: '1px solid #ff8c0033', color: '#ff8c00',
          }}
        >
          ✏️ Set Limits
        </button>
        <button
          onClick={onReset}
          style={{
            flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 10, fontWeight: 800,
            cursor: 'pointer', background: '#080814', border: '1px solid #4488ff33', color: '#4488ff',
          }}
        >
          🔄 Reset
        </button>
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit, percent }) {
  const color = percent >= 90 ? '#ff4444' : percent >= 60 ? '#ffaa00' : '#00cc66';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: '#444', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 800 }}>{used} / {limit}</span>
      </div>
      <div style={{ height: 4, background: '#161616', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${percent}%`,
          background: color,
          borderRadius: 4, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#080808', border: '1px solid #1e1e1e',
  borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#ddd',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
