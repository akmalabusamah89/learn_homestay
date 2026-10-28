Code	                    Purpose
import os	                Reads environment variables, such as the owner's password.
import secrets	            Generates secure random login tokens and compares passwords safely.
import sqlite3	            Connects Python to the SQLite database.
from datetime import date	Works with dates, such as check-in and check-out.
FastAPI	                    Creates your backend application and API endpoints.
Header	                    Reads information from HTTP request headers.
HTTPException	            Returns errors such as 401, 404, or 409.
CORSMiddleware	            Controls which websites are allowed to call your backend from a browser.
BaseModel	                Defines the structure of incoming data.
Field	                    Adds validation rules, such as requiring a positive number of guests


CORS stands for Cross-Origin Resource Sharing.

Your frontend may run at http://localhost:5500, while your backend runs at http://127.0.0.1:8000. Because these are different origins, the browser may block requests unless CORS permits them.
- allow_origins: Permits these two frontend addresses.
- allow_methods: Permits GET, POST, and PATCH requests.
- allow_headers: Permits the browser to send authorization and JSON content headers.