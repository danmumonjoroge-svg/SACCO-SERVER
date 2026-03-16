import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const App = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [memberData] = useState({
    username: "user123",
    password: "123pass",
    loanBalance: 50000,
    shareCapital: 20000,
    dividend: 2500,
    interest: 1500,
    deposit: 30000,
    savingsChart: [
      { month: "Jan", savings: 2000 },
      { month: "Feb", savings: 3000 },
      { month: "Mar", savings: 4000 },
      { month: "Apr", savings: 5000 },
      { month: "May", savings: 6000 },
    ],
    loanChart: [
      { month: "Jan", loan: 10000 },
      { month: "Feb", loan: 9000 },
      { month: "Mar", loan: 8000 },
      { month: "Apr", loan: 7000 },
      { month: "May", loan: 6000 },
    ],
  });

  const handleLogin = (e) => {
    e.preventDefault();
    if (username === memberData.username && password === memberData.password) {
      setLoggedIn(true);
    } else {
      alert("Invalid credentials!");
    }
  };

  if (!loggedIn) {
    return (
      <div style={styles.loginContainer}>
        <h2>Member Login</h2>
        <form onSubmit={handleLogin} style={styles.loginForm}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>Login</button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.dashboard}>
      <h1>Welcome, {memberData.username}</h1>
      <div style={styles.cardsContainer}>
        <div style={styles.card}>Loan Balance: KES {memberData.loanBalance}</div>
        <div style={styles.card}>Share Capital: KES {memberData.shareCapital}</div>
        <div style={styles.card}>Dividend: KES {memberData.dividend}</div>
        <div style={styles.card}>Interest: KES {memberData.interest}</div>
        <div style={styles.card}>Deposit: KES {memberData.deposit}</div>
      </div>

      <div style={styles.chartsContainer}>
        <div style={styles.chartBox}>
          <h3>Savings Growth</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={memberData.savingsChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="savings" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={styles.chartBox}>
          <h3>Loan Reduction</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={memberData.loanChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="loan" stroke="#82ca9d" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <button style={styles.downloadButton} onClick={() => alert("Statement download functionality goes here")}>
        Download Statement
      </button>
    </div>
  );
};

const styles = {
  loginContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "100px",
  },
  loginForm: {
    display: "flex",
    flexDirection: "column",
    width: "250px",
    gap: "10px",
  },
  input: {
    padding: "8px",
    fontSize: "14px",
  },
  button: {
    padding: "10px",
    backgroundColor: "#4CAF50",
    color: "#fff",
    border: "none",
    cursor: "pointer",
  },
  dashboard: {
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  },
  cardsContainer: {
    display: "flex",
    gap: "15px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  card: {
    backgroundColor: "#f2f2f2",
    padding: "15px",
    borderRadius: "8px",
    minWidth: "150px",
    textAlign: "center",
  },
  chartsContainer: {
    display: "flex",
    gap: "20px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  chartBox: {
    flex: "1 1 400px",
    backgroundColor: "#fff",
    padding: "15px",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  },
  downloadButton: {
    padding: "12px 20px",
    backgroundColor: "#007BFF",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default App;
