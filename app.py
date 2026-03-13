from flask import Flask, jsonify
from supabase import create_client
import os

app = Flask(__name__)

# Connect to Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# -------------------------------
# Root route (server test)
# -------------------------------
@app.route("/")
def home():
    return "SACCO SERVER RUNNING"


# -------------------------------
# Get all members
# -------------------------------
@app.route("/members")
def get_members():
    response = supabase.table("members").select("*").execute()
    return jsonify(response.data)


# -------------------------------
# Get savings for a specific member
# Example: /savings/UI-0001
# -------------------------------
@app.route("/savings/<member_id>")
def get_savings(member_id):
    response = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute()
    return jsonify(response.data)


# -------------------------------
# Calculate total deposit
# Example: /total_deposit/UI-0001
# -------------------------------
@app.route("/total_deposit/<member_id>")
def total_deposit(member_id):

    response = supabase.table("savings_transactions").select("amount").eq("member_id", member_id).execute()

    total = 0
    for row in response.data:
        total += float(row["amount"])

    return jsonify({
        "member_id": member_id,
        "total_deposit": total
    })


# Run the server
if __name__ == "__main__":
    app.run()
