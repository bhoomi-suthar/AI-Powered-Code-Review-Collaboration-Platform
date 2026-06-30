requireAuth();

document.getElementById("username-display").textContent =
    "Hello, " + localStorage.getItem("username");

window.onload = async function () {
    await loadProfile();
};

async function loadProfile() {
    try {
        const res = await fetch(`${API}/auth/profile`, { headers: authHeaders() });
        const data = await res.json();

        const username = data.username || "";

        document.getElementById("avatar-circle").textContent = username.charAt(0).toUpperCase();
        document.getElementById("profile-username").textContent = username;
        document.getElementById("profile-email").textContent = data.email || "";

        const roleColors = {
            "superuser": "#7c3aed",
            "admin": "#f59e0b",
            "user": "#4a6cf7"
        };
        const roleLabels = {
            "superuser": "Super User",
            "admin": "Admin",
            "user": "User"
        };
        const role = data.role || "user";
        document.getElementById("profile-role").innerHTML = `
            <span style="font-size:12px; font-weight:600; color:#fff; background:${roleColors[role]}; padding:3px 10px; border-radius:20px;">
                ${roleLabels[role]}
            </span>
        `;

        document.getElementById("p-projects").textContent = data.stats?.total_projects || 0;
        document.getElementById("p-files").textContent = data.stats?.total_files || 0;
        document.getElementById("p-reviews").textContent = data.stats?.total_reviews || 0;
        document.getElementById("p-commits").textContent = data.stats?.total_commits || 0;

    } catch (err) {
        console.error(err);
    }
}

async function updateUsername() {
    const newUsername = document.getElementById("new-username").value.trim();
    if (!newUsername) {
        document.getElementById("username-alert").innerHTML =
            `<div class="alert alert-error">Username cannot be empty</div>`;
        return;
    }

    try {
        const res = await fetch(`${API}/auth/profile/username`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ username: newUsername })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        localStorage.setItem("username", newUsername);
        document.getElementById("username-alert").innerHTML =
            `<div class="alert alert-success">Username updated successfully</div>`;
        document.getElementById("new-username").value = "";
        loadProfile();
    } catch (err) {
        document.getElementById("username-alert").innerHTML =
            `<div class="alert alert-error">${err.message}</div>`;
    }
}

async function changePassword() {
    const current = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password").value;
    const confirm = document.getElementById("confirm-password").value;
    
    if (!current || !newPass || !confirm) {
        document.getElementById("password-alert").innerHTML =
            `<div class="alert alert-error">All fields are required</div>`;
        return;
    }

    if (newPass !== confirm) {
        document.getElementById("password-alert").innerHTML =
            `<div class="alert alert-error">New passwords do not match</div>`;
        return;
    }

    if (newPass.length < 6) {
        document.getElementById("password-alert").innerHTML =
            `<div class="alert alert-error">Password must be at least 6 characters</div>`;
        return;
    }

    try {
        const res = await fetch(`${API}/auth/profile/password`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ current_password: current, new_password: newPass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        document.getElementById("password-alert").innerHTML =
            `<div class="alert alert-success">Password changed successfully</div>`;
        document.getElementById("current-password").value = "";
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-password").value = "";
    } catch (err) {
        document.getElementById("password-alert").innerHTML =
            `<div class="alert alert-error">${err.message}</div>`;
    }
}

function deleteAccount() {
    document.getElementById("delete-modal").style.display = "flex";
}

function showStep2() {
    document.getElementById("delete-modal").style.display = "none";
    confirmDelete();
}

async function confirmDelete() {
    try {
        const res  = await fetch(`${API}/auth/profile/delete`, {
            method: "DELETE",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        alert("Your account has been deleted.");
        localStorage.clear();
        window.location.href = "index.html";
    } catch (err) {
        alert(err.message);
    }
}