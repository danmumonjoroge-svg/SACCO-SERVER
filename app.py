from flask import Flask, jsonify, request
from supabase import create_client
import os
from datetime import datetime

app = Flask(__name__)

# -------------------------------
# Connect to Supabase using Render environment variables
# -------------------------------
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
# Members routes
# -------------------------------
@app.route("/members")
def get_members():
    response = supabase.table("members").select("*").execute()
    return jsonify(response.data)


@app.route("/members/<member_id>")
def get_member(member_id):
    response = supabase.table("members").select("*").eq("id", member_id).execute()
    if response.data:
        return jsonify(response.data[0])
    return jsonify({"error": "Member not found"}), 404


# -------------------------------
# Savings transactions routes
# -------------------------------
@app.route("/savings/<member_id>")
def get_savings(member_id):
    response = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute()
    return jsonify(response.data)


@app.route("/total_deposit/<member_id>")
def total_deposit(member_id):
    response = supabase.table("savings_transactions").select("amount").eq("member_id", member_id).execute()
    total = sum([float(row["amount"]) for row in response.data])
    return jsonify({"member_id": member_id, "total_deposit": total})


# -------------------------------
# Loan application routes
# -------------------------------
@app.route("/loan_applications")
def get_loan_applications():
    response = supabase.table("loan_applications").select("*").execute()
    return jsonify(response.data)


@app.route("/loan_applications/<application_id>")
def get_loan_application(application_id):
    response = supabase.table("loan_applications").select("*").eq("application_id", application_id).execute()
    if response.data:
        return jsonify(response.data[0])
    return jsonify({"error": "Application not found"}), 404


@app.route("/loan_apply", methods=["POST"])
def loan_apply():
    data = request.json
    # Required: member_id, amount_requested, description
    if not all(k in data for k in ("member_id", "amount_requested")):
        return jsonify({"error": "Missing fields"}), 400

    new_app = {
        "member_id": data["member_id"],
        "amount_requested": float(data["amount_requested"]),
        "application_date": datetime.utcnow().isoformat(),
        "status": "pending",
        "description": data.get("description", "")
    }
    response = supabase.table("loan_applications").insert(new_app).execute()
    return jsonify(response.data[0])


@app.route("/approve_loan/<application_id>", methods=["POST"])
def approve_loan(application_id):
    # Fetch application
    app_resp = supabase.table("loan_applications").select("*").eq("application_id", application_id).execute()
    if not app_resp.data:
        return jsonify({"error": "Application not found"}), 404

    application = app_resp.data[0]

    # Create loan record
    loan_data = {
        "member_id": application["member_id"],
        "principal": application["amount_requested"],
        "interest_rate": float(request.json.get("interest_rate", 10)),  # default 10%
        "application_date": application["application_date"],
        "due_date": request.json.get("due_date"),  # e.g., "2026-06-14"
        "status": "in progress",
        "description": application.get("description", "")
    }
    loan_resp = supabase.table("loans").insert(loan_data).execute()

    # Update application status
    supabase.table("loan_applications").update({"status": "approved"}).eq("application_id", application_id).execute()

    return jsonify({
        "application": application,
        "loan_created": loan_resp.data[0]
    })


# -------------------------------
# Loan security routes
# -------------------------------
@app.route("/loan_security/<loan_id>")
def get_loan_security(loan_id):
    response = supabase.table("loan_security").select("*").eq("loan_id", loan_id).execute()
    return jsonify(response.data)


@app.route("/add_loan_security", methods=["POST"])
def add_loan_security():
    data = request.json
    required_fields = ("loan_id", "security_type", "value")
    if not all(k in data for k in required_fields):
        return jsonify({"error": "Missing fields"}), 400

    security_data = {
        "loan_id": data["loan_id"],
        "security_type": data["security_type"],  # guarantor, asset, deposit
        "member_id": data.get("member_id", None),
        "description": data.get("description", ""),
        "value": float(data["value"]),
        "status": "active",
        "created_at": datetime.utcnow().isoformat()
    }
    response = supabase.table("loan_security").insert(security_data).execute()
    return jsonify(response.data[0])


# -------------------------------
# Member statement
# -------------------------------
@app.route("/member_statement/<member_id>")
def member_statement(member_id):
    # Member info
    member_resp = supabase.table("members").select("*").eq("id", member_id).execute()
    if not member_resp.data:
        return jsonify({"error": "Member not found"}), 404
    member = member_resp.data[0]

    # Savings
    savings_resp = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute()
    savings = savings_resp.data
    total_savings = sum([float(s["amount"]) for s in savings])

    # Loans
    loans_resp = supabase.table("loans").select("*").eq("member_id", member_id).execute()
    loans = loans_resp.data

    # Prepare statement
    statement = {
        "member": member,
        "total_savings": total_savings,
        "savings_transactions": savings,
        "loans": loans
    }
    return jsonify(statement)


# -------------------------------
# Run the server
# -------------------------------
if __name__ == "__main__":
    app.run()
