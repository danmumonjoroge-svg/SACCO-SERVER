from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
    return "SACCO SERVER RUNNING"

if __name__ == "__main__":
    app.run()
