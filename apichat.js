export default async function handler(req, res) {
  try {
    const userMessage = req.body.messages[0].content;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userMessage }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    res.status(200).json({
      choices: [
        {
          message: {
            content: reply
          }
        }
      ]
    });

  } catch (error) {
    res.status(500).json({ error: "API error" });
  }
}