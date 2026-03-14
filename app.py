from flask import Flask, jsonify
from supabase import create_client
import os

app = Flask(__name__)

# -------------------------------
# Connect to Supabase
# -------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# -------------------------------
# SERVER TEST
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

    response = supabase.table("savings_transactions")\
        .select("*")\
        .eq("member_id", member_id)\
        .execute()

    return jsonify(response.data)


@app.route("/total_deposit/<member_id>")
def total_deposit(member_id):

    response = supabase.table("savings_transactions")\
        .select("amount")\
        .eq("member_id", member_id)\
        .execute()

    total = 0
    for row in response.data:
        total += float(row["amount"])

    return jsonify({
        "member_id": member_id,
        "total_deposit": total
    })


# -------------------------------
# LOANS
# -------------------------------
@app.route("/loans")
def get_loans():
    response = supabase.table("loans").select("*").execute()
    return jsonify(response.data)


@app.route("/member_loans/<member_id>")
def get_member_loans(member_id):

    response = supabase.table("loans")\
        .select("*")\
        .eq("member_id", member_id)\
        .execute()

    return jsonify(response.data)


# -------------------------------
# LOAN REPAYMENT
# -------------------------------
@app.route("/loan_repayments/<loan_id>")
def loan_repayments(loan_id):

    response = supabase.table("loan_repayment")\
        .select("*")\
        .eq("loan_id", loan_id)\
        .execute()

    return jsonify(response.data)


# -------------------------------
# ACCOUNTING (GENERAL LEDGER)
# -------------------------------
@app.route("/ledger")
def ledger():

    response = supabase.table("general_ledger")\
        .select("*")\
        .execute()

    return jsonify(response.data)


@app.route("/ledger_account/<account_id>")
def ledger_account(account_id):

    response = supabase.table("general_ledger")\
        .select("*")\
        .eq("account_id", account_id)\
        .execute()

    return jsonify(response.data)


# -------------------------------
# CHART OF ACCOUNTS
# -------------------------------
@app.route("/accounts")
def accounts():

    response = supabase.table("chart_of_accounts")\
        .select("*")\
        .execute()

    return jsonify(response.data)


# -------------------------------
# RUN SERVER
# -------------------------------
if __name__ == "__main__":
    app.run()
