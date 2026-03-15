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
    data = supabase.table("members").select("*").execute()
    return jsonify(data.data)


@app.route("/member/<member_id>")
def get_member(member_id):
    data = supabase.table("members").select("*").eq("member_id", member_id).execute()
    return jsonify(data.data)


# -------------------------------
# SAVINGS
# -------------------------------
@app.route("/savings/<member_id>")
def member_savings(member_id):
    data = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute()
    return jsonify(data.data)


@app.route("/deposit", methods=["POST"])
def deposit():

    data = request.json

    tx = supabase.table("savings_transactions").insert({
        "member_id": data["member_id"],
        "amount": data["amount"],
        "type": "deposit",
        "timestamp": datetime.utcnow().isoformat()
    }).execute()

    return jsonify(tx.data)


@app.route("/total_deposit/<member_id>")
def total_deposit(member_id):

    response = supabase.table("savings_transactions").select("amount").eq("member_id", member_id).execute()

    total = sum(float(row["amount"]) for row in response.data)

    return jsonify({
        "member_id": member_id,
        "total_deposit": total
    })


# -------------------------------
# LOAN APPLICATIONS
# -------------------------------
@app.route("/loan_applications")
def loan_applications():

    data = supabase.table("loan_application").select("*").execute()

    return jsonify(data.data)


@app.route("/apply_loan", methods=["POST"])
def apply_loan():

    data = request.json

    loan = supabase.table("loan_application").insert({
        "member_id": data["member_id"],
        "amount": data["amount"],
        "purpose": data["purpose"],
        "status": "pending",
        "timestamp": datetime.utcnow().isoformat()
    }).execute()

    return jsonify(loan.data)


# -------------------------------
# LOANS
# -------------------------------
@app.route("/loans")
def loans():

    data = supabase.table("loans").select("*").execute()

    return jsonify(data.data)


@app.route("/member_loans/<member_id>")
def member_loans(member_id):

    data = supabase.table("loans").select("*").eq("member_id", member_id).execute()

    return jsonify(data.data)


# -------------------------------
# LOAN REPAYMENTS
# -------------------------------
@app.route("/loan_repayments/<loan_id>")
def loan_repayments(loan_id):

    data = supabase.table("loan_repayment").select("*").eq("loan_id", loan_id).execute()

    return jsonify(data.data)


@app.route("/repay_loan", methods=["POST"])
def repay_loan():

    data = request.json

    repayment = supabase.table("loan_repayment").insert({
        "loan_id": data["loan_id"],
        "member_id": data["member_id"],
        "principal": data["principal"],
        "interest": data["interest"],
        "timestamp": datetime.utcnow().isoformat()
    }).execute()

    return jsonify(repayment.data)


# -------------------------------
# LOAN SCHEDULE
# -------------------------------
@app.route("/generate_schedule/<loan_id>", methods=["POST"])
def generate_schedule(loan_id):

    loan = supabase.table("loans").select("*").eq("id", loan_id).execute()

    if not loan.data:
        return jsonify({"error": "Loan not found"}), 404

    loan = loan.data[0]

    principal = float(loan["principal"])
    interest_rate = float(loan["interest_rate"])
    term = int(loan["term_months"])

    start = datetime.strptime(loan["disbursement_date"], "%Y-%m-%d")

    schedule = []

    for i in range(term):

        due_date = start + timedelta(days=30*(i+1))

        interest = principal * (interest_rate/100)/12
        principal_payment = principal/term

        schedule.append({

            "loan_id": loan_id,
            "due_date": due_date.date().isoformat(),
            "principal_due": round(principal_payment,2),
            "interest_due": round(interest,2),
            "status": "pending"

        })

    supabase.table("loan_schedule").insert(schedule).execute()

    return jsonify(schedule)


# -------------------------------
# MEMBER STATEMENT
# -------------------------------
@app.route("/statement/<member_id>")
def statement(member_id):

    member = supabase.table("members").select("*").eq("member_id", member_id).execute().data

    savings = supabase.table("savings_transactions").select("*").eq("member_id", member_id).execute().data

    loans = supabase.table("loans").select("*").eq("member_id", member_id).execute().data

    repayments = supabase.table("loan_repayment").select("*").eq("member_id", member_id).execute().data

    return jsonify({

        "member": member,
        "savings": savings,
        "loans": loans,
        "repayments": repayments

    })


# -------------------------------
# GENERAL LEDGER
# -------------------------------
@app.route("/ledger")
def ledger():

    data = supabase.table("general_ledger").select("*").execute()

    return jsonify(data.data)


@app.route("/accounts")
def accounts():

    data = supabase.table("chart_of_accounts").select("*").execute()

    return jsonify(data.data)


# -------------------------------
# RUN SERVER
# -@app.route("/loan_repayments/<loan_id>")
def loan_repayments(loan_id):

    try:
        data = supabase.table("loan_repayment") \
            .select("*") \
            .eq("loan_id", loan_id) \
            .execute()

        return jsonify(data.data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500------------------------------

if __name__ == "__main__":
    app.run()
