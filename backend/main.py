import os
import secrets
import psycopg
import smtplib
from typing import Optional  
from email.message import EmailMessage
from dotenv import load_dotenv
from psycopg.rows import dict_row
from datetime import date
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, EmailStr
import requests

app = FastAPI()
security = HTTPBearer()

load_dotenv()
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_database():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# token -> {"role": str, "user_id": int}
active_sessions = {}

# ---------------------------------------------------------------
# Pydantic Models (Defined at the top to prevent NameErrors)
# ---------------------------------------------------------------
class Listing(BaseModel):
    id: Optional[int] = None
    title: str = Field(alias="name") # Maps database 'name' column to 'title'
    property_type: Optional[str] = "Apartment"
    location: str
    price: float
    badge: Optional[str] = None      
    image_url: Optional[str] = None  

    class Config:
        populate_by_name = True

class OwnerRegisterData(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)

class LoginData(BaseModel):
    email: EmailStr
    password: str

class AdminLoginData(BaseModel):
    username: str
    password: str

# ---------------------------------------------------------------
# Email Notifications & Payments
# ---------------------------------------------------------------
def send_booking_email(to_email: str, guest_name: str, homestay_name: str, check_in: str, check_out: str, total_price: float):
    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    SENDER_EMAIL = "your-email@gmail.com"
    SENDER_PASSWORD = "your-gmail-app-password"

    msg = EmailMessage()
    msg.subject = f"Booking Confirmation - {homestay_name}"
    msg.from_ = SENDER_EMAIL
    msg.to = to_email
    
    msg.set_content(f"""
    Hi {guest_name},

    Thank you for booking with InappRest! Your booking details:
    
    - Stay: {homestay_name}
    - Check-in: {check_in}
    - Check-out: {check_out}
    - Total Price: RM {total_price}

    We look forward to hosting you in Malaysia!
    """)

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        print("Email sent successfully!")
    except Exception as e:
        print(f"Failed to send email: {e}")

@app.post("/create-fpx-payment")
def create_fpx_payment(booking_id: int, amount: float, customer_email: str, customer_phone: str):
    api_url = "https://toyyibpay.com/index.php/api/createBill"
    
    payload = {
        'userSecretKey': 'YOUR_TOYYIBPAY_SECRET_KEY',
        'categoryCode': 'YOUR_CATEGORY_CODE',
        'billName': 'InappRest Homestay Booking',
        'billDescription': f'Payment for booking ID {booking_id}',
        'billPriceSetting': 1,
        'billPayorInfo': 1,
        'billAmount': int(amount * 100),
        'billReturnUrl': 'http://127.0.0.1:8000/payment-success',
        'billCallbackUrl': 'http://127.0.0.1:8000/payment-callback',
        'billEmail': customer_email,
        'billPhone': customer_phone,
    }

    response = requests.post(api_url, data=payload)
    result = response.json()
    
    return {"payment_url": f"https://toyyibpay.com/{result[0]['BillCode']}"}


# ---------------------------------------------------------------
# Authentication Endpoints
# ---------------------------------------------------------------
@app.post("/register-owner")
def register_owner(data: OwnerRegisterData): # Fixed: changed RegisterData to OwnerRegisterData
    with get_database() as connection:
        # 1. Insert user into learn.users
        connection.execute(
            "INSERT INTO learn.users (username, email, password, role) VALUES (%s, %s, %s, %s)",
            (data.email, data.email, data.password, "house_owner")
        )
        
        # 2. Fetch the newly created user to get their ID
        user = connection.execute(
            "SELECT * FROM learn.users WHERE email = %s", (data.email,)
        ).fetchone()

    # 3. Generate active session token
    token = secrets.token_hex(16)
    active_sessions[token] = {"role": user["role"], "user_id": user["id"]}
    
    # 4. Return token & role so the frontend can save it to localStorage
    return {
        "token": token, 
        "role": user["role"], 
        "message": "Registration successful"
    }

@app.post("/login")
def login(login_data: LoginData):
    with get_database() as connection:
        user = connection.execute(
            "SELECT * FROM learn.users WHERE email = %s AND password = %s",
            (login_data.email, login_data.password)
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = secrets.token_hex(16)
    active_sessions[token] = {"role": user["role"], "user_id": user["id"]}
    
    return {"token": token, "role": user["role"]}

@app.post("/admin-login")
def admin_login(data: AdminLoginData):
    with get_database() as connection:
        user = connection.execute(
            "SELECT * FROM learn.users WHERE username = %s AND password = %s AND role IN ('admin', 'super_admin')",
            (data.username, data.password)
        ).fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid admin credentials or insufficient privileges")

    token = secrets.token_hex(16)
    active_sessions[token] = {"role": user["role"], "user_id": user["id"]}
    
    return {"token": token, "role": user["role"]}


# ---------------------------------------------------------------
# Authorization Guards
# ---------------------------------------------------------------
def require_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = active_sessions.get(token)
    if not session or session.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return token

def require_any_owner_or_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = active_sessions.get(token)
    if not session or session.get("role") not in ["super_admin", "admin", "house_owner"]:
        raise HTTPException(status_code=401, detail="Please log in")
    return token


# ---------------------------------------------------------------
# Homestays / Listings API
# ---------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}

@app.get("/homestays")
def list_homestays():
    with get_database() as connection:
        rows = connection.execute("""
            SELECT learn.homestays.*, learn.users.email AS owner_email 
            FROM learn.homestays 
            LEFT JOIN learn.users ON learn.homestays.owner_id = learn.users.id
            ORDER BY learn.homestays.id
        """).fetchall()
    return rows

@app.get("/api/listings")
def get_api_listings(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = active_sessions.get(token)
    
    if not session:
        raise HTTPException(status_code=401, detail="Please log in")
    
    role = session.get("role")
    user_id = session.get("user_id")

    with get_database() as connection:
        if role in ["admin", "super_admin"]:
            rows = connection.execute("""
                SELECT id, name AS title, property_type, location, price, badge, image_url 
                FROM learn.homestays 
                ORDER BY id
            """).fetchall()
        else:
            rows = connection.execute("""
                SELECT id, name AS title, property_type, location, price, badge, image_url 
                FROM learn.homestays 
                WHERE owner_id = %s
                ORDER BY id
            """, (user_id,)).fetchall()
            
    return rows
    
class HomestayCreateData(BaseModel):
    name: str = Field(min_length=2)
    property_type: str = Field(default="Apartment")
    location: str = Field(min_length=2)
    price: float = Field(gt=0)
    badge: Optional[str] = None      
    image_url: Optional[str] = None  

@app.post("/homestays", dependencies=[Depends(require_any_owner_or_admin)])
def create_homestay(data: HomestayCreateData, credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = active_sessions.get(token)
    owner_id = session.get("user_id")

    with get_database() as connection:
        new_stay = connection.execute(
            """
            INSERT INTO learn.homestays (name, property_type, location, price, badge, owner_id, image_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (data.name, data.property_type, data.location, data.price, data.badge, owner_id, data.image_url)
        ).fetchone()
        connection.commit()

    return {"message": "Homestay created successfully", "id": new_stay["id"]}

# Database-backed update route for Edit Property feature
@app.put("/api/listings/{listing_id}", response_model=Listing, dependencies=[Depends(require_any_owner_or_admin)])
def update_listing(listing_id: int, updated_listing: Listing):
    with get_database() as connection:
        existing = connection.execute(
            "SELECT id FROM learn.homestays WHERE id = %s", (listing_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Listing not found")

        connection.execute(
            """
            UPDATE learn.homestays 
            SET name = %s, location = %s, price = %s, badge = %s, image_url = %s 
            WHERE id = %s
            """,
            (
                updated_listing.title,
                updated_listing.location,
                updated_listing.price,
                updated_listing.badge,
                updated_listing.image_url,
                listing_id
            )
        )
        connection.commit()

        updated_record = connection.execute(
            "SELECT id, name, property_type, location, price, badge, image_url FROM learn.homestays WHERE id = %s",
            (listing_id,)
        ).fetchone()

    return updated_record


# ---------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------
class BookingData(BaseModel):
    homestay_id: int
    guest_name: str = Field(min_length=1)
    email: str = Field(min_length=5)
    phone: str = Field(min_length=1)
    check_in: date
    check_out: date
    guests: int = Field(gt=0)

class StatusData(BaseModel):
    status: str = Field(pattern="^(confirmed|cancelled)$")

@app.post("/bookings")
def create_booking(booking: BookingData):
    if booking.check_out <= booking.check_in:
        raise HTTPException(status_code=400, detail="Check-out date must be after check-in date.")

    with get_database() as connection:
        homestay = connection.execute(
            "SELECT price, name FROM learn.homestays WHERE id = %s", 
            (booking.homestay_id,)
        ).fetchone()
        
        if not homestay:
            raise HTTPException(status_code=404, detail="Homestay not found")
        
        price_per_night = homestay["price"]
        homestay_name = homestay["name"]

        nights = (booking.check_out - booking.check_in).days
        total_price = float(price_per_night * nights)

        clash = connection.execute(
            """
            SELECT id FROM learn.bookings 
            WHERE homestay_id = %s 
              AND status != 'cancelled'
              AND (check_in < %s AND check_out > %s)
            """,
            (booking.homestay_id, booking.check_out, booking.check_in)
        ).fetchone()

        if clash:
            raise HTTPException(status_code=400, detail="These dates are already booked.")

        new_booking = connection.execute(
            """
            INSERT INTO learn.bookings 
            (homestay_id, guest_name, email, phone, check_in, check_out, guests, total_price, status) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'confirmed') 
            RETURNING id
            """,
            (
                booking.homestay_id,
                booking.guest_name,
                booking.email,
                booking.phone,
                booking.check_in,
                booking.check_out,
                booking.guests,
                total_price,
            ),
        ).fetchone()
        
        connection.commit()
        booking_id = new_booking["id"]

    send_booking_email(
        to_email=booking.email,
        guest_name=booking.guest_name,
        homestay_name=homestay_name,
        check_in=str(booking.check_in),
        check_out=str(booking.check_out),
        total_price=total_price
    )

    return {
        "id": booking_id,
        "message": "Booking created successfully",
        "total_price": total_price
    }

@app.get("/bookings", dependencies=[Depends(require_any_owner_or_admin)])
def list_bookings(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = active_sessions.get(token)
    role = session.get("role")
    user_id = session.get("user_id")

    with get_database() as connection:
        if role in ["admin", "super_admin"]:
            rows = connection.execute("""
                SELECT learn.bookings.*, learn.homestays.name AS homestay_name
                FROM learn.bookings
                JOIN learn.homestays ON learn.homestays.id = learn.bookings.homestay_id
                ORDER BY learn.bookings.check_in DESC
            """).fetchall()
        else:
            rows = connection.execute("""
                SELECT learn.bookings.*, learn.homestays.name AS homestay_name
                FROM learn.bookings
                JOIN learn.homestays ON learn.homestays.id = learn.bookings.homestay_id
                WHERE learn.homestays.owner_id = %s
                ORDER BY learn.bookings.check_in DESC
            """, (user_id,)).fetchall()
    return rows

@app.patch("/bookings/{booking_id}", dependencies=[Depends(require_any_owner_or_admin)])
def set_booking_status(booking_id: int, new_status: StatusData, credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    session = active_sessions.get(token)
    role = session.get("role")
    user_id = session.get("user_id")

    with get_database() as connection:
        if role in ["admin", "super_admin"]:
            result = connection.execute(
                "UPDATE learn.bookings SET status = %s WHERE id = %s",
                (new_status.status, booking_id),
            )
        else:
            result = connection.execute(
                """
                UPDATE learn.bookings 
                SET status = %s 
                FROM learn.homestays 
                WHERE learn.bookings.id = %s 
                  AND learn.bookings.homestay_id = learn.homestays.id 
                  AND learn.homestays.owner_id = %s
                """,
                (new_status.status, booking_id, user_id),
            )

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Booking not found or unauthorized")

    return {"id": booking_id, "status": new_status.status}

@app.delete("/bookings/{booking_id}", dependencies=[Depends(require_super_admin)])
def delete_booking(booking_id: int):
    with get_database() as connection:
        result = connection.execute("DELETE FROM learn.bookings WHERE id = %s", (booking_id,))

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Booking not found")

    return {"message": "Booking deleted successfully", "id": booking_id}