const API_URL = "https://learn-homestay-api-xxxx.onrender.com";
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

function logoutAdmin() {
    localStorage.clear();
    window.location.href = 'index.html';
}