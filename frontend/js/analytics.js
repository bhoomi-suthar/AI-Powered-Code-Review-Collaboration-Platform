
requireAuth();

const role = localStorage.getItem("role");


document.getElementById("username-display").textContent =
    "Hello, " + localStorage.getItem("username");

window.onload = async function () {

    // Sync role from DB
    try {
        const res = await fetch(`${API}/auth/me`, { headers: authHeaders() });

        if (!res.ok) {
            localStorage.clear();
            window.location.href = "index.html";
            return;
        }

        const data = await res.json();
        localStorage.setItem("role", data.role);

    } catch (err) {
        localStorage.clear();
        window.location.href = "index.html";
        return;
    }
    
    loadStats();

    const role = localStorage.getItem("role");

    if (role === "admin") {
        document.getElementById("admin-section").style.display = "block";
        loadAdminStats();
    }

    if (role === "superuser") {
        const link = document.getElementById("super-panel-link");
        if (link) {
            link.style.display = "inline";
        }
    }
};

async function loadStats() {
    try {
        const res  = await fetch(`${API}/dashboard/stats`, { headers: authHeaders() });
        const data = await res.json();

        document.getElementById("stat-projects").textContent = data.total_projects;
        document.getElementById("stat-files").textContent    = data.total_files;
        document.getElementById("stat-reviews").textContent  = data.total_reviews;
        document.getElementById("stat-commits").textContent  = data.total_commits;
        document.getElementById("stat-messages").textContent = data.total_messages;
        document.getElementById("stat-lines").textContent    = data.total_lines_analyzed;

        loadIssuesBreakdown(data.most_common_issues);
        loadRecentActivity(data.recent_activity);
    } catch (err) {
        console.error("Failed to load stats:", err);
    }
}

function loadIssuesBreakdown(issues) {
    const container = document.getElementById("issues-breakdown");

    if (!issues || issues.length === 0) {
        container.innerHTML = `<p style="color:#aaa; font-size:13px;">No issues data yet. Run AI reviews to see results.</p>`;
        return;
    }

    const maxCount = Math.max(...issues.map(i => i.count)); // Progress bars are calculate

    container.innerHTML = issues.map(i => `
        <div style="margin-bottom:14px;"> 
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-size:13px; font-weight:600; color:#333; text-transform:capitalize;">${i.type.replace("_", " ")}</span>
                <span style="font-size:13px; color:#888;">${i.count}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:${(i.count / maxCount) * 100}%"></div>
            </div>
        </div>
    `).join("");
}

function loadRecentActivity(activities) {
    const container = document.getElementById("recent-activity");

    if (!activities || activities.length === 0) {
        container.innerHTML = `<p style="color:#aaa; font-size:13px;">No activity yet.</p>`;
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
}

async function loadAdminStats() {
    try {
        const res  = await fetch(`${API}/dashboard/admin/stats`, { headers: authHeaders() });
        const data = await res.json();
        const container = document.getElementById("users-list");

        if (!data.user_activity || data.user_activity.length === 0) {
            container.innerHTML = `<p style="color:#aaa; font-size:13px;">No users found.</p>`;
            return;
        }

        container.innerHTML = data.user_activity.map(u => `
            <div class="user-row">
                <div>
                    <div class="username">${u.username}</div>
                    <div style="font-size:12px; color:#aaa;">${u.email}</div>
                </div>
                <div>${u.projects}</div>
                <div>${u.files}</div>
                <div>${u.reviews}</div>
                <div>
                    <span class="role-badge role-${u.role}">${u.role}</span>
                </div>
            </div>
        `).join("");
    } catch (err) {
        document.getElementById("users-list").innerHTML =
            `<p style="color:#aaa;">Failed to load user data.</p>`;
    }
}