requireAuth();

document.getElementById("username-display").textContent =
    "Hello, " + localStorage.getItem("username");

// Only superuser can access this page
if (localStorage.getItem("role") !== "superuser") {
    alert("Access denied. Super User only.");
    window.location.href = "dashboard.html";
}

window.onload = function () {
    loadSystemStats();
    loadAllUsers();
    loadAllProjects();
};

async function loadSystemStats() {
    try {
        const res = await fetch(`${API}/superuser/stats`, { headers: authHeaders() });
        const data = await res.json();
        document.getElementById("total-users").textContent = data.total_users;
        document.getElementById("total-projects").textContent = data.total_projects;
        document.getElementById("total-files").textContent = data.total_files;
        document.getElementById("total-reviews").textContent = data.total_reviews;
    } catch (err) {
        console.error(err);
    }
}

async function loadAllUsers() {
    const container = document.getElementById("users-table");
    try {
        const res = await fetch(`${API}/superuser/users`, { headers: authHeaders() });
        const users = await res.json();

        if (!users.length) {
            container.innerHTML = `<div class="empty-state">No users found.</div>`;
            return;
        }

        container.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                    <tr style="border-bottom:2px solid #e0e0e0; text-align:left;">
                        <th style="padding:10px;">Username</th>
                        <th style="padding:10px;">Email</th>
                        <th style="padding:10px;">Role</th>
                        <th style="padding:10px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:10px; font-weight:600;">${u.username}</td>
                            <td style="padding:10px; color:#888;">${u.email}</td>
                            <td style="padding:10px;">
                                ${u.role === "superuser"
                                ? `<span style="font-size:13px; font-weight:600; color:#4a6cf7; padding:4px 8px; background:#f0f4ff; border-radius:6px;">Super User</span>`
                                : `<select onchange="changeUserRole('${u.id}', this.value)"
                                style="padding:4px 8px; border:1px solid #ddd; border-radius:6px; font-size:13px;">
                                <option value="user"  ${u.role === "user" ? "selected" : ""}>User</option>
                                <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
                                </select>`
                               }
                            </td>
                            <td style="padding:10px;">
                                <button onclick="deleteUser('${u.id}', '${u.username}')"
                                    style="background:#e74c3c; color:#fff; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px;">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Could not load users.</div>`;
    }
}

async function loadAllProjects() {
    const container = document.getElementById("projects-table");
    try {
        const res = await fetch(`${API}/superuser/projects`, { headers: authHeaders() });
        const projects = await res.json();

        if (!projects.length) {
            container.innerHTML = `<div class="empty-state">No projects found.</div>`;
            return;
        }

        container.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                    <tr style="border-bottom:2px solid #e0e0e0; text-align:left;">
                        <th style="padding:10px;">Project</th>
                        <th style="padding:10px;">Owner</th>
                        <th style="padding:10px;">Created</th>
                        <th style="padding:10px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${projects.map(p => `
                        <tr style="border-bottom:1px solid #f0f0f0;">
                            <td style="padding:10px; font-weight:600;">${p.name}</td>
                            <td style="padding:10px; color:#888;">${p.owner_name}</td>
                            <td style="padding:10px; color:#888;">${new Date(p.created_at).toLocaleDateString()}</td>
                            <td style="padding:10px;">
                                <button onclick="deleteProject('${p.id}', '${p.name}')"
                                    style="background:#e74c3c; color:#fff; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px;">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    } catch (err) {
        container.innerHTML = `<div class="empty-state">Could not load projects.</div>`;
    }
}

async function changeUserRole(userId, newRole) {
    try {
        const res = await fetch(`${API}/superuser/users/${userId}/role`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(`Role updated to ${newRole}`);
    } catch (err) {
        alert(err.message);
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${API}/superuser/users/${userId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(data.message);
        loadAllUsers();
        loadSystemStats();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteProject(projectId, name) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${API}/superuser/projects/${projectId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        alert(data.message);
        loadAllProjects();
        loadSystemStats();
    } catch (err) {
        alert(err.message);
    }
}