// app/api/admin/route.js
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

async function verifyAdmin(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  if (user.email !== ADMIN_EMAIL) return null;
  return user;
}

export async function GET(req) {
  try {
    const supabase = createClient();
    const admin = await verifyAdmin(supabase);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'users';

    if (action === 'users') {
      // Supabase auth.users + user_credentials join
      const { data: credentials, error } = await supabase
        .from('user_credentials')
        .select('user_id, channel_id, is_enabled, daily_limit, total_limit, daily_used, total_used, last_reset_at, joined_at, updated_at');

      if (error) throw new Error(error.message);

      // Auth users fetch karo (email ke liye)
      const { data: authData } = await supabase.auth.admin.listUsers();
      const authUsers = authData?.users || [];

      // Merge karo
      const users = (credentials || []).map(cred => {
        const authUser = authUsers.find(u => u.id === cred.user_id);
        return {
          id:          cred.user_id,
          email:       authUser?.email || 'Unknown',
          avatar:      authUser?.user_metadata?.avatar_url || null,
          name:        authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'User',
          channel_id:  cred.channel_id,
          is_enabled:  cred.is_enabled ?? true,
          daily_limit: cred.daily_limit ?? 20,
          total_limit: cred.total_limit ?? 500,
          daily_used:  cred.daily_used ?? 0,
          total_used:  cred.total_used ?? 0,
          last_reset:  cred.last_reset_at,
          joined_at:   cred.joined_at || cred.updated_at,
        };
      });

      return NextResponse.json({ users });
    }

    if (action === 'stats') {
      const { data: creds } = await supabase
        .from('user_credentials')
        .select('is_enabled, daily_used, total_used, daily_limit, total_limit');

      const total      = creds?.length || 0;
      const active     = creds?.filter(c => c.is_enabled !== false).length || 0;
      const disabled   = total - active;
      const totalTags  = creds?.reduce((s, c) => s + (c.total_used || 0), 0) || 0;
      const todayTags  = creds?.reduce((s, c) => s + (c.daily_used || 0), 0) || 0;

      return NextResponse.json({ total, active, disabled, totalTags, todayTags });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const supabase = createClient();
    const admin = await verifyAdmin(supabase);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await req.json();
    const { action, user_id } = body;

    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    // Daily reset check
    await supabase.rpc('reset_daily_usage');

    if (action === 'toggle_enable') {
      const { data: current } = await supabase
        .from('user_credentials')
        .select('is_enabled')
        .eq('user_id', user_id)
        .single();

      const newState = !(current?.is_enabled ?? true);

      await supabase
        .from('user_credentials')
        .upsert({ user_id, is_enabled: newState, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

      // Log
      await supabase.from('admin_logs').insert({
        admin_email: admin.email,
        action: newState ? 'enable_user' : 'disable_user',
        target_user: user_id,
        details: { is_enabled: newState },
      });

      return NextResponse.json({ success: true, is_enabled: newState });
    }

    if (action === 'set_limits') {
      const { daily_limit, total_limit } = body;
      if (daily_limit == null || total_limit == null)
        return NextResponse.json({ error: 'daily_limit aur total_limit dono chahiye' }, { status: 400 });

      await supabase
        .from('user_credentials')
        .upsert({
          user_id,
          daily_limit: parseInt(daily_limit),
          total_limit: parseInt(total_limit),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      await supabase.from('admin_logs').insert({
        admin_email: admin.email,
        action: 'set_limits',
        target_user: user_id,
        details: { daily_limit, total_limit },
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'reset_usage') {
      await supabase
        .from('user_credentials')
        .upsert({
          user_id,
          daily_used: 0,
          total_used: 0,
          last_reset_at: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      await supabase.from('admin_logs').insert({
        admin_email: admin.email,
        action: 'reset_usage',
        target_user: user_id,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
