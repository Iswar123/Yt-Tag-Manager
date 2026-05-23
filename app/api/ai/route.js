// app/api/ai/route.js
export async function POST(request) {
  try {
    const body = await request.json();
    const { provider, api_key, ...rest } = body;

    if (!api_key) {
      return Response.json({ error: 'API key missing — Settings mein add karo' }, { status: 400 });
    }

    if (provider === 'groq') {
      return handleGroq(rest, api_key);
    }
    return handleOpenRouter(rest, api_key);

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
      'HTTP-Referer':  'https://iswar-youtube-helper.vercel.app',
      'X-Title':       'Iswar YouTube Helper',
    },
    body: JSON.stringify({ ...body, stream: false }),
  });

  const data = await res.json();
  if (!res.ok) return Response.json(data, { status: res.status });
  return Response.json(data);
}

async function handleGroq(body, apiKey) {
  // Groq uses same OpenAI-compatible format
  const model = body.model?.startsWith('groq/') ? body.model.replace('groq/', '') : 'llama3-8b-8192';

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
