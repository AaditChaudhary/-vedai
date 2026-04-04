async function sendMessage() {
  const userInput = document.getElementById("input").value;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        { role: "user", content: userInput }
      ]
    })
  });

  const data = await response.json();
  console.log(data);

  document.getElementById("output").innerText =
    data.choices?.[0]?.message?.content || "No response";
}