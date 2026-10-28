Trigger it inside your /bookings POST endpoint:
Whenever a booking is successfully inserted into your database, call send_booking_email(...) right before returning the response.

Part 2: How to Create an FPX Payment Gateway (Malaysia)
For a Malaysian platform like InappRest, integrating FPX (Online Banking like Maybank2u, CIMB Clicks, etc.) requires registering with a local payment gateway aggregator because direct bank APIs are locked to major corporations.

The best beginner-friendly and developer-friendly options in Malaysia are:

ToyyibPay (Very popular for small-to-medium Malaysian projects, easy sandbox/testing environment).

Billplz (Clean API documentation, great for billing/FPX).

Stripe Malaysia (Supports FPX natively via Stripe Checkout).

How the FPX Payment Flow Works:
User clicks "Pay with FPX" on your frontend (index.html).

#Your FastAPI backend sends a request to the Payment Gateway API (e.g., ToyyibPay/Billplz) to create a bill/payment order specifying the amount (e.g., RM 400) and the customer's email/phone.

The gateway returns a payment URL.

Your backend sends that URL back to the frontend, and your frontend redirects the customer to the FPX bank selection page.

After the customer completes payment at their bank, the gateway redirects them back to your website (success_url) and sends a Webhook (background notification) to your FastAPI backend to automatically update the booking status from pending to confirmed.

Example: Integrating ToyyibPay / Billplz Conceptually in FastAPI
Here is what the backend route looks like when a user initiates a payment: