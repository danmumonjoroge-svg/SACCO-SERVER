from flask import Flask, jsonify, request
from supabase import create_client
import os
from datetime import datetime, timedelta

app = Flask(__name__)

# -------------------------------
# SUPABASE CONNECTION
# -------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# -------------------------------
# HELPER FUNCTION: Ledger Posting
# -------------------------------
def post_to_ledger(account_debit, account_credit, amount, reference_table, reference_id):
    supabase.table("general_ledger").insert({
        "account_id_debit": account_debit,
        "account_id_credit": account_credit,
        "amount": amount,
        "reference_table": reference_table,
        "reference_id": reference_id,
        "timestamp": datetime.utcnow().isoformat()
    }).execute()

# -------------------------------
# ROOT
# -------------------------------
@app.route("/")
def home():
    return "SACCO SERVER RUNNING"

# -------------------------------
# MEMBERS
# -------------------------------
@app.route("/members")
def get_members():
    response = supabase.table("members").select("*").execute()
    return jsonify(response.data)

@app.route("/member/<member_id>")
def get_member(member_id):
    response = supabase.table("members").select("*").eq("member_id", member_id).execute()
    return jsonify(response.data)

# -------------------------------
# SAVINGS
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

# Endpoint to add a savings deposit
@app.route("/deposit", methods=["POST"])
def add_deposit():
    data = request.json
    member_id = data["member_id"]
    amount = float(data["amount"])
    tx_type = "deposit"
    timestamp = datetime.utcnow().isoformat()

    # Insert transaction
    insert = supabase.table("savings_transactions").insert({
        "member_id": member_id,
        "amount": amount,
        "type": tx_type,
        "timestamp": timestamp
    }).execute()

    # Post to ledger
    post_to_ledger("1000", "1300", amount, "savings_transactions", insert.data[0]["id"])

    return jsonify({"status": "success", "transaction": insert.data[0]})

# -------------------------------
# LOANS
# -------------------------------
@app.route("/loans")
def get_loans():
    response = supabase.table("loans").select("*").execute()
    return jsonify(response.data)

@app.route("/member_loans/<member_id>")
def get_member_loans(member_id):
    response = supabase.table("loans").select("*").eq("member_id", member_id).execute()
    return jsonify(response.data)

# -------------------------------
# LOAN REPAYMENT
# -------------------------------
@app.route("/loan_repayments/<loan_id>")
def loan_repayments(loan_id):
    response = supabase.table("loan_repayment").select("*").eq("loan_id", loan_id).execute()
    return jsonify(response.data)

# Endpoint to add loan repayment
@app.route("/repay_loan", methods=["POST"])
def repay_loan():
    data = request.json
    loan_id = data["loan_id"]
    member_id = data["member_id"]
    principal_paid = float(data["principal"])
    interest_paid = float(data["interest"])
    timestamp = datetime.utcnow().isoformat()

    # Insert repayment
    insert = supabase.table("loan_repayment").insert({
        "loan_id": loan_id,
        "member_id": member_id,
        "principal": principal_paid,
        "interest": interest_paid,
        "timestamp": timestamp
    }).execute()

    # Ledger entries
    post_to_ledger("1000", "1200", principal_paid, "loan_repayment", insert.data[0]["id"])  # principal
    post_to_ledger("1000", "3000", interest_paid, "loan_repayment", insert.data[0]["id"])   # interest

    return jsonify({"status": "success", "repayment": insert.data[0]})

# -------------------------------
# LOAN SCHEDULE GENERATOR
# -------------------------------
@app.route("/generate_schedule/<loan_id>", methods=["POST"])
def generate_schedule(loan_id):
    loan = supabase.table("loans").select("*").eq("id", loan_id).execute()
    if not loan.data:
        return jsonify({"error": "Loan not found"}), 404

    loan_data = loan.data[0]
    principal = float(loan_data["principal"])
    interest_rate = float(loan_data["interest_rate"])
    term_months = int(loan_data["term_months"])
    start_date = datetime.strptime(loan_data["disbursement_date"], "%Y-%m-%d")

    schedule_entries = []
    for i in range(term_months):
        due_date = start_date + timedelta(days=30*(i+1))
        interest = principal * (interest_rate / 12) / 100
        principal_payment = principal / term_months
        total_due = principal_payment + interest

        schedule_entries.append({
            "loan_id": loan_id,
            "due_date": due_date.date().isoformat(),
            "principal_due": round(principal_payment, 2),
            "interest_due": round(interest, 2),
            "total_due": round(total_due, 2),
            "status": "pending"
        })

    supabase.table("loan_schedule").insert(schedule_entries).execute()
    return jsonify({"status": "success", "schedule": schedule_entries})

# -------------------------------
# MEMBER STATEMENTS
# -------------------------------
@app.route("/member_statement/<member_id>")
def member_statement(member_id):
    savings = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute().data
    loans = supabase.table("loans").select("*").eq("member_id", member_id).execute().data
    repayments = supabase.table("loan_repayment").select("*").eq("member_id", member_id).execute().data

    statement = {
        "member_id": member_id,
        "savings": savings,
        "loans": loans,
        "repayments": repayments
    }
    return jsonify(statement)

# -------------------------------
# ACCOUNTING
# -------------------------------
@app.route("/ledger")
def ledger():
    response = supabase.table("general_ledger").select("*").execute()
    return jsonify(response.data)

@app.route("/ledger_account/<account_id>")
def ledger_account(account_id):
    response = supabase.table("general_ledger").select("*").eq("account_id_debit", account_id).execute()
    return jsonify(response.data)

@app.route("/accounts")
def accounts():
    response = supabase.table("chart_of_accounts").select("*").execute()
    return jsonify(response.data)

# -------------------------------
# RUN SERVER
# -------------------------------
if __name__ == "__main__":
    app.run()
