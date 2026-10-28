import sqlite3

conn = sqlite3.connect("homestay.db")
conn.execute("DELETE FROM bookings")
conn.execute("DELETE FROM sqlite_sequence WHERE name = 'bookings'")
conn.commit()
conn.close()

print("All bookings deleted. The next booking will be number 1.")