from flask import Flask, jsonify
from supabase import create_client
import os

app = Flask(__name__)

# Connect to Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

@app.route("/")
def home():
    return "SACCO SERVER RUNNING"

@app.route("/members")
def get_members():
    # Fetch all members
    response = supabase.table("members").select("*").execute()
    return jsonify(response.data)

if __name__ == "__main__":
    app.run()
