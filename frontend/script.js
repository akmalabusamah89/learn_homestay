const API_URL = "http://127.0.0.1:8000";

const registerModal = document.getElementById("registerModal");
const registerForm = document.getElementById("registerForm");
const registerMsg = document.getElementById("registerMsg");

const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");

const bookingModal = document.getElementById("bookingModal");
const bookingForm = document.getElementById("bookingForm");
const bookingMsg = document.getElementById("bookingMsg");

const cardsContainer = document.getElementById("cards");
const emptyMsg = document.getElementById("empty");

let allHomestays = [];

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function cardHtml(stay, index) {
    const photoClass = `photo photo-${(index % 4) + 1}`;
    const photoStyle = stay.image_url && stay.image_url.startsWith("https://")
        ? `style="background-image: url('${encodeURI(stay.image_url).replace(/'/g, "%27")}'); background-size: cover; background-position: center;"`
        : "";
    
    return `
        <div class="card">
            <div class="${photoClass}" ${photoStyle}>
                ${stay.badge ? `<span class="badge">${escapeHtml(stay.badge)}</span>` : ""}
                <button class="heart" type="button">♥</button>
            </div>
            <div class="card-info">
                <h3>${escapeHtml(stay.name)}</h3>
            </div>
            <p class="place">${escapeHtml(stay.property_type || 'Homestay')} • ${escapeHtml(stay.location)}</p>
            <div class="card-bottom">
                <p class="price"><strong>RM ${escapeHtml(stay.price)}</strong> / night</p>
                <button class="book-btn" type="button" data-id="${stay.id}" data-name="${escapeHtml(stay.name)}" data-price="${escapeHtml(stay.price)}">Book Now</button>
            </div>
        </div>`;
}

async function loadHomestays() {
    try {
        const response = await fetch(`${API_URL}/homestays`);
        if (!response.ok) throw new Error("Failed to load homestays");

        allHomestays = await response.json();
        renderHomestays(allHomestays);
    } catch (error) {
        console.error("Error loading homestays:", error);
    }
}

function renderHomestays(homestays) {
    if (homestays.length === 0) {
        emptyMsg.hidden = false;
        cardsContainer.innerHTML = "";
        return;
    }
    emptyMsg.hidden = true;
    cardsContainer.innerHTML = homestays.map(cardHtml).join("");
}

function filterStays(type, event) {
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (type === 'all') {
        renderHomestays(allHomestays);
    } else {
        const filtered = allHomestays.filter(s => s.property_type === type);
        renderHomestays(filtered);
    }
}

cardsContainer?.addEventListener("click", function (event) {
    const bookButton = event.target.closest(".book-btn");
    if (!bookButton) return;
    openBookingModal(Number(bookButton.dataset.id), bookButton.dataset.name, bookButton.dataset.price);
});

function openBookingModal(id, name, price) {
    document.getElementById("bookingHomestayId").value = id;
    document.getElementById("modalStayTitle").textContent = `Book: ${name}`;
    document.getElementById("modalStayPrice").textContent = `RM ${price} per night`;
    bookingMsg.textContent = "";
    bookingModal.hidden = false;
}

bookingForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const payload = {
        homestay_id: parseInt(document.getElementById("bookingHomestayId").value),
        guest_name: document.getElementById("guestName").value,
        email: document.getElementById("guestEmail").value,
        phone: document.getElementById("guestPhone").value,
        check_in: document.getElementById("checkInDate").value,
        check_out: document.getElementById("checkOutDate").value,
        guests: parseInt(document.getElementById("guestCount").value)
    };

    bookingMsg.className = "form-msg";
    bookingMsg.textContent = "Processing reservation...";

    try {
        const response = await fetch(`${API_URL}/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Booking failed");

        bookingMsg.className = "form-msg ok";
        bookingMsg.textContent = `Success! Total: RM ${data.total_price}. Confirmation email sent!`;
        bookingForm.reset();

        setTimeout(() => {
            bookingModal.hidden = true;
        }, 2000);

    } catch (err) {
        bookingMsg.className = "form-msg err";
        bookingMsg.textContent = err.message;
    }
});

document.getElementById("closeBooking")?.addEventListener("click", () => bookingModal.hidden = true);
document.getElementById("registerNavBtn")?.addEventListener("click", (e) => { e.preventDefault(); registerModal.hidden = false; registerMsg.textContent = ""; });
document.getElementById("becomeHostBtn")?.addEventListener("click", (e) => { e.preventDefault(); registerModal.hidden = false; registerMsg.textContent = ""; });
document.getElementById("closeRegister")?.addEventListener("click", () => registerModal.hidden = true);
document.getElementById("loginBtn")?.addEventListener("click", () => { loginModal.hidden = false; loginMsg.textContent = ""; });
document.getElementById("closeLogin")?.addEventListener("click", () => loginModal.hidden = true);

registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    registerMsg.className = "form-msg";
    registerMsg.textContent = "Registering your account...";

    try {
        const response = await fetch(`${API_URL}/register-owner`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Registration failed");

        registerMsg.className = "form-msg ok";
        registerMsg.textContent = "Registration successful! Redirecting to login...";
        registerForm.reset();

        setTimeout(() => {
            registerModal.hidden = true;
            loginModal.hidden = false;
            document.getElementById("loginEmail").value = email;
        }, 1200);

    } catch (error) {
        registerMsg.className = "form-msg err";
        registerMsg.textContent = error.message;
    }
});

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("ownerPassword").value;

    loginMsg.className = "form-msg";
    loginMsg.textContent = "Signing in...";

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Invalid email or password");

        loginMsg.className = "form-msg ok";
        loginMsg.textContent = "Login successful! Redirecting to dashboard...";
        
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);

        setTimeout(() => {
            loginModal.hidden = true;
            window.location.href = "owner.html";
        }, 1000);

    } catch (error) {
        loginMsg.className = "form-msg err";
        loginMsg.textContent = error.message;
    }
});

document.addEventListener("DOMContentLoaded", loadHomestays);