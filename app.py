from flask import Flask, jsonify
from supabase import create_client
import os

app = Flask(__name__)

# Connect to Supabase using Render environment variables
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Root route
@app.route("/")
def home():
    return "SACCO SERVER RUNNING"

# Robust members route
@app.route("/members")
def get_members():
    # Try lowercase first
    response = supabase.table("members").select("*").execute()
    
    if response.data:  # Found rows
        return jsonify(response.data)
    
    # If empty, try capitalized first letter
    response2 = supabase.table("Members").select("*").execute()
    
    if response2.data:
        return jsonify(response2.data)
    
    # Still empty, print debug info in logs
    print("DEBUG: No members found")
    print("Lowercase query:", response.data)
    print("Capitalized query:", response2.data)
    
    return jsonify([])

if __name__ == "__main__":
    app.run()
