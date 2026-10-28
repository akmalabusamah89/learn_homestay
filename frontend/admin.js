const API_URL = "https://learn-homestay-api-xpnf.onrender.com";
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleAdminLogin);
    }
});

// Quietly check auth state without triggering alerts on page load
function checkAdminAuth() {
    const role = localStorage.getItem('role');
    const token = localStorage.getItem('token');
    const loginSection = document.getElementById('adminLoginForm');
    const panelSection = document.getElementById('adminPanel');

    if (token && (role === 'admin' || role === 'super_admin')) {
        if (loginSection) loginSection.style.display = 'none';
        if (panelSection) panelSection.style.display = 'block';
    } else {
        if (loginSection) loginSection.style.display = 'block';
        if (panelSection) panelSection.style.display = 'none';
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('adminUser').value;
    const password = document.getElementById('adminPass').value;

    try {
        const res = await fetch(`${API_URL}/admin-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        
        if (res.ok && data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            checkAdminAuth();
        } else {
            alert(data.detail || 'Access Denied: You must be an admin or super admin.');
        }
    } catch (err) {
        console.error("Login connection error:", err);
        alert("Could not connect to the backend server.");
    }
}


async function deleteBooking(bookingId) {
    if (!confirm("Are you sure you want to delete this booking?")) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/bookings/${bookingId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            alert("Booking deleted successfully.");
            // Refresh your bookings list/table here
            loadAdminBookings(); 
        } else {
            const data = await res.json();
            alert(data.detail || "Failed to delete booking.");
        }
    } catch (err) {
        console.error("Delete booking error:", err);
        alert("Error connecting to server.");
    }
}

async function deleteUser(userId) {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            alert("User deleted successfully.");
            // Refresh your users list/table here
            loadAdminUsers();
        } else {
            const data = await res.json();
            alert(data.detail || "Failed to delete user.");
        }
    } catch (err) {
        console.error("Delete user error:", err);
        alert("Error connecting to server.");
    }
}

// Load data automatically when the admin panel opens
document.addEventListener('DOMContentLoaded', () => {
    // ... your existing code ...
    if (localStorage.getItem('token')) {
        loadAdminBookings();
        loadAdminUsers();
    }
});

async function loadAdminBookings() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const bookings = await res.json();
        
        const container = document.getElementById('adminBookingsList');
        if (!container) return;

        if (!bookings.length) {
            container.innerHTML = `<p style="color: #666;">No bookings found.</p>`;
            return;
        }

        container.innerHTML = bookings.map(b => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #fff;">
                <div>
                    <strong>Booking ID: ${b.id}</strong> — Property: ${b.homestay_id || 'N/A'} <br>
                    <small style="color: #666;">Dates: ${b.check_in} to ${b.check_out}</small>
                </div>
                <button onclick="deleteBooking(${b.id})" class="btn-outline" style="border-color: #dc3545; color: #dc3545; padding: 6px 12px;">Delete</button>
            </div>
        `).join('');
    } catch (err) {
        console.error("Error loading bookings:", err);
    }
}

async function deleteBooking(bookingId) {
    if (!confirm(`Are you sure you want to delete booking #${bookingId}?`)) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/bookings/${bookingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            alert("Booking deleted successfully!");
            loadAdminBookings(); // Refresh the list
        } else {
            const data = await res.json();
            alert(data.detail || "Failed to delete booking.");
        }
    } catch (err) {
        console.error("Delete error:", err);
        alert("Server connection error.");
    }
}