// app/api/ai/route.js
import { createClient } from '@/lib/supabase/server';

export async function POST(request) {
  try {
    const supabase = createClient();

    // ── Auth check ──────────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: 'Login karo pehle' }, { status: 401 });
    }

    // ── Daily reset check ────────────────────────────────────────
    await supabase.rpc('reset_daily_usage');

    // ── User credentials + limits fetch ─────────────────────────
    const { data: creds } = await supabase
      .from('user_credentials')
      .select('is_enabled, daily_limit, total_limit, daily_used, total_used, ai_provider, ai_api_key')
      .eq('user_id', user.id)
      .single();

    // Disabled check
    if (creds?.is_enabled === false) {
      return Response.json({
        error: '🚫 Tumhara account disable hai. Admin se contact karo.',
      }, { status: 403 });
    }

    // Daily limit check
    const dailyUsed  = creds?.daily_used  ?? 0;
    const dailyLimit = creds?.daily_limit ?? 20;
    if (dailyUsed >= dailyLimit) {
      return Response.json({
        error: `⏳ Aaj ki limit khatam ho gayi (${dailyUsed}/${dailyLimit}). Kal phir try karo!`,
      }, { status: 429 });
    }

    // Total limit check
    const totalUsed  = creds?.total_used  ?? 0;
    const totalLimit = creds?.total_limit ?? 500;
    if (totalUsed >= totalLimit) {
      return Response.json({
        error: `🔒 Total limit khatam ho gayi (${totalUsed}/${totalLimit}). Admin se contact karo.`,
      }, { status: 429 });
    }

    // ── AI call ──────────────────────────────────────────────────
    const body = await request.json();
    const { provider, api_key, ...rest } = body;

    if (!api_key) {
      return Response.json({ error: 'API key missing — Settings mein add karo' }, { status: 400 });
    }

    let aiResponse;
    if (provider === 'groq') {
      aiResponse = await handleGroq(rest, api_key);
    } else {
      aiResponse = await handleOpenRouter(rest, api_key);
    }

    // ── Increment usage (only on success) ───────────────────────
    if (aiResponse.ok) {
      await supabase
        .from('user_credentials')
        .upsert({
          user_id:    user.id,
          daily_used: dailyUsed + 1,
          total_used: totalUsed + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    return aiResponse;

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function handleOpenRouter(body, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  'https://yt-tag-manager.vercel.app',
      'X-Title':       'Iswar YouTube Helper',
    },
    body: JSON.stringify({ ...body, stream: false }),
  });

  const data = await res.json();
  if (!res.ok) return Response.json(data, { status: res.status });
  return Response.json(data);
}

async function handleGroq(body, apiKey) {
  const model = body.model?.startsWith('groq/')
    ? body.model.replace('groq/', '')
    : (body.model || 'llama-3.3-70b-versatile');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, model, stream: false }),
  });

  const data = await res.json();
  if (!res.ok) return Response.json(data, { status: res.status });
  return Response.json(data);
}
