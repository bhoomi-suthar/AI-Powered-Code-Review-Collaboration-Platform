requireAuth();

document.getElementById("username-display").textContent =
    "Hello, " + localStorage.getItem("username");

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get("id"); // get project ID from URL

if (!projectId) window.location.href = "dashboard.html";

window.onload = async function () {
    const isViewer = await loadProject();
    loadFiles(isViewer);
    loadMessages();
    initSocket(projectId);
};

async function loadProject() {
    try {
        const res = await fetch(`${API}/projects/${projectId}`, {
            headers: authHeaders()
        });

        const data = await res.json();

        document.getElementById("project-name").textContent = data.name;
        const desc = document.getElementById("project-desc");

        if (desc) {
            desc.textContent = data.description || "";
        }

        if (data.github_repo) {
            const githubLink = document.getElementById("github-link");

            if (githubLink) {
                githubLink.href = data.github_repo;
                githubLink.textContent = "View on GitHub";
                githubLink.style.display = "inline-block";
            }
        }

        // Show collaborators
        const ownerId = data.owner_id;
        const currentUserId2 = localStorage.getItem("user_id");
        const isOwner = ownerId === currentUserId2;

        loadCollaborators(projectId, isOwner);

        const currentUserId = localStorage.getItem("user_id");
        const memberRoles = data.member_roles || {};
        const userRole = memberRoles[currentUserId];

        const isViewer = userRole === "viewer";

        console.log(
            "userRole:",
            userRole,
            "isViewer:",
            isViewer,
            "userId:",
            currentUserId
        );

        // Hide top buttons for viewers
        if (isViewer) {
            const uploadBtn = document.querySelector('button[onclick="showUploadForm()"]');
            if (uploadBtn) uploadBtn.style.display = "none";

            const collabWrapper = document.querySelector('button[onclick="showCollabModal()"]')?.closest('div[style*="inline-flex"]');
            if (collabWrapper) collabWrapper.style.display = "none";
        }
        // pass viewer status to loadFiles
        await loadFiles(isViewer);

        return isViewer;

    } catch (err) {
        console.error(err);
        document.getElementById("project-name").textContent = "Project";
        await loadFiles(false);
        return false;
    }
}


async function loadFiles(isViewer = false) {
    const container = document.getElementById("files-list");
    container.innerHTML = "";

    try {
        const res = await fetch(`${API}/files/project/${projectId}`, { headers: authHeaders() });
        const files = await res.json();

        if (!Array.isArray(files) || files.length === 0) {
            container.innerHTML = `<div class="empty-state">No files uploaded yet.</div>`;
            return;
        }

        container.innerHTML = files.map(f => `
            <div class="project-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3>${f.original_name}</h3>
                        <p>Type: ${f.file_type} | Size: ${(f.size / 1024).toFixed(1)} KB | By: ${f.uploaded_by_name}</p>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="runReview('${f.id}', '${f.original_name}')">AI Review</button>
                        <button class="btn btn-secondary" onclick="window.location.href='chatboard.html?file_id=${f.id}&file_name=${encodeURIComponent(f.original_name)}'">Chatboard</button>
                        ${!isViewer ? `<button class="btn btn-secondary" onclick="commitFile('${f.id}')">Commit</button>` : ""}
                        <button class="btn btn-secondary" onclick="viewHistory('${f.id}')">History</button>
                        ${!isViewer ? `
                        <div style="position:relative;">
                            <button onclick="toggleFileMenu('${f.id}')" style="border:none;background:none;font-size:22px;cursor:pointer;color:#666;padding:4px 8px;">⋮</button>
                            <div id="menu-${f.id}" style="display:none;position:absolute;right:0;top:30px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;min-width:120px;box-shadow:0 6px 20px rgba(0,0,0,.1);z-index:1000;">
                                <div onclick="deleteFile('${f.id}')" style="padding:10px 14px;cursor:pointer;color:#e74c3c;font-size:14px;">Delete File</div>
                                <div onclick="updateFile('${f.id}')" style="padding:10px 14px;cursor:pointer;color:#4a6cf7;font-size:14px;">Update File</div>
                            </div>
                        </div>` : ""}
                    </div>
                </div>
            </div>
        `).join("");
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Could not load files.</div>`;
    }
}

async function uploadFile() {
    const fileInput = document.getElementById("file-input");
    const file = fileInput.files[0];

    if (!file) return showUploadAlert("Please select a file", "error");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API}/files/upload/${projectId}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${getToken()}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Upload failed");

        showUploadAlert("File uploaded successfully!", "success");
        hideUploadForm();
        loadFiles();
    } catch (err) {
        showUploadAlert(err.message, "error");
    }
}

function runReview(fileId, fileName) {
    window.location.href = `review.html?file_id=${fileId}&project_id=${projectId}`;
}

async function commitFile(fileId) {
    const message = prompt("Enter update message:");
    if (!message) return;

    try {
        const res = await fetch(`${API}/versions/commit/${fileId}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ commit_message: message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert("Commit Saved: " + data.version_number);
    } catch (err) {
        alert("Commit failed: " + err.message);
    }
}


async function rollback(fileId, versionId, versionNumber) {
    if (!confirm(`Rollback to version ${versionNumber}?`)) return;
    try {
        const res = await fetch(`${API}/versions/rollback/${fileId}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ version_id: versionId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(data.message);
    } catch (err) {
        alert("Rollback failed: " + err.message);
    }
}

async function loadMessages() {
    const container = document.getElementById("chat-messages");
    container.innerHTML = "";
    try {
        const res = await fetch(`${API}/collab/messages/${projectId}`, { headers: authHeaders() });
        const messages = await res.json();

        if (!Array.isArray(messages) || messages.length === 0) {
            container.innerHTML = `<p style="color:#aaa; font-size:13px; padding:8px;">No messages yet. Say hello!</p>`;
        } else {
            container.innerHTML = messages
                .filter(m => !m.pinned)
                .map(m => `
                <div class="chat-message" style="position:relative; padding-right:30px; ${m.pinned ? 'background:#fffde7; border-radius:8px; padding:6px 30px 6px 8px;' : ''}">
                    ${m.pinned ? '<span style="font-size:10px; color:#f9a825; position:absolute; top:4px; right:6px;"></span>' : ''}
                    <span class="chat-user">${m.username}:</span>
                    <span class="chat-text"> ${m.message}</span>
                    <div class="chat-time" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${new Date(m.created_at).toLocaleTimeString()}</span>
                        <button onclick="${m.pinned ? `unpinMessage('${m.id}')` : `pinMessage('${m.id}')`}"
                            style="background:none; border:none; cursor:pointer; font-size:11px; color:${m.pinned ? '#f9a825' : '#aaa'}; padding:0 2px;">
                            ${m.pinned ? '📌 Unpin' : '📌 Pin'}
                        </button>
                    </div>
                </div>
            `).join("");
            container.scrollTop = container.scrollHeight;
        }

        // Load pinned messages section
        loadPinnedMessages();

    } catch (err) {
        container.innerHTML = `<p style="color:#aaa; font-size:13px; padding:8px;">Could not load messages.</p>`;
    }
}


async function sendMessage() {
    const input = document.getElementById("chat-input");
    const message = input.value.trim();
    if (!message) return;

    const username = localStorage.getItem("username");
    const timestamp = new Date().toISOString();

    try {
        await fetch(`${API}/collab/message/${projectId}`, {
            method: "POST", 
            headers: authHeaders(),
            body: JSON.stringify({ message })
        });

        if (window.chatSocket) {
            window.chatSocket.emit("send_message", {
                project_id: projectId,
                username: username,
                message: message,
                timestamp: timestamp,
                project_name: document.getElementById("project-name").textContent.trim()
            });
        }

        input.value = "";

        const container = document.getElementById("chat-messages");
        const noMsg = container.querySelector("p");
        if (noMsg) noMsg.remove();

        const div = document.createElement("div");
        div.className = "chat-message";
        div.style.cssText = "position:relative; padding-right:30px;";
        div.innerHTML = `
            <span class="chat-user">${username}:</span>
            <span class="chat-text"> ${message}</span>
            <div class="chat-time" style="display:flex; justify-content:space-between; align-items:center;">
                <span>${new Date(timestamp).toLocaleTimeString()}</span>
                <button onclick="loadMessages()"
                    style="background:none; border:none; cursor:pointer; font-size:11px; color:#aaa; padding:0 2px;">
                    📌 Pin
                </button>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error(err);
    }
}

function showUploadForm() { document.getElementById("upload-form").style.display = "block"; }
function hideUploadForm() { document.getElementById("upload-form").style.display = "none"; }

function showUploadAlert(msg, type) {
    document.getElementById("upload-alert").innerHTML =
        `<div class="alert alert-${type}">${msg}</div>`;
}


async function viewHistory(fileId) {
    const container = document.getElementById("commit-history");
    container.innerHTML = "";
    try {
        const res = await fetch(`${API}/versions/history/${fileId}`, { headers: authHeaders() });
        const versions = await res.json();

        if (!Array.isArray(versions) || versions.length === 0) {
            container.innerHTML = `<div class="empty-state">No commits yet.</div>`;
            return;
        }

        const options = versions.map(v =>
            `<option value="${v.version_number}">Version ${v.version_number} — ${v.commit_message}</option>`
        ).join("");

        container.innerHTML = `
            <div style="margin-bottom:16px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <select id="v1-select" style="padding:8px; border:1px solid #ddd; border-radius:8px;">
                    ${options}
                </select>
                <span>vs</span>
                <select id="v2-select" style="padding:8px; border:1px solid #ddd; border-radius:8px;">
                    ${options}
                </select>
                <button class="btn btn-secondary" onclick="comparVersions('${fileId}')">Compare</button>
            </div>
            <div id="diff-result"></div>
            ${versions.map(v => `
                <div class="project-card">  
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3>Version ${v.version_number} — ${v.commit_message}</h3>
                            <p>By ${v.created_by_name} on ${new Date(v.created_at).toLocaleString()}</p>
                        </div>
                        <button class="btn btn-secondary" onclick="rollback('${fileId}', '${v.id}', ${v.version_number})">Rollback</button>
                    </div>
                </div>
            `).join("")}
        `;

        // Set second dropdown to version 2 
        const v2Select = document.getElementById("v2-select");
        if (v2Select && versions.length > 1) {
            v2Select.value = versions[1].version_number;
        }

    } catch (err) {
        container.innerHTML = `<div class="empty-state">Could not load history.</div>`;
    }
}

async function comparVersions(fileId) {
    const v1 = document.getElementById("v1-select").value;
    const v2 = document.getElementById("v2-select").value;

    if (v1 === v2) {
        alert("Please select two different versions to compare.");
        return;
    }

    try {
        const res = await fetch(`${API}/versions/compare/${fileId}?v1=${v1}&v2=${v2}`, { headers: authHeaders() });
        const data = await res.json();

        const diffResult = document.getElementById("diff-result");
        if (!data.diff || data.diff.length === 0) {
            diffResult.innerHTML = `<div class="empty-state">No differences found.</div>`;
            return;
        }

        diffResult.innerHTML = `
            <div class="card" style="margin-bottom:16px;">
                <h3 style="margin-bottom:12px;">Diff — Version ${v1} vs Version ${v2}</h3>
                <pre style="background:#f8f9fa; padding:16px; border-radius:8px; font-size:12px; overflow-x:auto; border:1px solid #e0e0e0;">${data.diff.map(line => {
            if (line.startsWith("+")) return `<span style="color:green;">${line}</span>`;
            if (line.startsWith("-")) return `<span style="color:red;">${line}</span>`;
            return line;
        }).join("\n")}</pre>
            </div>
        `;
    } catch (err) {
        alert("Could not compare versions.");
    }
}

function toggleFileMenu(fileId) { // show/hide file action menu
    const menu = document.getElementById(`menu-${fileId}`);

    document.querySelectorAll("[id^='menu-']").forEach(m => {
        if (m !== menu) m.style.display = "none";
    });

    menu.style.display =
        menu.style.display === "block" ? "none" : "block";
}

document.addEventListener("click", function (e) {
    if (!e.target.closest('[id^="menu-"]') && !e.target.closest('button[onclick^="toggleFileMenu"]')) {
        document.querySelectorAll("[id^='menu-']").forEach(m => m.style.display = "none");
    }
});

async function deleteFile(fileId) {
    if (!confirm("Delete this file?")) return;

    try {
        const res = await fetch(`${API}/files/${fileId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        loadFiles();
    } catch (err) {
        alert(err.message);
    }
}

async function updateFile(fileId) { // allow user to select new file to replace existing one

    const input = document.createElement("input");
    input.type = "file";

    input.onchange = async () => {
        const file = input.files[0];  
        const formData = new FormData(); 
        formData.append("file", file);

        await fetch(
            `${API}/files/update/${fileId}`,
            {
                method: "PUT",
                headers: { 
                    "Authorization": `Bearer ${getToken()}`
                },
                body: formData
            }
        );
        alert("File updated");
    };
    input.click();
}

async function clearChat() {
    if (!confirm("Clear chat from your view permanently?")) return;
    try {
        const res = await fetch(`${API}/collab/messages/clear/${projectId}`, {
            method: "POST",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to clear chat");

        const container = document.getElementById("chat-messages");
        if (container) {
            container.innerHTML = `<p style="color:#aaa; font-size:13px; padding:8px;">No messages yet. Say hello!</p>`;
        }
    } catch (err) {
        alert(err.message);
    }
}

function showCollabModal() {
    document.getElementById("collab-modal-overlay").style.display = "flex";
    document.getElementById("collab-username").value = "";
    document.getElementById("collab-alert").innerHTML = "";
}

function hideCollabModal() {
    document.getElementById("collab-modal-overlay").style.display = "none";
}

async function addCollaborator() {
    const username = document.getElementById("collab-username").value.trim();
    const email = document.getElementById("collab-email").value.trim();
    const role = document.getElementById("collab-role").value;

    if (!username || !email) {
        document.getElementById("collab-alert").innerHTML =
            `<div class="alert alert-error">Both username and email are required</div>`;
        return;
    }

    try {
        const res = await fetch(`${API}/projects/${projectId}/add-collaborator`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ username, email, role })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        alert(` ${data.username} (${data.user_email}) added as ${role}`);
        hideCollabModal();
        document.getElementById("collab-email").value = "";
        loadCollaborators(projectId, true);
    } catch (err) {
        document.getElementById("collab-alert").innerHTML =
            `<div class="alert alert-error">${err.message}</div>`;
    }
}


async function loadCollaborators(projectId, isOwner) {
    const list = document.getElementById("collaborators-list");
    if (!list) return;

    try {
        const res = await fetch(`${API}/projects/${projectId}/collaborators`, { headers: authHeaders() });
        const data = await res.json();

        if (!data.collaborators || data.collaborators.length === 0) {
            list.innerHTML = `<span style="color:#aaa; font-size:13px;">No collaborators yet.</span>`;
            return;
        }

        list.innerHTML = data.collaborators.map(c => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 4px; border-bottom:1px solid #f5f5f5;">
        <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:30px; height:30px; border-radius:50%; background:#4a6cf7; color:#fff; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; flex-shrink:0;">
                ${c.username.charAt(0).toUpperCase()}
            </div>
            <div>
                <div style="font-size:13px; font-weight:600; color:#222;">${c.username}</div>
                ${isOwner ? `
                <select onchange="updateCollaboratorRole('${c.user_id}', this.value)"
                    style="font-size:11px; color:#888; border:1px solid #ddd; border-radius:6px; padding:2px 6px; margin-top:2px; cursor:pointer;">
                    <option value="editor" ${c.role === "editor" ? "selected" : ""}>Editor</option>
                    <option value="viewer" ${c.role === "viewer" ? "selected" : ""}>Viewer</option>
                </select>` : `<div style="font-size:11px; color:#888;">${c.role}</div>`}
            </div>
        </div>
        ${isOwner ? `<button onclick="removeCollaborator('${c.user_id}')" style="border:none; background:none; cursor:pointer; color:#e74c3c; font-size:18px; padding:0 4px; margin-left:auto;">✕</button>` : ""}
    </div>
`).join("");
    } catch (err) {
        console.error("Could not load collaborators", err);
    }
}

async function removeCollaborator(userId) {
    if (!confirm("Remove this collaborator?")) return;
    try {
        const res = await fetch(`${API}/projects/${projectId}/remove-collaborator`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json(); 
        if (!res.ok) throw new Error(data.detail);
        alert(data.message);
        window.location.reload();
    } catch (err) {
        alert(err.message);
    }
}


function toggleCollabDropdown() {
    const dropdown = document.getElementById("collab-dropdown");
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}

document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("collab-dropdown");
    if (dropdown && dropdown.style.display === "block") {
        if (!dropdown.contains(e.target) && !e.target.closest('[onclick="toggleCollabDropdown()"]')) {
            dropdown.style.display = "none";
        }
    }
});


async function updateCollaboratorRole(userId, newRole) {
    try {
        const res = await fetch(`${API}/projects/${projectId}/update-collaborator-role`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ user_id: userId, role: newRole })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(`Role updated to ${newRole}`);
    } catch (err) {
        alert(err.message);
    }
}


async function pinMessage(messageId) {
    try {
        await fetch(`${API}/collab/messages/pin/${messageId}`, {
            method: "POST",
            headers: authHeaders()
        });

        if (window.chatSocket) { 
            window.chatSocket.emit("message_pinned", {
                project_id: projectId
            });
        }

        loadMessages();
    } catch (err) {
        alert("Could not pin message");
    }
}

async function unpinMessage(messageId) {
    try {
        await fetch(`${API}/collab/messages/unpin/${messageId}`, {
            method: "POST",
            headers: authHeaders()
        });

        if (window.chatSocket) {
            window.chatSocket.emit("message_unpinned", {
                project_id: projectId
            });
        }

        loadMessages();
    } catch (err) {
        alert("Could not unpin message");
    }
}

async function loadPinnedMessages() {
    try {
        const res = await fetch(`${API}/collab/messages/pinned/${projectId}`, { headers: authHeaders() });
        const pins = await res.json();

        const section = document.getElementById("pinned-messages");
        const list = document.getElementById("pinned-list");

        if (!pins || pins.length === 0) {
            section.style.display = "none";
            return;
        }
        // show pinned messages section and pop
        section.style.display = "block";
        list.innerHTML = pins.map(m => ` 
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:4px;">
                <span><strong style="color:#4a6cf7;">${m.username}:</strong> ${m.message}</span>
                <button onclick="unpinMessage('${m.id}')" style="background:none; border:none; cursor:pointer; color:#aaa; font-size:11px;">✕</button>
            </div>
        `).join("");
    } catch (err) {
        console.error("Could not load pinned messages");
    }
}