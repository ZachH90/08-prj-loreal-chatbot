/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

/* Local storage keys */
const CHAT_HISTORY_KEY = "lorealChatHistory";
const USER_NOTES_KEY = "lorealUserNotes";

/* System instructions */
const systemPrompt =
  "You are a beginner-friendly L'Oreal beauty assistant. Your scope is only L'Oreal products and beauty/body care topics such as skincare, makeup, haircare, fragrance, scalp care, and body care. If a request is outside this scope, politely refuse in one sentence and ask a beauty-related follow-up question.";

/* Load saved data so future messages can reference past user details */
let chatHistory = loadJson(CHAT_HISTORY_KEY, []);
let userNotes = loadJson(USER_NOTES_KEY, []);

// Restore old chat messages if they exist. Otherwise show the starter message.
if (chatHistory.length > 0) {
  chatHistory.forEach((message) => {
    if (message.role === "user") addMessage("user", message.content);
    if (message.role === "assistant") addMessage("ai", message.content);
  });
} else {
  addMessage(
    "ai",
    "Hello! I can suggest L'Oreal products and routines. Tell me your goal, skin type, hair type, or preferred makeup look.",
  );
}

// Use your Cloudflare Worker URL if available in secrets.js.
// Example in secrets.js: const WORKER_URL = "https://your-worker-url.workers.dev";
const apiUrl = typeof WORKER_URL !== "undefined" ? WORKER_URL : "";

// Creates a message bubble and appends it to the chat window.
function addMessage(role, content) {
  const msg = document.createElement("div");
  msg.classList.add("msg", role);
  msg.textContent = content;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Safely load JSON from localStorage.
function loadJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    console.error("Could not parse localStorage value:", error);
    return fallbackValue;
  }
}

// Save chat history and user notes for future messages.
function saveLocalData() {
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
  localStorage.setItem(USER_NOTES_KEY, JSON.stringify(userNotes));
}

// Keep short user notes that help the chatbot remember preferences.
function saveUserNote(text) {
  userNotes.push(text);
  if (userNotes.length > 20) {
    userNotes = userNotes.slice(-20);
  }
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const inputText = userInput.value.trim();
  if (!inputText) return;

  addMessage("user", inputText);
  userInput.value = "";

  // Save the user's message into running history and long-term notes.
  chatHistory.push({ role: "user", content: inputText });
  saveUserNote(inputText);
  saveLocalData();

  if (!apiUrl) {
    addMessage(
      "ai",
      "Please add your WORKER_URL in secrets.js so I can connect to the API.",
    );
    return;
  }

  try {
    const notesPrompt =
      userNotes.length > 0
        ? `Saved user details from earlier messages: ${userNotes.join(" | ")}`
        : "No saved user details yet.";

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: notesPrompt },
      ...chatHistory,
    ];

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, temperature: 0.7 }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error: ${response.status}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
        if (errorData.details) {
          errorMessage += ` - ${errorData.details}`;
        }
      } catch (parseError) {
        const errorText = await response.text();
        if (errorText) {
          errorMessage = errorText;
        }
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error(
        "The worker returned a response, but it did not include a chat message.",
      );
    }
    const aiReply = data.choices[0].message.content;

    addMessage("ai", aiReply);
    chatHistory.push({ role: "assistant", content: aiReply });
    saveLocalData();
  } catch (error) {
    console.error("API request failed:", error);
    addMessage(
      "ai",
      `I couldn't get a valid reply from the worker: ${error.message}`,
    );
  }
});
