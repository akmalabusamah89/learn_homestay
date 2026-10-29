import os
import base64
import hashlib
import hmac
import json
import time
import psycopg
from psycopg import errors as pg_errors
import smtplib
from typing import Optional  
from email.message import EmailMessage
from dotenv import load_dotenv
from psycopg.rows import dict_row
from datetime import datetime, date
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

# CORS must list the exact origin the browser sends. The deployed frontend is
# https://learn-homestay.pages.dev, not "learn-homestay-pages.dev".
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://learn-homestay.pages.dev",           # Frontend (Cloudflare Pages)
        "http://localhost:8000",                      # Local backend
        "http://127.0.0.1:8000",
        "http://localhost:5500",                      # VS Code Live Server
        "http://127.0.0.1:5500",
    ],
    # Preview deployments look like <hash>.learn-homestay.pages.dev
    allow_origin_regex=r"https://([a-z0-9-]+\.)*learn-homestay\.pages\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------
# Session tokens
# Signed (stateless) tokens survive Render restarts and redeploys.
# An in-memory dict would log every user out on each restart.
# ---------------------------------------------------------------
SECRET_KEY = os.environ.get("SECRET_KEY", "").encode()
if not SECRET_KEY:
    # Without SECRET_KEY sessions are per-process: set it in Render's env vars.
    SECRET_KEY = os.urandom(32)
    print("WARNING: SECRET_KEY is not set; tokens will not survive a restart.")
TOKEN_TTL_SECONDS = 60 * 60 * 12


def _sign(payload: str) -> str:
    return hmac.new(SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()


def create_token(role: str, user_id: int) -> str:
    body = json.dumps(
        {"role": role, "user_id": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS}
    )
    raw = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return f"{raw}.{_sign(raw)}"


def decode_token(token: str) -> Optional[dict]:
    raw, _, signature = token.partition(".")
    if not raw or not signature:
        return None
    if not hmac.compare_digest(signature, _sign(raw)):
        return None
    try:
        padded = raw + "=" * (-len(raw) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return None
    if int(data.get("exp", 0)) < time.time():
        return None
    return {"role": data.get("role"), "user_id": data.get("user_id")}


def session_from(credentials: HTTPAuthorizationCredentials) -> dict:
    session = decode_token(credentials.credentials)
    if not session:
        raise HTTPException(
            status_code=401, detail="Session expired. Please log in again."
        )
    return session

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
    SENDER_EMAIL = os.environ.get("SMTP_EMAIL")
    SENDER_PASSWORD = os.environ.get("SMTP_PASSWORD")

    if not SENDER_EMAIL or not SENDER_PASSWORD:
        print("Booking email skipped: SMTP_EMAIL / SMTP_PASSWORD are not configured")
        return

    msg = EmailMessage()
    msg["Subject"] = f"Booking Confirmation - {homestay_name}"
    msg["From"] = SENDER_EMAIL
    msg["To"] = to_email
    
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
    try:
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
    except pg_errors.UniqueViolation:
        raise HTTPException(
            status_code=409, detail="An account with this email already exists."
        )

    # 3. Generate session token
    token = create_token(user["role"], user["id"])

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

    token = create_token(user["role"], user["id"])
    
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

    token = create_token(user["role"], user["id"])
    
    return {"token": token, "role": user["role"]}


# ---------------------------------------------------------------
# Authorization Guards
# ---------------------------------------------------------------
def require_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    session = session_from(credentials)
    if session.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return session

def require_any_owner_or_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    session = session_from(credentials)
    if session.get("role") not in ["super_admin", "admin", "house_owner"]:
        raise HTTPException(status_code=401, detail="Please log in")
    return session


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
            SELECT id, name, property_type, location, price, badge, image_url
            FROM learn.homestays
            ORDER BY id
        """).fetchall()
    return rows

@app.get("/api/listings")
def get_api_listings(credentials: HTTPAuthorizationCredentials = Depends(security)):
    session = session_from(credentials)
    
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
    session = session_from(credentials)
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

  
class HomestayUpdateData(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    property_type: Optional[str] = None
    location: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    image_url: Optional[str] = None
    badge: Optional[str] = None

@app.put("/homestays/{homestay_id}", dependencies=[Depends(require_any_owner_or_admin)])
def update_homestay(
    homestay_id: int,
    homestay: HomestayUpdateData,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    session = session_from(credentials)

    fields = homestay.model_dump(exclude_unset=True)

    # Support the frontend's "title" field mapping to database "name"
    if "title" in fields:
        fields["name"] = fields.pop("title")

    if not fields:
        raise HTTPException(status_code=400, detail="No fields provided")

    with get_database() as connection:
        if session["role"] == "house_owner":
            existing = connection.execute(
                """
                SELECT id FROM learn.homestays
                WHERE id = %s AND owner_id = %s
                """,
                (homestay_id, session["user_id"]),
            ).fetchone()
        else:
            existing = connection.execute(
                "SELECT id FROM learn.homestays WHERE id = %s",
                (homestay_id,),
            ).fetchone()

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Homestay not found or unauthorized",
            )

        set_clause = ", ".join(f"{field} = %s" for field in fields)
        values = list(fields.values()) + [homestay_id]

        connection.execute(
            f"""
            UPDATE learn.homestays
            SET {set_clause}
            WHERE id = %s
            """,
            values,
        )
        connection.commit()

    return {
        "message": "Homestay updated successfully",
        "id": homestay_id,
    }

# ---------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------
class BookingData(BaseModel):
    homestay_id: int
    guest_name: str = Field(min_length=1)
    email: str = Field(min_length=5)
    phone: str = Field(min_length=1)
    check_in: str   # Accept as string to prevent 400 validation crashes
    check_out: str  # Accept as string
    guests: int = Field(gt=0)

class StatusData(BaseModel):
    status: str = Field(pattern="^(confirmed|cancelled)$")


@app.post("/bookings")
def create_booking(booking: BookingData):
    try:
        # Explicitly parse them into date objects in case they came through as strings
        check_in_date = datetime.strptime(str(booking.check_in), "%Y-%m-%d").date()
        check_out_date = datetime.strptime(str(booking.check_out), "%Y-%m-%d").date()

        with get_database() as connection:
            homestay = connection.execute(
                "SELECT price, name FROM learn.homestays WHERE id = %s", 
                (booking.homestay_id,)
            ).fetchone()
            
            if not homestay:
                raise HTTPException(status_code=404, detail="Homestay not found")
            
            price_per_night = homestay["price"]
            homestay_name = homestay["name"]

            # Now we subtract the converted date objects safely
            nights = (check_out_date - check_in_date).days
            if nights <= 0:
                raise HTTPException(status_code=400, detail="Check-out date must be after check-in date.")
                
            total_price = float(price_per_night * nights)

            clash = connection.execute(
                """
                SELECT id FROM learn.bookings 
                WHERE homestay_id = %s 
                  AND status != 'cancelled'
                  AND (check_in < %s AND check_out > %s)
                """,
                (booking.homestay_id, check_out_date, check_in_date)
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
                    check_in_date,
                    check_out_date,
                    booking.guests,
                    total_price,
                ),
            ).fetchone()
            
            connection.commit()
            booking_id = new_booking["id"]

        try:
            send_booking_email(
                to_email=booking.email,
                guest_name=booking.guest_name,
                homestay_name=homestay_name,
                check_in=str(check_in_date),
                check_out=str(check_out_date),
                total_price=total_price
            )
        except Exception as email_err:
            print("Email sending failed, but booking succeeded:", email_err)

        return {
            "id": booking_id,
            "message": "Booking created successfully",
            "total_price": total_price
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print("Booking process crash error:", str(e))
        raise HTTPException(status_code=400, detail=str(e))

# Get all users for the admin panel
@app.get("/admin/users", dependencies=[Depends(require_super_admin)])
def get_admin_users():
    with get_database() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, username, email, role FROM learn.users ORDER BY id ASC;")
            users = cursor.fetchall()
    return users

@app.get("/bookings", dependencies=[Depends(require_any_owner_or_admin)])
def list_bookings(credentials: HTTPAuthorizationCredentials = Depends(security)):
    session = session_from(credentials)
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
    session = session_from(credentials)
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

    # Delete a user by ID
@app.delete(
    "/admin/users/{user_id}",
    dependencies=[Depends(require_super_admin)],
)
def delete_user(user_id: int):
    try:
        with get_database() as connection:
            result = connection.execute(
                "DELETE FROM learn.users WHERE id = %s",
                (user_id,),
            )

            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found")

            connection.commit()
    except pg_errors.ForeignKeyViolation:
        raise HTTPException(
            status_code=409,
            detail="This user still owns properties or bookings. Remove those first.",
        )

    return {"message": "User deleted successfully", "id": user_id}


# Delete Homestay
@app.delete("/homestays/{homestay_id}", dependencies=[Depends(require_any_owner_or_admin)])
def delete_homestay(
    homestay_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    session = session_from(credentials)

    try:
        with get_database() as connection:
            if session["role"] == "house_owner":
                result = connection.execute(
                    """
                    DELETE FROM learn.homestays
                    WHERE id = %s AND owner_id = %s
                    """,
                    (homestay_id, session["user_id"]),
                )
            else:
                result = connection.execute(
                    "DELETE FROM learn.homestays WHERE id = %s",
                    (homestay_id,),
                )

            if result.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Homestay not found or unauthorized",
                )

            connection.commit()
    except pg_errors.ForeignKeyViolation:
        raise HTTPException(
            status_code=409,
            detail="This property still has bookings. Delete or cancel those bookings first.",
        )

    return {"message": "Homestay deleted successfully", "id": homestay_id}