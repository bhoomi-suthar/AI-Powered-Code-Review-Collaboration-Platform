var API = "http://localhost:8000/api";

async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!email || !password) {
        showAlert("All fields are required", "error");
        return;
    }

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) {
            const errorMessage = Array.isArray(data.detail)
                ? data.detail[0].msg
                : data.detail || "Login failed";

            showAlert(errorMessage, "error");
            return;
        }

        localStorage.setItem("token", data.access_token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("role", data.role);
        localStorage.setItem("user_id", data.user_id);

        window.location.href = "dashboard.html";
    } catch (err) {
        showAlert("Cannot connect to server. Make sure backend is running.", "error");
    }
}

async function register() {
    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    if (!username || !email || !password) {
        showAlert("All fields are required", "error");
        return;
    }

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password, role })
        });
        const data = await res.json();

        if (!res.ok) {
            const errorMessage = Array.isArray(data.detail)
                ? data.detail[0].msg
                : data.detail || "Registration failed";

            showAlert(errorMessage, "error");
            return;
        }

        showAlert("Registered successfully! Redirecting to login...", "success");
        setTimeout(() => { window.location.href = "index.html"; }, 1500);

    } catch (err) {
        showAlert("Cannot connect to server. Make sure backend is running.", "error");
    }
}

function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}

function showAlert(message, type) {
    const el = document.getElementById("alert");
    if (el) {
        el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    }
}

function getToken() {
    return localStorage.getItem("token");
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
    };
}

function requireAuth() {
    if (!getToken()) {
        window.location.href = "index.html";
    }
}