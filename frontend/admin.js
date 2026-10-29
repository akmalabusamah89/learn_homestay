const API_URL = "https://learn-homestay-api-xpnf.onrender.com";

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

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

// Global button handlers for the management panel
function logoutAdmin() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function openManageBookings() {
    // Clear out the user list container when opening bookings
    const usersContainer = document.getElementById('adminUsersList');
    if (usersContainer) usersContainer.innerHTML = ''; 
    
    loadAdminBookings();
}

function openManageUsers() {
    // Clear out the bookings list container when opening users
    const bookingsContainer = document.getElementById('adminBookingsList');
    if (bookingsContainer) bookingsContainer.innerHTML = ''; 
    
    loadAdminUsers();
}

// Load Bookings with Authorization Header
async function loadAdminBookings() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Unauthorized or failed to fetch bookings");
        
        const bookings = await res.json();
        const container = document.getElementById('adminBookingsList');
        if (!container) return;

        if (!bookings.length) {
            container.innerHTML = `<p style="color: #666; margin-top: 15px;">No bookings found.</p>`;
            return;
        }

        container.innerHTML = `
            <h3 style="margin-top: 20px; font-size: 1.2rem; font-weight: 600;">Manage Bookings</h3>
            <div style="margin-top: 10px;">
                ${bookings.map(b => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #fff;">
                        <div>
                            <strong>Booking ID: ${Number(b.id)}</strong> — Property: ${escapeHtml(b.homestay_id || 'N/A')}<br>
                            <small style="color: #666;">Dates: ${escapeHtml(b.check_in)} to ${escapeHtml(b.check_out)}</small>
                        </div>
                        <button onclick="deleteBooking(${Number(b.id)})" style="background: #e76f51; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Delete</button>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        console.error("Error loading bookings:", err);
        document.getElementById('adminBookingsList').innerHTML = `<p style="color: #e76f51; margin-top: 15px;">Failed to load bookings. Check authentication.</p>`;
    }
}

// Load Users with Authorization Header (adjust endpoint if yours is /admin/users or /users)
async function loadAdminUsers() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error("Unauthorized or failed to fetch users");

        const users = await res.json();
        const container = document.getElementById('adminUsersList');
        if (!container) return;

        if (!users.length) {
            container.innerHTML = `<p style="color: #666; margin-top: 15px;">No users found.</p>`;
            return;
        }

        container.innerHTML = `
            <h3 style="margin-top: 20px; font-size: 1.2rem; font-weight: 600;">Manage Users</h3>
            <div style="margin-top: 10px;">
                ${users.map(u => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #fff;">
                        <div>
                            <strong>${escapeHtml(u.username || u.email)}</strong> (Role: ${escapeHtml(u.role || 'user')})<br>
                            <small style="color: #666;">ID: ${Number(u.id)} | Email: ${escapeHtml(u.email)}</small>
                        </div>
                        <button onclick="deleteUser(${Number(u.id)})" style="background: #e76f51; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Delete</button>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        console.error("Error loading users:", err);
        document.getElementById('adminUsersList').innerHTML = `<p style="color: #e76f51; margin-top: 15px;">Failed to load users. Ensure your backend has a GET users endpoint.</p>`;
    }
}

async function deleteBooking(bookingId) {
    if (!confirm(`Delete booking #${bookingId}?`)) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/bookings/${bookingId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert("Booking deleted!");
            loadAdminBookings();
        } else {
            alert("Failed to delete booking.");
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteUser(userId) {
    if (!confirm(`Delete user #${userId}?`)) return;
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert("User deleted!");
            loadAdminUsers();
        } else {
            alert("Failed to delete user.");
        }
    } catch (err) {
        console.error(err);
    }
}