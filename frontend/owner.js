const API_URL = "https://learn-homestay-api-xpnf.onrender.com";
let currentListings = [];

// Helper to get headers with Bearer Token if available
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

async function loadOwnerProperties() {
    try {
        // Fixed URL: removed '/api' and changed 'listings' to 'homestays'
        const res = await fetch(`${API_URL}/homestays`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) return;
        currentListings = await res.json();
        
        const grid = document.getElementById('ownerPropertiesGrid');
        if (!grid) return;

        if (currentListings.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-muted); padding: 16px;">No properties found. Click "+ Add New Property" to create one.</p>`;
            return;
        }

        grid.innerHTML = currentListings.map(item => {
            let imgSrc = item.image_url;
            if (imgSrc && !imgSrc.startsWith('http')) {
                imgSrc = `https://illhmmrdchgyjoxowqhf.supabase.co/storage/v1/object/public/homestay-photos/${imgSrc}`;
            }
            const finalImage = imgSrc || 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80';

            return `
                <div class="prop-card">
                    <img src="${finalImage}" alt="${item.title || item.name || 'Homestay Property'}" class="prop-img">
                    <div class="prop-body">
                        <h3 class="prop-title">${item.title || item.name}</h3>
                        <p class="prop-loc">${item.location}</p>
                        <p><strong>RM ${item.price}</strong> / night</p>
                        
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button type="button" class="btn-outline" onclick="openEditModal(${item.id})" style="flex: 1;">Edit Property</button>
                            <button type="button" class="btn-outline" onclick="deleteProperty(${item.id})" style="flex: 1; border-color: #dc3545; color: #dc3545;">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Could not fetch properties", err);
    }
}

/* Modal Functions for Add Property */
function openAddModal() {
    const modal = document.getElementById('addModal');
    if (modal) modal.style.display = 'flex';
}

function closeAddModal() {
    const modal = document.getElementById('addModal');
    if (modal) modal.style.display = 'none';
}

const addForm = document.getElementById('addForm');
if (addForm) {
    addForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const newPropertyData = {
            name: document.getElementById('addName').value,
            property_type: document.getElementById('addType').value,
            location: document.getElementById('addLocation').value,
            price: parseFloat(document.getElementById('addPrice').value),
            image_url: document.getElementById('addImage').value || null,
            badge: document.getElementById('addBadge').value || null
        };

        try {
            const response = await fetch(`${API_URL}/homestays`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(newPropertyData)
            });

            if (response.ok) {
                closeAddModal();
                addForm.reset();
                loadOwnerProperties();
            } else {
                const errData = await response.json();
                alert('Failed to create property: ' + (errData.detail || 'Please make sure you are logged in.'));
            }
        } catch (err) {
            alert('Error connecting to backend server.');
        }
    });
}

/* Modal Functions for Edit Property */
function openEditModal(id) {
    const property = currentListings.find(p => p.id === id);
    if (!property) return;

    document.getElementById('editId').value = property.id;
    // Handle fallback if property model uses 'name' instead of 'title'
    const titleInput = document.getElementById('editTitle');
    if (titleInput) titleInput.value = property.title || property.name || '';

    document.getElementById('editLocation').value = property.location || '';
    document.getElementById('editPrice').value = property.price || '';
    document.getElementById('editImage').value = property.image_url || '';
    document.getElementById('editBadge').value = property.badge || '';

    const editModal = document.getElementById('editModal');
    if (editModal) editModal.style.display = 'flex';
}

function closeEditModal() {
    const editModal = document.getElementById('editModal');
    if (editModal) editModal.style.display = 'none';
}

const editForm = document.getElementById('editForm');
if (editForm) {
    editForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        
        // This is where the snippet goes:
        const updatedData = {
            name: document.getElementById('editTitle').value,
            location: document.getElementById('editLocation').value,
            price: parseFloat(document.getElementById('editPrice').value),
            image_url: document.getElementById('editImage').value || null,
            badge: document.getElementById('editBadge').value || null
        };

        try {
            const response = await fetch(`${API_URL}/homestays/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(updatedData)
            });

            if (response.ok) {
                closeEditModal();
                loadOwnerProperties();
            } else {
                const errData = await response.json();
                alert('Failed to update property: ' + (errData.detail || 'Error saving changes.'));
            }
        } catch (err) {
            alert('Error connecting to backend server.');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('role') || 'house_owner';
    const roleBadge = document.getElementById('userRoleBadge');
    if (roleBadge) roleBadge.textContent = `Role: ${role}`;

    if (role === 'admin' || role === 'super_admin') {
        const adminContainer = document.getElementById('adminPortalContainer');
        if (adminContainer) {
            adminContainer.innerHTML = `<a href="admin.html" class="btn-outline" style="border-color: var(--gold); color: var(--gold);">Admin Portal</a>`;
        }
    }

    loadOwnerProperties();
    loadBookings();
});

// Load Bookings with strict role-based delete visibility
async function loadBookings() {
    try {
        const res = await fetch(`${API_URL}/bookings`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) return;
        const bookings = await res.json();

        const tbody = document.getElementById('bookingsTableBody');
        if (!tbody) return;

        if (bookings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">No bookings found.</td></tr>`;
            return;
        }

        const role = localStorage.getItem('role');

        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td>${b.id}</td>
                <td>${b.homestay_name || 'Property #' + b.homestay_id}</td>
                <td>${b.guest_name}</td>
                <td>${b.check_in}</td>
                <td>${b.check_out}</td>
                <td>RM ${b.total_price}</td>
                <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: ${b.status === 'confirmed' ? '#e6f4ea' : '#fce8e6'}; color: ${b.status === 'confirmed' ? '#137333' : '#c5221f'};">${b.status}</span></td>
                <td>
                    ${role === 'super_admin' ? `<button class="btn-outline" style="padding: 4px 10px; font-size: 0.8rem; border-color: #c5221f; color: #c5221f;" onclick="deleteBooking(${b.id})">Delete</button>` : '<span style="color: var(--text-muted);">—</span>'}
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Could not fetch bookings", err);
    }
}

// Super admin delete booking action
async function deleteBooking(bookingId) {
    if (!confirm('Are you sure you want to delete this booking?')) return;

    try {
        const res = await fetch(`${API_URL}/bookings/${bookingId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (res.ok) {
            loadBookings();
        } else {
            alert('Failed to delete booking. Super Admin privileges required.');
        }
    } catch (err) {
        alert('Error connecting to backend server.');
    }
}

// Delete property action
async function deleteProperty(id) {
    if (!confirm('Are you sure you want to delete this property?')) return;

    try {
        const response = await fetch(`${API_URL}/api/homestays/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            loadOwnerProperties();
        } else {
            const errData = await response.json().catch(() => ({}));
            alert('Failed to delete property: ' + (errData.detail || 'Not Found or Unauthorized.'));
        }
    } catch (err) {
        alert('Error connecting to backend server.');
    }
}

// Bridge old function name to the modal opener
function editProperty(id) {
    openEditModal(id);
}