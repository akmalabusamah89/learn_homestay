# def: The short keyword for "define". It tells Python: "Hey, I am building a function now!"
def health():
    return {"ok": True}

# Parameters: The placeholder variables inside the parentheses () when you create the function. They act as inputs.
# 'name' is the PARAMETER (the variable slot)
def greet_user(name):
    print(f"Hello, {name}!")

# "Alice" is the ARGUMENT (the real data filling the slot)
greet_user("Alice")

# "Carlos" is another ARGUMENT
greet_user("Carlos")

# Return: The keyword that exits a function and sends a value back to the main script. If you don't use return, the function gives back None.

# 1. DEFINING THE FUNCTION (Creating the recipe)
def make_coffee(beans_type, sugar_spoons):
    print(f"Grinding {beans_type} beans...")
    print(f"Adding {sugar_spoons} spoons of sugar...")
    return "☕ Your hot coffee is ready!"

# 2. CALLING THE FUNCTION (Actually making the coffee)
# We pass "Espresso" and 2 as arguments
my_drink = make_coffee("Espresso", 2)

# 3. USING THE RETURN VALUE
print(my_drink)
# Run Server
.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000

# Check language error
python -m py_compile main.py

# Clear database
python -c "import sqlite3; c = sqlite3.connect('homestay.db'); c.execute('DELETE FROM bookings'); c.commit()"