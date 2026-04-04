// ============================================================
// Ved AI — Netlify Serverless Function (Secure API Proxy)
// Your Groq keys stay SECRET on the server — never in HTML!
//
// SETUP INSTRUCTIONS:
// 1. Go to Netlify dashboard → Your Site → Site Configuration
//    → Environment Variables → Add these:
//      GROQ_KEY_1 = your_first_groq_key
//      GROQ_KEY_2 = your_second_groq_key
//      GROQ_KEY_3 = your_third_groq_key
//      GROQ_KEY_4 = your_fourth_groq_key
//      GROQ_KEY_5 = your_fifth_groq_key
// 2. Redeploy — done! Keys never visible to users.
// ============================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

exports.handler = async function(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Load keys from Netlify environment variables
  const GROQ_KEYS = [
    process.env.GROQ_KEY_1,
    process.env.GROQ_KEY_2,
    process.env.GROQ_KEY_3,
    process.env.GROQ_KEY_4,
    process.env.GROQ_KEY_5,
  ].filter(Boolean);

  if (GROQ_KEYS.length === 0) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'No API keys configured. Add GROQ_KEY_1 to GROQ_KEY_5 in Netlify Environment Variables.' })
    };
  }

  try {
    const body = JSON.parse(event.body);

    // Try each key — rotate on rate limit (429)
    let lastError = null;
    const startIdx = Math.floor(Date.now() / 60000) % GROQ_KEYS.length;

    for (let i = 0; i < GROQ_KEYS.length; i++) {
      const key = GROQ_KEYS[(startIdx + i) % GROQ_KEYS.length];

      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      // Rate limited — try next key
      if (response.status === 429) {
        lastError = data;
        continue;
      }

      // Success or real error — return it
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify(data)
      };
    }

    // All keys exhausted
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'All API keys are rate limited. Please wait a moment and try again!', detail: lastError })
    };

  } catch (err) {
    console.error('Ved AI proxy error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    };
  }
};
