requireAuth();

document.getElementById("username-display").textContent =
    "Hello, " + localStorage.getItem("username");

const urlParams = new URLSearchParams(window.location.search);
const fileId    = urlParams.get("file_id");
const fileName  = urlParams.get("file_name") || "File";

if (!fileId) window.location.href = "dashboard.html";

document.getElementById("file-info").innerHTML = `
    <strong>${fileName}</strong> — Ask questions about this file's content
`;

let conversationHistory = [];
let conversationSummary = "";

window.onload = async function() {
    await loadHistory();
};

async function loadHistory() {
    try {
        const res  = await fetch(`${API}/chatboard/history/${fileId}`, { headers: authHeaders() });
        const data = await res.json();

        conversationHistory = data.history || [];
        conversationSummary = data.summary || "";

        const container   = document.getElementById("chat-messages");
        const placeholder = document.getElementById("placeholder-text");

        if (conversationHistory.length === 0) {
            if (placeholder) placeholder.style.display = "block";
            return;
        }

        if (placeholder) placeholder.style.display = "none";

        container.innerHTML = conversationHistory.map(msg => {
            if (msg.role === "user") {
                return `
                    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
                        <div style="background:#4a6cf7; color:#fff; padding:10px 14px; border-radius:12px 12px 0 12px; max-width:70%; font-size:14px;">
                            ${msg.content}
                        </div>
                    </div>`;
            } else {
                return ` 
                    <div style="display:flex; justify-content:flex-start; margin-bottom:12px;">
                        <div style="background:#f0f4ff; color:#222; padding:10px 14px; border-radius:12px 12px 12px 0; max-width:70%; font-size:14px; line-height:1.5;">
                            <span style="font-size:11px; color:#4a6cf7; font-weight:700; display:block; margin-bottom:4px;">AI</span>
                            ${msg.content.split('\n').map(line => line.trim() ? `<div style="margin:3px 0;">${line}</div>` : '').join('')}
                        </div>
                    </div>`;
            } 
        }).join("");

        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error("Could not load history", err);
    }
}

async function saveHistory() {
    try {
        await fetch(`${API}/chatboard/history/${fileId}`, {
            method:  "POST",
            headers: authHeaders(),
            body:    JSON.stringify({
                history: conversationHistory,
                summary: conversationSummary
            })
        });
    } catch (err) {
        console.error("Could not save history", err);
    }
}

async function askQuestion() {
    const input    = document.getElementById("question-input");
    const question = input.value.trim();
    if (!question) return;

    const btn = document.getElementById("ask-btn");
    btn.disabled    = true;
    btn.textContent = "Thinking...";

    const container   = document.getElementById("chat-messages");
    const placeholder = document.getElementById("placeholder-text");
    if (placeholder) placeholder.remove();

    container.innerHTML += `
        <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
            <div style="background:#4a6cf7; color:#fff; padding:10px 14px; border-radius:12px 12px 0 12px; max-width:70%; font-size:14px;">
                ${question}
            </div>
        </div>
    `;
    input.value = "";
    container.scrollTop = container.scrollHeight;

    conversationHistory.push({ role: "user", content: question });

    try { 
        const res  = await fetch(`${API}/chatboard/ask/${fileId}`, {
            method:  "POST",
            headers: authHeaders(),  
            body:    JSON.stringify({
                question, 
                history: conversationHistory.slice(0, -1)
            })
        });
        const data = await res.json();

        container.innerHTML += `
            <div style="display:flex; justify-content:flex-start; margin-bottom:12px;">
                <div style="background:#f0f4ff; color:#222; padding:10px 14px; border-radius:12px 12px 12px 0; max-width:70%; font-size:14px; line-height:1.5;">
                    <span style="font-size:11px; color:#4a6cf7; font-weight:700; display:block; margin-bottom:4px;">AI</span>
                    ${data.answer.split('\n').map(line => line.trim() ? `<div style="margin:3px 0;">${line}</div>` : '').join('')}
                </div>
            </div>
        `;
        // Scroll to user question 
        const allMessages = container.querySelectorAll("div[style*='justify-content']");
        const userMessage = allMessages[allMessages.length - 2];
        if (userMessage) userMessage.scrollIntoView({ behavior: "smooth", block: "start" });

        conversationHistory.push({ role: "assistant", content: data.answer });

        // Save to MongoDB after each message
        await saveHistory();

    } catch (err) {
        container.innerHTML += `
            <div style="color:#e74c3c; font-size:13px; padding:8px;">Error: ${err.message}</div>
        `;
    }

    btn.disabled    = false;
    btn.textContent = "Ask";
}

async function clearChatHistory() {
    if (!confirm("Clear all chat history for this file?")) return;
    try {
        await fetch(`${API}/chatboard/history/${fileId}`, {
            method:  "POST",
            headers: authHeaders(),
            body:    JSON.stringify({ history: [], summary: "" })
        });
        conversationHistory = [];
        conversationSummary = "";
        const container = document.getElementById("chat-messages");
        container.innerHTML = `<div id="placeholder-text" style="text-align:center; color:#aaa; font-size:14px; margin-top:120px;">Ask anything about this file...</div>`;
    } catch (err) {
        alert("Could not clear chat");
    }
}