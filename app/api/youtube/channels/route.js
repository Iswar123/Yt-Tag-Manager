// app/api/youtube/channels/route.js
import { createClient } from '@/lib/supabase/server';

// GET — user ke saare channels fetch karo
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Login karo' }, { status: 401 });

    const { data, error } = await supabase
      .from('user_channels')
      .select('channel_id, title, avatar_url, is_active')
      .eq('user_id', user.id)
      .order('is_active', { ascending: false });

    if (error) throw new Error(error.message);
    return Response.json({ channels: data || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST — active channel switch karo
export async function POST(req) {
  try {
    const { channel_id } = await req.json();
    if (!channel_id) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Login karo' }, { status: 401 });

    // Sab false karo
    await supabase
      .from('user_channels')
      .update({ is_active: false })
      .eq('user_id', user.id);

    // Selected channel active karo
    await supabase
      .from('user_channels')
      .update({ is_active: true })
      .eq('user_id', user.id)
      .eq('channel_id', channel_id);

    // user_credentials mein bhi sync karo (backward compat)
    await supabase
      .from('user_credentials')
      .update({ channel_id, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
