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
# HELPER: Ledger Posting (placeholder)
# -------------------------------
def post_to_ledger(account_debit, account_credit, amount, reference_table, reference_id):
    # If you do not have general_ledger yet, skip or log
    try:
        supabase.table("general_ledger").insert({
            "account_id_debit": account_debit,
            "account_id_credit": account_credit,
            "amount": amount,
            "reference_table": reference_table,
            "reference_id": reference_id,
            "timestamp": datetime.utcnow().isoformat()
        }).execute()
    except:
        pass

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
    return jsonify(supabase.table("members").select("*").execute().data)

@app.route("/member/<member_id>")
def get_member(member_id):
    return jsonify(supabase.table("members").select("*").eq("member_id", member_id).execute().data)

# -------------------------------
# SAVINGS
# -------------------------------
@app.route("/savings/<member_id>")
def get_savings(member_id):
    return jsonify(supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute().data)

@app.route("/total_deposit/<member_id>")
def total_deposit(member_id):
    response = supabase.table("savings_transactions").select("amount").eq("member_id", member_id).execute()
    total = sum([float(row["amount"]) for row in response.data])
    return jsonify({"member_id": member_id, "total_deposit": total})

@app.route("/deposit", methods=["POST"])
def add_deposit():
    try:
        data = request.json
        member_id = data["member_id"]
        amount = float(data["amount"])
        timestamp = datetime.utcnow().isoformat()

        tx = supabase.table("savings_transactions").insert({
            "member_id": member_id,
            "amount": amount,
            "type": "deposit",
            "timestamp": timestamp
        }).execute()

        post_to_ledger("1000", "1300", amount, "savings_transactions", tx.data[0]["id"])
        return jsonify({"status": "success", "transaction": tx.data[0]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------------------------------
# LOANS
# -------------------------------
@app.route("/loans")
def get_loans():
    return jsonify(supabase.table("loans").select("*").execute().data)

@app.route("/member_loans/<member_id>")
def get_member_loans(member_id):
    return jsonify(supabase.table("loans").select("*").eq("member_id", member_id).execute().data)

# -------------------------------
# LOAN APPLICATION
# -------------------------------
@app.route("/loan_applications")
def loan_applications():
    return jsonify(supabase.table("loan_application").select("*").execute().data)

@app.route("/loan_application/<member_id>")
def loan_application_member(member_id):
    return jsonify(supabase.table("loan_application").select("*").eq("member_id", member_id).execute().data)

# -------------------------------
# LOAN REPAYMENTS
# -------------------------------
@app.route("/loan_repayments/<loan_id>")
def loan_repayments(loan_id):
    try:
        return jsonify(supabase.table("loan_repayment").select("*").eq("loan_id", loan_id).execute().data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/repay_loan", methods=["POST"])
def repay_loan():
    try:
        data = request.json
        loan_id = data.get("loan_id")
        member_id = data.get("member_id")
        principal = float(data.get("principal", 0))
        interest = float(data.get("interest", 0))
        timestamp = datetime.utcnow().isoformat()

        repayment = supabase.table("loan_repayment").insert({
            "loan_id": loan_id,
            "member_id": member_id,
            "principal": principal,
            "interest": interest,
            "timestamp": timestamp
        }).execute()

        # Optional ledger posting
        post_to_ledger("1000", "1200", principal, "loan_repayment", repayment.data[0]["id"])
        post_to_ledger("1000", "3000", interest, "loan_repayment", repayment.data[0]["id"])

        return jsonify({"status": "success", "repayment": repayment.data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------------------------------
# MEMBER STATEMENT
# -------------------------------
@app.route("/statement/<member_id>")
def member_statement(member_id):
    try:
        savings = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute().data
        loans = supabase.table("loans").select("*").eq("member_id", member_id).execute().data
        repayments = supabase.table("loan_repayment").select("*").eq("member_id", member_id).execute().data
        return jsonify({
            "member_id": member_id,
            "savings": savings,
            "loans": loans,
            "repayments": repayments
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------------------------------
# LEDGER & ACCOUNTS (temporary placeholders)
# -------------------------------
@app.route("/ledger")
def ledger():
    try:
        return jsonify(supabase.table("general_ledger").select("*").execute().data)
    except:
        return jsonify({"message": "Ledger not configured yet"})

@app.route("/accounts")
def accounts():
    try:
        return jsonify(supabase.table("chart_of_accounts").select("*").execute().data)
    except:
        return jsonify({"message": "Chart of accounts not configured yet"})

# -------------------------------
# RUN SERVER
# -------------------------------
if __name__ == "__main__":
    app.run()
