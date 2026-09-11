const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = document.querySelector(".prompt-input");
const fileInput = document.querySelector("#file-input");
const filePreviewContainer = document.querySelector(".file-preview-container");
const welcomeScreen = document.querySelector(".welcome-screen");
const sendBtn = document.querySelector("#send-prompt-btn");
const modelSelect = document.querySelector("#model-select");

// --- Markdown & Highlight Configuration ---
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
    const validLang = !!(lang && hljs.getLanguage(lang)) ? lang : 'plaintext';
    const highlighted = hljs.highlight(text, { language: validLang }).value;
    return `<div class="code-block-wrapper"><div class="code-header"><span class="code-lang">${validLang}</span><button class="copy-btn" onclick="copyCode(this)"><span class="material-symbols-rounded">content_copy</span> Copy</button></div><pre><code class="hljs ${validLang}">${highlighted}</code></pre></div>`;
};
marked.use({ renderer });

window.copyCode = (btn) => {
    const text = btn.closest('.code-block-wrapper').querySelector('code').innerText;
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<span class="material-symbols-rounded">check</span> Copied!`;
        btn.classList.add('copied');
        setTimeout(() => { btn.innerHTML = originalHtml; btn.classList.remove('copied'); }, 2000);
    });
};

let userMessage = null;
let attachedFile = null; 
let isGenerating = false;
let abortController = null;
let chatHistory = [];

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api/generate-stream' 
    : 'https://ai-chatbot-backend-vzzr.onrender.com/api/generate-stream';

const personaSelect = document.querySelector("#persona-select");
const stopBtn = document.querySelector("#stop-btn");

let sessions = JSON.parse(localStorage.getItem("chatbot_sessions")) || {};
let currentSessionId = localStorage.getItem("chatbot_current_session") || null;

// Initialize or load session
if (!currentSessionId || !sessions[currentSessionId]) {
    createNewSession();
} else {
    chatHistory = sessions[currentSessionId].history || [];
}

function createNewSession() {
    const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
    sessions[newId] = {
        title: "New Chat",
        history: [],
        createdAt: Date.now()
    };
    currentSessionId = newId;
    chatHistory = [];
    saveSessions();
    renderSidebar();
    chatsContainer.innerHTML = "";
    toggleWelcomeScreen();
}

function saveSessions() {
    localStorage.setItem("chatbot_sessions", JSON.stringify(sessions));
    localStorage.setItem("chatbot_current_session", currentSessionId);
}

const chatListContainer = document.getElementById("chat-list");

function renderSidebar() {
    if (!chatListContainer) return;
    chatListContainer.innerHTML = "";
    
    // Sort sessions by createdAt desc
    const sortedSessions = Object.entries(sessions).sort((a, b) => b[1].createdAt - a[1].createdAt);
    
    sortedSessions.forEach(([id, session]) => {
        const item = document.createElement("div");
        item.className = `chat-history-item ${id === currentSessionId ? "active" : ""}`;
        
        item.innerHTML = `
            <span class="title" title="${session.title}">${session.title}</span>
            <button class="delete-session-btn" title="Delete Chat">
                <span class="material-symbols-rounded">delete</span>
            </button>
        `;
        
        item.addEventListener("click", (e) => {
            if (e.target.closest('.delete-session-btn')) {
                deleteSession(id);
            } else {
                switchSession(id);
            }
        });
        
        chatListContainer.appendChild(item);
    });
}

function switchSession(id) {
    if (id === currentSessionId) return;
    if (!sessions[id]) return;
    
    if (isGenerating && abortController) {
        abortController.abort();
        isGenerating = false;
        promptInput.disabled = false;
    }
    
    currentSessionId = id;
    chatHistory = sessions[id].history || [];
    saveSessions();
    renderSidebar();
    
    chatsContainer.innerHTML = "";
    if (chatHistory.length > 0) {
        chatHistory.forEach(msg => {
            if (msg.role === "user") {
                const text = msg.parts[0].text.replace(/\n/g, "<br>");
                const userHtml = `<button class="edit-msg-btn" onclick="editMessage(this)" title="Edit Message"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button><div class="message-content"><p class="message-text">${text}</p></div>`;
                chatsContainer.appendChild(createMessageElement(userHtml, "user-message"));
            } else if (msg.role === "model") {
                const text = marked.parse(msg.parts[0].text, { breaks: true });
                chatsContainer.appendChild(createMessageElement(`<div class="bot-message message"><img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" class="avatar"><div class="message-content"><div class="message-text">${text}</div><button class="speak-btn" onclick="speakText(this)"><span class="material-symbols-rounded">volume_up</span></button></div></div>`, "bot-message"));
            }
        });
    }
    toggleWelcomeScreen();
    setTimeout(scrollToBottom, 100);
    
    if (window.innerWidth <= 768) {
        document.getElementById("sidebar").classList.remove("mobile-open");
    }
}

function deleteSession(id) {
    if (confirm("Are you sure you want to delete this chat?")) {
        delete sessions[id];
        if (id === currentSessionId) {
            const remainingKeys = Object.keys(sessions);
            if (remainingKeys.length > 0) {
                switchSession(remainingKeys[0]);
            } else {
                createNewSession();
            }
        } else {
            saveSessions();
            renderSidebar();
        }
    }
}

// Sidebar toggle & New Chat button
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("toggle-sidebar-btn")?.addEventListener("click", () => {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("hidden");
        if(window.innerWidth <= 768) {
            sidebar.classList.toggle("mobile-open");
        }
    });

    document.getElementById("new-chat-btn")?.addEventListener("click", () => {
        createNewSession();
        if (window.innerWidth <= 768) {
            document.getElementById("sidebar").classList.remove("mobile-open");
        }
    });

    // Render initially
    if (chatHistory.length > 0) {
        chatHistory.forEach(msg => {
            if (msg.role === "user") {
                const text = msg.parts[0].text.replace(/\n/g, "<br>");
                const userHtml = `<button class="edit-msg-btn" onclick="editMessage(this)" title="Edit Message"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button><div class="message-content"><p class="message-text">${text}</p></div>`;
                chatsContainer.appendChild(createMessageElement(userHtml, "user-message"));
            } else if (msg.role === "model") {
                const text = marked.parse(msg.parts[0].text, { breaks: true });
                chatsContainer.appendChild(createMessageElement(`<div class="bot-message message"><img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" class="avatar"><div class="message-content"><div class="message-text">${text}</div><button class="speak-btn" onclick="speakText(this)"><span class="material-symbols-rounded">volume_up</span></button></div></div>`, "bot-message"));
            }
        });
        toggleWelcomeScreen();
        setTimeout(scrollToBottom, 100);
    }
    renderSidebar();
});

// --- VISIBILITY LOGIC (UPDATED) ---
const toggleWelcomeScreen = () => {
    if (chatHistory.length > 0 || isGenerating) {
        welcomeScreen.style.display = "none";
        chatsContainer.style.display = "flex"; // Unhide chat container
    } else {
        welcomeScreen.style.display = "flex";
        chatsContainer.style.display = "none"; // Hide chat container
    }
};

const updateSendBtnState = () => {
    if (promptInput.value.trim() || attachedFile) {
        sendBtn.classList.add("active");
    } else {
        sendBtn.classList.remove("active");
    }
};

promptInput.addEventListener("input", updateSendBtnState);

// --- File Handling ---
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Data = e.target.result.split(',')[1]; 
        attachedFile = { data: base64Data, mime: file.type, preview: e.target.result, name: file.name };
        
        const previewImg = filePreviewContainer.querySelector(".file-preview-img");
        let docPreview = filePreviewContainer.querySelector(".file-preview-doc");
        
        if (file.type.startsWith("image/")) {
            if (docPreview) docPreview.remove();
            previewImg.src = e.target.result;
            previewImg.style.display = "block";
        } else {
            previewImg.style.display = "none";
            if (!docPreview) {
                docPreview = document.createElement("div");
                docPreview.className = "file-preview-doc";
                docPreview.style.cssText = "padding: 10px 15px; background: rgba(255,255,255,0.1); border-radius: 8px; color: #fff; display: flex; align-items: center; gap: 8px; font-size: 0.9rem;";
                filePreviewContainer.querySelector(".file-preview-item").prepend(docPreview);
            }
            docPreview.innerHTML = `<span class="material-symbols-rounded">description</span> <span>${file.name}</span>`;
        }
        
        filePreviewContainer.classList.add("active");
        updateSendBtnState();
    };
    reader.readAsDataURL(file);
});

document.querySelector("#cancel-file-btn").addEventListener("click", () => {
    attachedFile = null;
    fileInput.value = "";
    filePreviewContainer.classList.remove("active");
    const docPreview = filePreviewContainer.querySelector(".file-preview-doc");
    if (docPreview) docPreview.remove();
    updateSendBtnState();
});

document.querySelector("#add-file-btn").addEventListener("click", () => fileInput.click());

// --- Chat Logic ---
const createMessageElement = (html, type) => {
    const div = document.createElement("div");
    div.classList.add("message", type);
    div.innerHTML = html;
    return div;
};

const scrollToBottom = () => {
    chatsContainer.scrollTop = chatsContainer.scrollHeight;
};

const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isGenerating) return;

    userMessage = promptInput.value.trim();
    if (!userMessage && !attachedFile) return;

    isGenerating = true;
    promptInput.value = "";
    promptInput.disabled = true;
    
    sendBtn.style.display = "none";
    stopBtn.style.display = "block";
    
    // Toggle Visibility immediately
    toggleWelcomeScreen();

    const userHtml = `<button class="edit-msg-btn" onclick="editMessage(this)" title="Edit Message"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button><div class="message-content">${attachedFile && attachedFile.mime.startsWith("image/") ? `<img src="${attachedFile.preview}" style="max-width:200px; border-radius:12px; margin-bottom:10px; display:block;">` : (attachedFile ? `<div style="padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px; margin-bottom: 10px; display: inline-flex; align-items: center; gap: 8px;"><span class="material-symbols-rounded">description</span> ${attachedFile.name}</div>` : '')}<p class="message-text">${userMessage.replace(/\n/g, "<br>")}</p></div>`;
    chatsContainer.appendChild(createMessageElement(userHtml, "user-message"));
    scrollToBottom();

    const currentImage = attachedFile;
    attachedFile = null;
    filePreviewContainer.classList.remove("active");
    updateSendBtnState();

    const botHtml = `<div class="bot-message message"><img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" class="avatar"><div class="message-content"><div class="message-text">Thinking...</div><button class="speak-btn" onclick="speakText(this)"><span class="material-symbols-rounded">volume_up</span></button></div></div>`;
    const botMsgDiv = createMessageElement(botHtml, "bot-message");
    botMsgDiv.classList.add("loading");
    chatsContainer.appendChild(botMsgDiv);
    scrollToBottom();

    const textElement = botMsgDiv.querySelector(".message-text");

    try {
        abortController = new AbortController();
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: userMessage,
                history: chatHistory,
                model: modelSelect.value,
                persona: personaSelect.value,
                image: currentImage ? { inlineData: { data: currentImage.data, mimeType: currentImage.mime } } : null,
                sessionId: currentSessionId
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error("API Error");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        
        textElement.innerHTML = ""; 
        botMsgDiv.classList.remove("loading");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            
            for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                        const jsonStr = line.replace("data: ", "");
                        accumulatedText += JSON.parse(jsonStr);
                        textElement.innerHTML = marked.parse(accumulatedText, { breaks: true });
                        scrollToBottom(); 
                    } catch (e) {}
                }
            }
        }
        chatHistory.push({ role: "user", parts: [{ text: userMessage }] });
        chatHistory.push({ role: "model", parts: [{ text: accumulatedText }] });
        
        sessions[currentSessionId].history = chatHistory;
        
        // Auto-title
        if (sessions[currentSessionId].title === "New Chat" && userMessage.length > 0) {
            let title = userMessage.trim().substring(0, 30);
            if (userMessage.length > 30) title += "...";
            sessions[currentSessionId].title = title;
        }
        
        saveSessions();
        renderSidebar();
    } catch (error) {
        textElement.innerHTML = `<span style="color:#ff8a80">Error: ${error.message}</span>`;
        botMsgDiv.classList.remove("loading");
    } finally {
        isGenerating = false;
        promptInput.disabled = false;
        promptInput.focus();
        abortController = null;
        sendBtn.style.display = "block";
        stopBtn.style.display = "none";
    }
};

promptForm.addEventListener("submit", handleFormSubmit);

document.querySelectorAll(".suggestions-item").forEach(item => {
    item.addEventListener("click", () => {
        promptInput.value = item.querySelector(".text").innerText;
        updateSendBtnState();
        promptForm.dispatchEvent(new Event("submit"));
    });
});

document.querySelector("#theme-toggle-btn").addEventListener("click", () => document.body.classList.toggle("light-mode"));
document.querySelector("#delete-chats-btn").addEventListener("click", () => {
    deleteSession(currentSessionId);
});

// --- Stop & Edit Logic ---
stopBtn.addEventListener("click", () => {
    if (abortController) {
        abortController.abort();
        isGenerating = false;
        promptInput.disabled = false;
        sendBtn.style.display = "block";
        stopBtn.style.display = "none";
    }
});

window.editMessage = (btn) => {
    if (isGenerating) return;
    
    const messageDiv = btn.closest(".user-message");
    const messageText = messageDiv.querySelector(".message-text").innerHTML.replace(/<br>/g, "\n");
    
    // Find index
    const allMessages = Array.from(chatsContainer.querySelectorAll(".message"));
    const index = allMessages.indexOf(messageDiv);
    
    // Truncate history
    if (index !== -1) {
        chatHistory = chatHistory.slice(0, index);
        sessions[currentSessionId].history = chatHistory;
        saveSessions();
        
        // Remove from DOM from this index onwards
        for (let i = allMessages.length - 1; i >= index; i--) {
            allMessages[i].remove();
        }
    }
    
    promptInput.value = messageText;
    promptInput.focus();
    updateSendBtnState();
    toggleWelcomeScreen();
};


// ==========================================
// 🎙️ VOICE FEATURES (Mobile + Desktop Safe)
// ==========================================

const micBtn = document.querySelector("#mic-btn");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let hasSubmitted = false;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();

  // ---- MOBILE SAFE SETTINGS ----
  recognition.continuous = false;
  recognition.lang = "en-US";
  recognition.interimResults = false; // IMPORTANT for mobile
  recognition.maxAlternatives = 1;

  let silenceTimer = null;

  const toggleMic = () => {
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      alert("Microphone Error: HTTPS is required.");
      return;
    }

    hasSubmitted = false;

    if (micBtn.classList.contains("listening")) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  micBtn.addEventListener("click", toggleMic);

  // ---- 1. START LISTENING ----
  recognition.onstart = () => {
    micBtn.classList.add("listening");
    promptInput.placeholder = "Listening...";
    promptInput.value = "";
  };

  // ---- 2. RESULT (PRIMARY SEND LOGIC) ----
  recognition.onresult = (event) => {
    clearTimeout(silenceTimer);

    const transcript = event.results[0][0].transcript;
    promptInput.value = transcript;

    updateSendBtnState?.();

    if (!hasSubmitted && event.results[0].isFinal) {
      hasSubmitted = true;

      silenceTimer = setTimeout(() => {
        recognition.stop();

        if (promptInput.value.trim()) {
          console.log("🎤 Final speech detected → Sending");
          promptForm.requestSubmit(); // ✅ mobile-safe
        }
      }, 300);
    }
  };

  // ---- 3. END (FALLBACK SAFETY NET) ----
  recognition.onend = () => {
    micBtn.classList.remove("listening");
    promptInput.placeholder = "Ask Gemini";

    // Mobile fallback
    if (!hasSubmitted && promptInput.value.trim()) {
      hasSubmitted = true;
      console.log("🎤 onend fallback → Sending");
      promptForm.requestSubmit();
    }
  };

  // ---- 4. ERROR HANDLING ----
  recognition.onerror = (event) => {
    console.error("Voice Error:", event.error);
    micBtn.classList.remove("listening");

    if (event.error === "no-speech") {
      promptInput.placeholder = "No speech detected...";
    } else if (event.error === "not-allowed") {
      alert("Microphone blocked. Check browser permissions.");
    } else {
      promptInput.placeholder = "Voice error: " + event.error;
    }
  };
} else {
  // SpeechRecognition not supported
  micBtn.style.display = "none";
}

// ==========================================
// 🔊 TEXT-TO-SPEECH (UNCHANGED, WORKING)
// ==========================================

window.speakText = (btn) => {
  const messageDiv = btn.closest(".message-content");
  if (!messageDiv) return;

  let text = messageDiv.innerText.replace("content_copy Copy", "").trim();

  window.speechSynthesis.cancel();

  document.querySelectorAll(".speak-btn span").forEach((icon) => {
    icon.innerText = "volume_up";
  });

  if (btn.classList.contains("speaking")) {
    btn.classList.remove("speaking");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";

  const iconSpan = btn.querySelector("span");
  iconSpan.innerText = "stop_circle";
  btn.classList.add("speaking");

  utterance.onend = () => {
    iconSpan.innerText = "volume_up";
    btn.classList.remove("speaking");
  };

  window.speechSynthesis.speak(utterance);
};