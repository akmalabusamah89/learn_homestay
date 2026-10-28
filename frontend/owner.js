const API_URL = "http://127.0.0.1:8000";

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) {
    alert("Please log in first.");
    window.location.href = "index.html";
}

document.getElementById("userBadge").textContent = `Role: ${role || 'Owner'}`;
if (role === "admin" || role === "super_admin") {
    document.getElementById("roleEyebrow").textContent = "ADMINISTRATOR DASHBOARD";
    document.getElementById("bookingsTitle").textContent = "All Platform Bookings";
}

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
});

// Admin Modal Logic
const adminModal = document.getElementById("adminModal");
const adminForm = document.getElementById("adminForm");
const adminMsg = document.getElementById("adminMsg");

document.getElementById("adminLoginBtn").addEventListener("click", () => {
    adminModal.hidden = false;
    adminMsg.textContent = "";
});

document.getElementById("closeAdmin").addEventListener("click", () => {
    adminModal.hidden = true;
});

adminForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("adminUsername").value;
    const password = document.getElementById("adminPassword").value;

    adminMsg.className = "form-msg";
    adminMsg.textContent = "Authenticating admin...";

    try {
        const response = await fetch(`${API_URL}/admin-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Admin authentication failed");

        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        
        adminMsg.className = "form-msg ok";
        adminMsg.textContent = "Success! Reloading dashboard...";

        setTimeout(() => { location.reload(); }, 800);
    } catch (err) {
        adminMsg.className = "form-msg err";
        adminMsg.textContent = err.message;
    }
});

// Add Property Modal Logic
const homestayModal = document.getElementById("homestayModal");
const homestayForm = document.getElementById("homestayForm");
const homestayMsg = document.getElementById("homestayMsg");

document.getElementById("openAddHomestayBtn").addEventListener("click", () => {
    homestayModal.hidden = false;
    homestayMsg.textContent = "";
});

document.getElementById("closeHomestay").addEventListener("click", () => {
    homestayModal.hidden = true;
});

homestayForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    
    const payload = {
        name: document.getElementById("stayName").value,
        property_type: document.getElementById("stayPropertyType").value,
        location: document.getElementById("stayLocation").value,
        price: parseFloat(document.getElementById("stayPrice").value),
        badge: document.getElementById("stayBadge").value || null,
        image_url: document.getElementById("stayImageUrl").value || null
    };

    homestayMsg.className = "form-msg";
    homestayMsg.textContent = "Creating property...";

    try {
        const response = await fetch(`${API_URL}/homestays`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Failed to create homestay");

        homestayMsg.className = "form-msg ok";
        homestayMsg.textContent = "Property listed successfully!";
        homestayForm.reset();

        setTimeout(() => {
            homestayModal.hidden = true;
            initDashboard();
        }, 1200);
    } catch (error) {
        homestayMsg.className = "form-msg err";
        homestayMsg.textContent = error.message;
    }
});

async function initDashboard() {
    try {
        const bookingsRes = await fetch(`${API_URL}/bookings`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (bookingsRes.status === 401) {
            localStorage.clear();
            alert("Your session has expired. Please log in again.");
            window.location.href = "index.html";
            return;
        }

        if (bookingsRes.ok) {
            const bookings = await bookingsRes.json();
            const tbody = document.getElementById("bookingsTableBody");
            
            if (bookings.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--muted);">No bookings found.</td></tr>`;
            } else {
                tbody.innerHTML = bookings.map(b => `
                    <tr>
                        <td>#${b.id}</td>
                        <td><strong>${b.homestay_name || 'Homestay #' + b.homestay_id}</strong></td>
                        <td>${b.guest_name}</td>
                        <td>${b.check_in}</td>
                        <td>${b.check_out}</td>
                        <td>RM ${b.total_price}</td>
                        <td><span class="status-badge status-${b.status.toLowerCase()}">${b.status}</span></td>
                        <td>
                            ${b.status !== 'cancelled' ? `<button class="action-btn cancel-btn" onclick="updateStatus(${b.id}, 'cancelled')">Cancel</button>` : ''}
                            ${role === 'super_admin' ? `<button class="action-btn delete-btn" onclick="deleteBooking(${b.id})">Delete</button>` : ''}
                        </td>
                    </tr>
                `).join("");
            }
        }
    } catch (err) {
        console.error("Dashboard error:", err);
    }
}

async function updateStatus(bookingId, newStatus) {
    if (!confirm(`Are you sure you want to mark booking #${bookingId} as ${newStatus}?`)) return;

    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}`, {
            method: "PATCH",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Failed to update booking status");
        }

        initDashboard();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteBooking(bookingId) {
    if (!confirm(`Are you sure you want to permanently delete booking #${bookingId}?`)) return;

    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Failed to delete booking");
        }

        initDashboard();
    } catch (err) {
        alert(err.message);
    }
}

initDashboard();