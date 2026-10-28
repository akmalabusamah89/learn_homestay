const API_URL = "https://learn-homestay-api-xpnf.onrender.com";


// ---------- page parts ----------
const cardsContainer = document.getElementById("cards");
const emptyMessage = document.getElementById("empty");

const registerModal = document.getElementById("registerModal");
const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMsg");

const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMsg");

const bookingModal = document.getElementById("bookingModal");
const bookingForm = document.getElementById("bookingForm");
const bookingMessage = document.getElementById("bookingMsg");

let allHomestays = [];
let currentFilter = "all";
let currentSearchText = "";


// ---------- helpers ----------
// Turn any text into plain text before it goes into the page, so nobody can
// sneak code into your website through a home name or a guest name.
function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function readJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}

function errorTextFrom(data, fallbackMessage) {
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) return data.detail.map(function (item) { return item.msg; }).join(", ");
    return fallbackMessage;
}

function todayAsText() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}


// ---------- the home cards ----------
function cardHtml(stay, index) {
    const photoClass = `photo photo-${(index % 4) + 1}`;
    
    // Normalize the image URL: prepend Supabase public storage if it's just a path/filename
    let imageUrl = stay.image_url || '';
    if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `https://illhmmrdchgyjoxowqhf.supabase.co/storage/v1/object/public/homestay-photos/${imageUrl}`;
    }

    const photoStyle = imageUrl
        ? `style="background-image: url('${encodeURI(imageUrl).replace(/'/g, "%27")}'); background-size: cover; background-position: center;"`
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
            <p class="place">${escapeHtml(stay.property_type || "Homestay")} • ${escapeHtml(stay.location)}</p>
            <div class="card-bottom">
                <p class="price"><strong>RM ${escapeHtml(stay.price)}</strong> / night</p>
                <button class="book-btn" type="button" data-id="${stay.id}" data-name="${escapeHtml(stay.name)}" data-price="${escapeHtml(stay.price)}">Book Now</button>
            </div>
        </div>`;
}

function renderHomestays(homestays) {
    if (homestays.length === 0) {
        emptyMessage.textContent = allHomestays.length === 0
            ? "No homes have been listed yet."
            : "No homes match your search.";
        emptyMessage.hidden = false;
        cardsContainer.innerHTML = "";
        return;
    }

    emptyMessage.hidden = true;
    cardsContainer.innerHTML = homestays.map(cardHtml).join("");
}

// Applies the type filter and the search text together
function showHomestays() {
    const searchText = currentSearchText.trim().toLowerCase();

    const matchingHomestays = allHomestays.filter(function (stay) {
        const typeMatches = currentFilter === "all"
            || String(stay.property_type || "").toLowerCase() === currentFilter.toLowerCase();

        const textMatches = !searchText
            || [stay.name, stay.location, stay.property_type].some(function (value) {
                return String(value || "").toLowerCase().includes(searchText);
            });

        return typeMatches && textMatches;
    });

    renderHomestays(matchingHomestays);
}

async function loadHomestays() {
    try {
        const response = await fetch(`${API_URL}/homestays`);
        if (!response.ok) throw new Error("Failed to load homestays");

        allHomestays = await response.json();
        showHomestays();
    } catch (error) {
        console.error("Error loading homestays:", error);
        emptyMessage.textContent = "Could not load homes. Is the backend running?";
        emptyMessage.hidden = false;
    }
}

// Called from the filter buttons in index.html (onclick="filterStays('Villa', event)")
function filterStays(type, event) {
    document.querySelectorAll(".filter-pill").forEach(function (pill) {
        pill.classList.remove("active");
    });
    event.target.classList.add("active");

    currentFilter = type;
    showHomestays();
}


// ---------- search bar ----------
const searchInput = document.getElementById("searchInput");
const searchButton = document.querySelector(".search-btn");

function runSearch() {
    currentSearchText = searchInput ? searchInput.value : "";
    showHomestays();
}

searchButton?.addEventListener("click", runSearch);
searchInput?.addEventListener("keydown", function (event) {
    if (event.key === "Enter") runSearch();
});


// ---------- booking ----------
function openBookingModal(id, name, price) {
    document.getElementById("bookingHomestayId").value = id;
    document.getElementById("modalStayTitle").textContent = `Book: ${name}`;
    document.getElementById("modalStayPrice").textContent = `RM ${price} per night`;

    const checkInInput = document.getElementById("checkInDate");
    const checkOutInput = document.getElementById("checkOutDate");
    checkInInput.min = todayAsText();
    checkOutInput.min = todayAsText();

    bookingMessage.textContent = "";
    bookingModal.hidden = false;
}

// One listener for every "Book Now" button
cardsContainer?.addEventListener("click", function (event) {
    const bookButton = event.target.closest(".book-btn");
    if (!bookButton) return;

    openBookingModal(Number(bookButton.dataset.id), bookButton.dataset.name, bookButton.dataset.price);
});

document.getElementById("checkInDate")?.addEventListener("change", function (event) {
    document.getElementById("checkOutDate").min = event.target.value;
});

bookingForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const bookingData = {
        homestay_id: parseInt(document.getElementById("bookingHomestayId").value),
        guest_name: document.getElementById("guestName").value,
        email: document.getElementById("guestEmail").value,
        phone: document.getElementById("guestPhone").value,
        check_in: document.getElementById("checkInDate").value,
        check_out: document.getElementById("checkOutDate").value,
        guests: parseInt(document.getElementById("guestCount").value),
    };

    bookingMessage.className = "form-msg";
    bookingMessage.textContent = "Processing reservation...";

    try {
        const response = await fetch(`${API_URL}/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bookingData),
        });

        const data = await readJson(response);
        if (!response.ok) throw new Error(errorTextFrom(data, "Booking failed"));

        bookingMessage.className = "form-msg ok";
        bookingMessage.textContent = `Booking confirmed! Total: RM ${data.total_price}`;
        bookingForm.reset();

        setTimeout(function () {
            bookingModal.hidden = true;
        }, 2500);
    } catch (error) {
        bookingMessage.className = "form-msg err";
        bookingMessage.textContent = error.message;
    }
});

document.getElementById("closeBooking")?.addEventListener("click", function () {
    bookingModal.hidden = true;
});


// ---------- open and close the register and login boxes ----------
function openRegisterModal(event) {
    event.preventDefault();
    if (registerMessage) registerMessage.textContent = "";
    if (registerModal) registerModal.hidden = false;
}

document.getElementById("registerNavBtn")?.addEventListener("click", openRegisterModal);
document.getElementById("becomeHostBtn")?.addEventListener("click", openRegisterModal);
document.getElementById("closeRegister")?.addEventListener("click", function () {
    if (registerModal) registerModal.hidden = true;
});

document.getElementById("loginBtn")?.addEventListener("click", function () {
    if (loginMessage) loginMessage.textContent = "";
    if (loginModal) loginModal.hidden = false;
});
document.getElementById("closeLogin")?.addEventListener("click", function () {
    if (loginModal) loginModal.hidden = true;
});


// ---------- register as a host ----------
registerForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("registerEmail")?.value.trim();
    const password = document.getElementById("registerPassword")?.value;

    if (registerMessage) {
        registerMessage.className = "form-msg";
        registerMessage.textContent = "Registering your account...";
    }

    try {
        const response = await fetch(`${API_URL}/register-owner`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await readJson(response);
        if (!response.ok) throw new Error(errorTextFrom(data, "Registration failed"));

        if (registerMessage) {
            registerMessage.className = "form-msg ok";
            registerMessage.textContent = "Registration successful! Opening your dashboard...";
        }
        registerForm.reset();

        if (data.token) {
            localStorage.setItem("token", data.token);
            localStorage.setItem("role", data.role || "house_owner");

            setTimeout(function () {
                window.location.href = "owner.html";
            }, 1200);
        } else {
            if (registerMessage) {
                registerMessage.textContent = "Registration successful! Please log in.";
            }
        }
    } catch (error) {
        if (registerMessage) {
            registerMessage.className = "form-msg err";
            registerMessage.textContent = error.message;
        }
    }
});


// ---------- log in ----------
loginForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("ownerPassword")?.value;

    if (loginMessage) {
        loginMessage.className = "form-msg";
        loginMessage.textContent = "Signing in...";
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await readJson(response);
        if (!response.ok) throw new Error(errorTextFrom(data, "Invalid email or password"));

        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);

        if (loginMessage) {
            loginMessage.className = "form-msg ok";
            loginMessage.textContent = "Login successful! Opening your dashboard...";
        }

        setTimeout(function () {
            window.location.href = "owner.html";
        }, 800);
    } catch (error) {
        if (loginMessage) {
            loginMessage.className = "form-msg err";
            loginMessage.textContent = error.message;
        }
    }
});


// ---------- start ----------
loadHomestays();