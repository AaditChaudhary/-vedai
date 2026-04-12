// ============================================================
// Ved AI — Smart Hybrid Router
// ⚡ Groq  → short/simple messages (fast + free)
// 🧠 Gemini → long content, PDFs, complex tasks (free + smart)
// 🔄 Auto fallback — if one fails, switches to the other!
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ── ROUTER: decides which AI to use ──
function routeMessage(messages) {
  const lastMsg = messages[messages.length - 1];
  const text = typeof lastMsg.content === 'string'
    ? lastMsg.content
    : JSON.stringify(lastMsg.content);

  const totalChars = messages.reduce((acc, m) =>
    acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);

  // Use Gemini for: long content, PDFs, images, files
  const hasImage = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url'));
  const isLong = totalChars > 2000;
  const isComplex = /pdf|document|file|analyze|summarize|translate entire|full report|business plan|legal contract/i.test(text);

  if (hasImage || isLong || isComplex) return 'gemini';
  return 'groq';
}

// ── GROQ CALL ──
async function callGroq(body, keys) {
  const startIdx = Math.floor(Date.now() / 60000) % keys.length;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(startIdx + i) % keys.length];
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: body.messages,
        max_tokens: body.max_tokens || 5000,
        temperature: body.temperature || 0.85
      })
    });
    const data = await res.json();
    if (res.status === 429) continue; // rate limited, try next key
    if (!res.ok) throw new Error(data.error?.message || 'Groq error');
    return data.choices[0].message.content;
  }
  throw new Error('All Groq keys rate limited');
}

// ── GEMINI CALL ──
async function callGemini(body, key) {
  // Convert OpenAI format to Gemini format
  const messages = body.messages.filter(m => m.role !== 'system');
  const systemMsg = body.messages.find(m => m.role === 'system');

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content)
      ? m.content.map(c => c.type === 'text' ? { text: c.text } : { text: '[Image attached]' })
      : [{ text: m.content }]
  }));

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: body.max_tokens || 5000,
      temperature: body.temperature || 0.85
    }
  };

  if (systemMsg) {
    payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Gemini error');
  return data.candidates[0].content.parts[0].text;
}

// ── MAIN HANDLER ──
exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Load keys from Netlify Environment Variables
  const GROQ_KEYS = [
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
  ].filter(Boolean);

  const GEMINI_KEY = process.env.GEMINI_KEY;

  if (GROQ_KEYS.length === 0 && !GEMINI_KEY) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'No API keys configured in Netlify Environment Variables.' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const route = routeMessage(body.messages);
    let reply = '';
    let usedModel = '';

    // Try primary route first, fallback to other
    if (route === 'groq' && GROQ_KEYS.length > 0) {
      try {
        reply = await callGroq(body, GROQ_KEYS);
        usedModel = 'groq';
      } catch (e) {
        // Groq failed → try Gemini
        if (GEMINI_KEY) {
          reply = await callGemini(body, GEMINI_KEY);
          usedModel = 'gemini-fallback';
        } else throw e;
      }
    } else if (route === 'gemini' && GEMINI_KEY) {
      try {
        reply = await callGemini(body, GEMINI_KEY);
        usedModel = 'gemini';
      } catch (e) {
        // Gemini failed → try Groq
        if (GROQ_KEYS.length > 0) {
          reply = await callGroq(body, GROQ_KEYS);
          usedModel = 'groq-fallback';
        } else throw e;
      }
    } else if (GROQ_KEYS.length > 0) {
      reply = await callGroq(body, GROQ_KEYS);
      usedModel = 'groq';
    } else {
      reply = await callGemini(body, GEMINI_KEY);
      usedModel = 'gemini';
    }

    // Return in OpenAI format so frontend works without any changes
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        choices: [{ message: { content: reply, role: 'assistant' } }],
        model: usedModel
      })
    };

  } catch (err) {
    console.error('Ved AI hybrid error:', err);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
};
