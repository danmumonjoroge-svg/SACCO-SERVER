from flask import Flask, jsonify
from supabase import create_client
import os

app = Flask(__name__)

# Step 1a — Connect to Supabase using environment variables from Render
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Step 1b — Simple root route
@app.route("/")
def home():
    return "SACCO SERVER RUNNING"

# Step 1c — Route to fetch all members
@app.route("/members")
def get_members():
    response = supabase.table("members").select("*").execute()
    return jsonify(response.data)

if __name__ == "__main__":
    app.run()
