from flask import Flask, jsonify, request
from supabase import create_client
import os

app = Flask(__name__)

# -------------------------
# Connect to Supabase
# -------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# -------------------------
# Test Server
# -------------------------
@app.route("/")
def home():
    return "SACCO SERVER RUNNING"


# =========================
# MEMBERS
# =========================

@app.route("/members")
def get_members():
    response = supabase.table("members").select("*").execute()
    return jsonify(response.data)


@app.route("/members/<member_id>")
def get_member(member_id):
    response = supabase.table("members").select("*").eq("id", member_id).execute()
    return jsonify(response.data)


# =========================
# SAVINGS
# =========================

@app.route("/savings/<member_id>")
def get_savings(member_id):
    response = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute()
    return jsonify(response.data)


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


# =========================
# LOAN APPLICATIONS
# =========================

@app.route("/loan-applications")
def loan_applications():
    response = supabase.table("loan_applications").select("*").execute()
    return jsonify(response.data)


@app.route("/loan-applications/<member_id>")
def member_loan_applications(member_id):

    response = supabase.table("loan_applications").select("*").eq("member_id", member_id).execute()

    return jsonify(response.data)


@app.route("/loan-applications", methods=["POST"])
def apply_loan():

    data = request.get_json()

    response = supabase.table("loan_applications").insert(data).execute()

    return jsonify({
        "status": "success",
        "data": response.data
    })


# =========================
# DISBURSED LOANS
# =========================

@app.route("/loans")
def get_loans():

    response = supabase.table("loans").select("*").execute()

    return jsonify(response.data)


@app.route("/loans/<member_id>")
def get_member_loans(member_id):

    response = supabase.table("loans").select("*").eq("member_id", member_id).execute()

    return jsonify(response.data)


# =========================
# LOAN REPAYMENT
# =========================

@app.route("/loan-repayments/<loan_id>")
def loan_repayments(loan_id):

    response = supabase.table("loan_repayment").select("*").eq("loan_id", loan_id).execute()

    return jsonify(response.data)


@app.route("/loan-repayment", methods=["POST"])
def add_repayment():

    data = request.get_json()

    response = supabase.table("loan_repayment").insert(data).execute()

    return jsonify({
        "status": "success",
        "data": response.data
    })


# =========================
# LOAN BALANCE CALCULATION
# =========================

@app.route("/loan-balance/<loan_id>")
def loan_balance(loan_id):

    loan = supabase.table("loans").select("principle").eq("loan_id", loan_id).execute()

    repayments = supabase.table("loan_repayment").select("amount").eq("loan_id", loan_id).execute()

    total_paid = 0
    for r in repayments.data:
        total_paid += float(r["amount"])

    principle = float(loan.data[0]["principle"])

    balance = principle - total_paid

    return jsonify({
        "loan_id": loan_id,
        "principle": principle,
        "paid": total_paid,
        "balance": balance
    })


# =========================
# MEMBER STATEMENT
# =========================

@app.route("/member-statement/<member_id>")
def member_statement(member_id):

    member = supabase.table("members").select("*").eq("id", member_id).execute()

    savings = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute()

    loans = supabase.table("loans").select("*").eq("member_id", member_id).execute()

    return jsonify({
        "member": member.data,
        "savings": savings.data,
        "loans": loans.data
    })


# -------------------------
# Run server
# -------------------------

if __name__ == "__main__":
    app.run()
