requireAuth();

document.getElementById("username-display").textContent =
    "Hello, " + localStorage.getItem("username");

window.onload = async function () {
    // Check if current user still exists and sync role from DB
    try {
        const res  = await fetch(`${API}/auth/me`, { headers: authHeaders() });
        if (!res.ok) {
            localStorage.clear();
            window.location.href = "index.html";
            return;
        }
        const data = await res.json();

        // Sync role from DB into localStorage
        localStorage.setItem("role", data.role);

    } catch (err) {
        localStorage.clear();
        window.location.href = "index.html";
        return;
    }

    loadStats();
    loadProjects();
    loadActivity();

    if (localStorage.getItem("role") === "superuser") {
        const link = document.getElementById("super-panel-link");
        if (link) link.style.display = "inline";
    }
};

async function loadStats() {
    try {
        const res = await fetch(`${API}/dashboard/stats`, { headers: authHeaders() });
        const data = await res.json();
        document.getElementById("total-projects").textContent = data.total_projects;
        document.getElementById("total-files").textContent = data.total_files;
        document.getElementById("total-reviews").textContent = data.total_reviews;
        document.getElementById("total-commits").textContent = data.total_commits;
    } catch (err) {
        console.error("Stats error:", err);
    }
}

async function loadProjects() {
    const container = document.getElementById("projects-list");
    container.innerHTML = "";
    try {
        const res = await fetch(`${API}/projects/`, { headers: authHeaders() });
        const projects = await res.json();

        if (!Array.isArray(projects) || projects.length === 0) {
            container.innerHTML = `<div class="empty-state">No projects yet. Click New Project to create one.</div>`;
            return;
        }
        
        container.innerHTML = projects.map(p => `
    <div class="project-card" ${!p.pending ? `onclick="openProject('${p.id}')"` : "onclick=\"event.stopPropagation()\""} 
        style="${p.pending ? "cursor:default;" : ""}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
            <div style="flex:1;">
                <h3>${p.name}</h3>
                <p>${p.description || "No description"}</p>
                <div class="project-meta">
                    <span>By ${p.owner_name}</span>
                    <span>${new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                ${p.pending ? `
                <div style="margin-top:12px; display:flex; gap:8px; align-items:center;">
                    <button class="btn btn-primary" onclick="acceptInvite('${p.id}')" style="font-size:13px; padding:7px 16px;">Accept</button>
                    <button onclick="rejectInvite('${p.id}')" style="font-size:13px; padding:7px 16px; border:1px solid #e74c3c; background:none; color:#e74c3c; border-radius:8px; cursor:pointer;">Reject</button>
                    <span style="font-size:12px; color:#4a6cf7; font-weight:600;">Pending invitation</span>
                </div>` : ""}
            </div>
            ${!p.pending ? `
            <div style="position:relative;" onclick="event.stopPropagation()">
                <button onclick="toggleProjectMenu('${p.id}')" style="background:none;border:none;cursor:pointer;font-size:22px;color:#777;padding:4px 8px;line-height:1;">⋮</button>
                <div id="project-menu-${p.id}" style="display:none;position:absolute;right:0;top:28px;background:#fff;border:1px solid #eee;border-radius:10px;min-width:120px;box-shadow:0 4px 12px rgba(0,0,0,.08);z-index:100;">
                    <div onclick="deleteProject('${p.id}')" style="padding:10px 14px;color:#e74c3c;cursor:pointer;">Delete</div>
                </div>
            </div>` : ""}
        </div>
    </div>
`).join("");
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Could not load projects.</div>`;
    }
}

async function loadActivity() {
    const container = document.getElementById("activity-feed");
    container.innerHTML = "";
    try {
        const res = await fetch(`${API}/projects/`, { headers: authHeaders() });
        const projects = await res.json();

        if (!Array.isArray(projects) || projects.length === 0) {
            container.innerHTML = `<div class="empty-state">No activity yet.</div>`;
            return;
        }

        const projectId = projects[0].id;
        const res2 = await fetch(`${API}/collab/activity/${projectId}`, { headers: authHeaders() });
        const activities = await res2.json();

        if (!Array.isArray(activities) || activities.length === 0) {
            container.innerHTML = `<div class="empty-state">No activity yet.</div>`;
            return;
        }

        container.innerHTML = activities.map(a => `
            <div class="activity-item">
                <span class="activity-user">${a.username}</span>
                <span class="activity-action"> ${a.action}</span>
                ${a.details ? `<span class="activity-action"> — ${a.details}</span>` : ""}
                <div class="activity-time">${new Date(a.created_at).toLocaleString()}</div>
            </div>
        `).join("");
    } catch (err) {
        container.innerHTML = `<div class="empty-state">No activity yet.</div>`;
    }
}

function showModal() {
    const modal = document.getElementById("modal-overlay");
    modal.style.display = "flex";
    document.getElementById("project-name").value = "";
    document.getElementById("project-desc").value = "";       
    document.getElementById("modal-alert").innerHTML = "";
}

function hideModal() {
    document.getElementById("modal-overlay").style.display = "none";
}

async function createProject() {
    const name = document.getElementById("project-name").value.trim();
    const description = document.getElementById("project-desc").value.trim();

    if (!name) {
        document.getElementById("modal-alert").innerHTML =
            `<div class="alert alert-error">Project name is required</div>`;
        return;
    }

    try {
        const res = await fetch(`${API}/projects/`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, description })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed");

        hideModal();
        loadProjects();
        loadStats();
    } catch (err) {
        document.getElementById("modal-alert").innerHTML =
            `<div class="alert alert-error">${err.message}</div>`;
    }
}

function openProject(projectId) {
    window.location.href = `project.html?id=${projectId}`;
}

async function deleteProject(projectId) {

    const confirmDelete = confirm(
        "Are you sure you want to delete this project?"
    );

    if (!confirmDelete) return;

    try {
        const res = await fetch(
            `${API}/projects/${projectId}`,
            {
                method: "DELETE",
                headers: authHeaders()
            }
        );

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || "Delete failed");
        }

        alert("Project deleted successfully");

        loadProjects();
        loadStats();

    } catch (err) {
        alert(err.message);
    }
}

var notificationCount = 0;

(function initDashboardSocket() {
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    script.onload = async function () {
        const socket = io(window.location.origin, { transports: ["websocket", "polling"] });
        const username = localStorage.getItem("username");
        const shown = {};

        try {
            const res = await fetch(`${API}/projects/`, { headers: authHeaders() });
            const projects = await res.json();

            socket.on("connect", () => {
                if (Array.isArray(projects)) {
                    projects.forEach(p => {
                        socket.emit("join_project", {
                            project_id: p.id,
                            username: username
                        });
                    });
                }
            });
        } catch (err) {
            console.error("Could not join project rooms:", err);
        }

        socket.on("receive_message", (data) => {
            if (data.username === username) return;
            if (!data.project_name || data.project_name.trim() === "") return;

            const key = data.username + data.message + data.timestamp;
            if (shown[key]) return;
            shown[key] = true;

            addChatNotification(data.username, data.message, data.project_name);
        });
    };
    document.head.appendChild(script); 
})();

function addChatNotification(fromUser, message, projectName) { // add a new chat message notification to the dropdown
    notificationCount++;

    const countEl = document.getElementById("notif-count");
    const listEl = document.getElementById("notif-list");

    if (countEl) {
        countEl.style.display = "block"; 
        countEl.textContent = notificationCount;
    }

    if (listEl) {
        const empty = listEl.querySelector("div[style*='text-align:center']");
        if (empty) empty.remove();

        const shortProject = projectName.length > 20 ? projectName.substring(0, 20) + "..." : projectName;

        const div = document.createElement("div"); 
        div.style.cssText = "padding:12px 16px; border-bottom:1px solid #f0f0f0;";
        div.innerHTML = `
            <div style="font-size:13px; color:#222;">
                <span style="font-weight:700; color:#4a6cf7;">${fromUser}</span>
                <span style="color:#888;"> in </span>
                <span style="font-weight:600; color:#222;" title="${projectName}">${shortProject}</span>
            </div>
            <div style="font-size:13px; color:#555; margin-top:3px;">"${message}"</div>
            <div style="font-size:11px; color:#aaa; margin-top:4px;">${new Date().toLocaleTimeString()}</div>
        `;
        listEl.insertBefore(div, listEl.firstChild);
    }
}

function toggleNotifications() { // open/close dropdown
    const dropdown = document.getElementById("notif-dropdown");
    if (!dropdown) return;
    const isOpen = dropdown.style.display === "block";
    dropdown.style.display = isOpen ? "none" : "block";
    if (!isOpen) { 
        notificationCount = 0;
        const countEl = document.getElementById("notif-count");
        if (countEl) countEl.style.display = "none";
    }
}

function clearNotifications() { 
    const listEl = document.getElementById("notif-list");
    if (listEl) {
        listEl.innerHTML = `<div style="padding:20px; text-align:center; color:#aaa; font-size:13px;">No notifications yet</div>`;
    }
    notificationCount = 0; 
    const countEl = document.getElementById("notif-count");
    if (countEl) countEl.style.display = "none";
}

document.addEventListener("click", function (e) { // close dropdown if clicked outside 
    const dropdown = document.getElementById("notif-dropdown");
    const btn = e.target.closest("button");
    if (dropdown && dropdown.style.display === "block" && !dropdown.contains(e.target) && (!btn || !btn.onclick.toString().includes("toggleNotifications"))) {
        dropdown.style.display = "none";
    }
});

function toggleProjectMenu(projectId) { // open/close project card menu

    const menu = document.getElementById(`project-menu-${projectId}`);

    document.querySelectorAll("[id^='project-menu-']")
        .forEach(m => {
            if (m !== menu) m.style.display = "none";
        });

    menu.style.display =
        menu.style.display === "block"
            ? "none"  
            : "block"; 
}

document.addEventListener("click", () => { // close all project menus if clicked outside
    document.querySelectorAll("[id^='project-menu-']")
        .forEach(m => m.style.display = "none");
});


async function acceptInvite(projectId) {
    try {
        const res  = await fetch(`${API}/projects/${projectId}/accept`, {
            method: "POST",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(data.message);
        loadProjects();
        loadStats();
    } catch (err) {
        alert(err.message);
    }
}

async function rejectInvite(projectId) {
    if (!confirm("Reject this invitation?")) return;
    try {
        const res  = await fetch(`${API}/projects/${projectId}/reject`, {
            method: "POST",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(data.message);
        loadProjects();
    } catch (err) {
        alert(err.message);
    }
}