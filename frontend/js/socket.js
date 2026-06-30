function initSocket(projectId) {
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    script.onload = function () {
        const socket = io("http://localhost:8000", {
            transports: ["websocket", "polling"]
        });

        window.chatSocket = socket;
        const username = localStorage.getItem("username");

        socket.on("connect", () => {
            socket.emit("join_project", {
                project_id: projectId,
                username:   username
            });
        });

        socket.on("receive_message", (data) => {
            const currentUsername = localStorage.getItem("username");
            if (data.username === currentUsername) return;

            const container = document.getElementById("chat-messages");
            if (container) {
                const noMsg = container.querySelector("p");
                if (noMsg) noMsg.remove();

                const div = document.createElement("div");
                div.className = "chat-message";
                div.style.cssText = "position:relative; padding-right:30px;";
                div.innerHTML = `
                    <span class="chat-user">${data.username}:</span>
                    <span class="chat-text"> ${data.message}</span>
                    <div class="chat-time" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${new Date(data.timestamp).toLocaleTimeString()}</span>
                        <button onclick="loadMessages()"
                            style="background:none; border:none; cursor:pointer; font-size:11px; color:#aaa; padding:0 2px;">
                            📌 Pin
                        </button>
                    </div>
                `;
                container.appendChild(div);
                container.scrollTop = container.scrollHeight;
            }
        });

        socket.on("refresh_chat", () => {
            loadMessages();
        });

        socket.on("user_joined",   (data) => { console.log(data.message); });
        socket.on("user_left",     (data) => { console.log(data.message); });
        socket.on("notification",  (data) => { console.log("Notification:", data.message); });
        socket.on("disconnect",    ()     => { console.log("Socket disconnected"); });
        socket.on("connect_error", (err)  => { console.log("Socket error:", err.message); });
    };
    document.head.appendChild(script);
}