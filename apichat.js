// ============================================================
// Ved AI — Vercel Serverless API Proxy
// Keeps your Groq keys SECRET on the server side.
//
// SETUP INSTRUCTIONS:
// 1. Go to your Vercel dashboard → Your Project → Settings → Environment Variables
// 2. Add these 5 variables:
//      GROQ_KEY_1  =  your_first_groq_key
//      GROQ_KEY_2  =  your_second_groq_key
//      GROQ_KEY_3  =  your_third_groq_key
//      GROQ_KEY_4  =  your_fourth_groq_key
//      GROQ_KEY_5  =  your_fifth_groq_key
// 3. Deploy — done! Keys are never visible to users.
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Load keys from environment variables (set in Vercel dashboard)
const GROQ_KEYS = [
  process.env.GROQ_KEY_1,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5,
].filter(Boolean); // remove any undefined slots

// Simple round-robin rotation using timestamp
function pickKey() {
  const idx = Math.floor(Date.now() / 60000) % GROQ_KEYS.length;
  return { key: GROQ_KEYS[idx], idx };
}

export default async function handler(req, res) {
  // Allow requests from your frontend only
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (GROQ_KEYS.length === 0) {
    return res.status(500).json({ error: 'No API keys configured. Add GROQ_KEY_1 … GROQ_KEY_5 in Vercel environment variables.' });
  }

  try {
    const body = req.body;

    // Try keys in rotation — if one is rate-limited, try the next
    let lastError = null;
    for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
      const { key, idx } = pickKey();
      const tryKey = GROQ_KEYS[(idx + attempt) % GROQ_KEYS.length];

      const groqRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + tryKey,
        },
        body: JSON.stringify(body),
      });

      const data = await groqRes.json();

      // If rate limited (429), try next key
      if (groqRes.status === 429) {
        lastError = data;
        continue;
      }

      // Any other response (success or real error) — return it
      return res.status(groqRes.status).json(data);
    }

    // All keys exhausted
    return res.status(429).json({ error: 'All API keys are rate limited. Please wait a moment.', detail: lastError });

  } catch (err) {
    console.error('Ved AI proxy error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
