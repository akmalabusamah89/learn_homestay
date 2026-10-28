# `class` and `BaseModel` (notes from my homestay project)

## 1. What is a `class`?

A **class** is a blueprint. It describes what a thing looks like and what it can do.
An **object** (also called an *instance*) is one real thing made from that blueprint.

Example from real life:

- Blueprint (class): "a booking has a guest name, check-in date, check-out date"
- Object: "Aisyah's booking, 10 to 13 Nov"

```python
class Booking:
    guest_name: str
    check_in: str
    check_out: str
```

Making an object from a class:

```python
b = Booking()
b.guest_name = "Aisyah"
print(b.guest_name)   # Aisyah
```

### Words to remember

| Word | Meaning |
|---|---|
| class | the blueprint |
| object / instance | one thing made from the blueprint |
| attribute | a piece of data inside the object, like `guest_name` |
| `b.guest_name` | the dot means "the `guest_name` that belongs to `b`" |

## 2. What is `BaseModel`?

`BaseModel` is a ready-made class that comes from a package called **Pydantic**
(it is installed together with FastAPI).

```python
from pydantic import BaseModel
```

When my class **inherits** from `BaseModel`, it gets extra powers for free:

```python
class BookingIn(BaseModel):
```

The brackets `(BaseModel)` mean: "`BookingIn` is a BaseModel with everything BaseModel can do,
plus my own fields."

### What the extra powers are

1. **It checks the type of every field.** `guests: int` rejects the text `"abc"`.
2. **It converts when it can.** The text `"2026-11-10"` becomes a real `date`.
3. **It rejects missing or wrong data** before my code runs.
4. **It turns JSON from the page into a Python object**, so I can write `b.guest_name`.

## 3. My booking model, line by line

```python
class BookingIn(BaseModel):
    homestay_id: int
    guest_name: str = Field(min_length=1)
    phone: str = ""
    check_in: date
    check_out: date
    guests: int = Field(gt=0)
```

| Line | Meaning |
|---|---|
| `homestay_id: int` | required, must be a whole number |
| `guest_name: str = Field(min_length=1)` | required text, cannot be empty |
| `phone: str = ""` | optional, default is an empty text |
| `check_in: date` | required, must be a real date like `2026-11-10` |
| `guests: int = Field(gt=0)` | required whole number, **g**reater **t**han 0 |

The format is always `name: type`, and `= something` after it sets a default or a rule.

`Field(...)` adds extra rules:

- `min_length=1` for text
- `gt=0` for numbers (greater than 0)
- `ge=1` would mean greater than or equal to 1
- `max_length=100` for a maximum text length

## 4. How FastAPI uses it

```python
@app.post("/bookings", status_code=201)
def create_booking(b: BookingIn):
    ...
```

`b: BookingIn` tells FastAPI:

1. Read the JSON that the page sent.
2. Check it against `BookingIn`.
3. If it is good, give my function a ready object `b`.
4. If it is bad, send back an error **without running my function**.

Inside the function I can then write:

```python
b.guest_name      # "Aisyah"
b.check_in        # a real date, not text
b.guests          # a number
```

## 5. What the page sends and what happens

Good request:

```json
{
  "homestay_id": 2,
  "guest_name": "Aisyah",
  "phone": "0123456789",
  "check_in": "2026-11-10",
  "check_out": "2026-11-13",
  "guests": 2
}
```

Bad requests and the answers they get:

| Request problem | Result |
|---|---|
| `"guests": 0` | `422` error, must be greater than 0 |
| `"guest_name": ""` | `422` error, too short |
| `"check_in": "hello"` | `422` error, not a valid date |
| `homestay_id` missing | `422` error, field required |

`422` means "I understood the request, but the data is not valid."

## 6. Why do it this way?

- **Safety:** never trust data from outside. The model is the first guard.
- **Less code:** I do not write `if type(guests) != int` checks by hand.
- **Clear documentation:** the `/docs` page shows the fields automatically.
- **Easy to read:** one place that says what a booking looks like.

## 7. Two kinds of checks in my code

| Kind | Where | Example |
|---|---|---|
| Shape of the data | the `BaseModel` | guests must be a number above 0 |
| Business rules | inside the function | check-out must be after check-in |

The model cannot know that leaving before arriving is nonsense, so my function checks it.

## 8. Practice

1. Add `email: str = ""` to `BookingIn`. Look at `/docs` and see the new field appear.
2. Change `guests: int = Field(gt=0)` to `Field(gt=0, le=6)` so a booking cannot exceed 6 guests.
   Try `"guests": 7` and read the error message.
3. Write a new model called `HomestayIn` for adding a home, with `name`, `place`, `price` and `rating`.
   Which `Field` rules would make sense? (for example `price` must be greater than 0)

## 9. Quick summary

- A **class** is a blueprint, and an **object** is one thing made from it.
- `BaseModel` is a class that **checks and converts data** for me.
- `class BookingIn(BaseModel)` means "my class inherits the powers of BaseModel".
- FastAPI uses it in `def create_booking(b: BookingIn)` to check the request before my code runs.
