requireAuth();

const urlParams = new URLSearchParams(window.location.search);
const fileId    = urlParams.get("file_id");
const projectId = urlParams.get("project_id");

if (!fileId) window.location.href = "dashboard.html";

window.onload = function () {
    loadFileContent();
    loadComments();
};

async function loadFileContent() {
    try {
        const res  = await fetch(`${API}/files/content/${fileId}`, { headers: authHeaders() });
        const data = await res.json();
        document.getElementById("code-content").textContent  = data.content;
        document.getElementById("review-title").textContent  = "AI Review — " + data.filename;
    } catch (err) {
        document.getElementById("code-content").textContent = "Failed to load file.";
    }
}

async function runReview() {
    document.getElementById("review-loading").style.display = "block";
    document.getElementById("review-result").style.display  = "none";

    try {
        const res  = await fetch(`${API}/review/analyze/${fileId}`, {
            method: "POST",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Review failed");

        displayReview(data.result);
    } catch (err) {
        alert("Review failed: " + err.message);
    } finally {
        document.getElementById("review-loading").style.display = "none";
    }
}

function displayReview(result) {
    document.getElementById("review-result").style.display = "block";
    document.getElementById("review-score").textContent    = result.score || 0;
    document.getElementById("review-summary").textContent  = result.summary || "";
    document.getElementById("documentation").textContent = (result.documentation || "").replace(/\\n/g, "\n");
    
    const issuesList = document.getElementById("issues-list");
    if (result.issues && result.issues.length > 0) {
        issuesList.innerHTML = result.issues.map(i => `
            <div class="issue-item">
                <div class="issue-type">${i.type}</div>
                <div>${i.message}</div>
                ${i.line ? `<div class="issue-line">Line ${i.line}</div>` : ""}
            </div>
        `).join("");
    } else {
        issuesList.innerHTML = `<p style="color:#27ae60;">No issues found!</p>`;
    }

    const suggestionsList = document.getElementById("suggestions-list");
    if (result.suggestions && result.suggestions.length > 0) {
        suggestionsList.innerHTML = result.suggestions.map(s => `
            <div class="suggestion-item">
                <div class="suggestion-type">${s.type}</div>
                <div>${s.message}</div>
            </div>
        `).join("");
    } else {
        suggestionsList.innerHTML = `<p style="color:#888;">No suggestions.</p>`;
    }
}

async function loadComments() {
    try {
        const res      = await fetch(`${API}/collab/comments/${fileId}`, { headers: authHeaders() });
        const comments = await res.json();
        const container = document.getElementById("comments-list");

        if (comments.length === 0) {
            container.innerHTML = `<p style="color:#aaa; font-size:13px;">No comments yet.</p>`;
            return;
        }

        container.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-user">${c.username}</div>
                <div>${c.comment}</div>
                ${c.line_number ? `<div class="comment-line">Line ${c.line_number}</div>` : ""}
            </div>
        `).join("");
    } catch (err) {
        console.error(err);
    }
}

async function addComment() {
    const comment     = document.getElementById("comment-input").value.trim();
    const line_number = document.getElementById("line-number").value;

    if (!comment) return;

    try {
        await fetch(`${API}/collab/comment/${fileId}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ comment, line_number: line_number ? parseInt(line_number) : null })
        });
        document.getElementById("comment-input").value = "";
        document.getElementById("line-number").value   = "";
        loadComments();
    } catch (err) { 
        alert("Failed to add comment");
    }
}

function goBack() {
    window.location.href = `project.html?id=${projectId}`;
}
