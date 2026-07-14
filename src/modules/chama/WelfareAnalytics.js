import React, { useState, useMemo } from 'react';

/**
 * WelfareAnalytics
 * Jungle-green & gold themed participation leaderboard for a welfare fund.
 *
 * Props:
 *  - contributions: [{ memberName: string, amount: number }]
 *  - isVisible: boolean   (member-facing visibility toggle set by Welfare Officer)
 *  - role: 'member' | 'welfare_officer' | 'chair' | 'treasurer' | 'secretary'
 */

const DEMO_CONTRIBUTIONS = [
  { memberName: 'Amina Wanjiru', amount: 15000 },
  { memberName: 'Brian Otieno', amount: 12500 },
  { memberName: 'Amina Wanjiru', amount: 5000 },
  { memberName: 'Cynthia Njeri', amount: 9800 },
  { memberName: 'David Kimani', amount: 7200 },
  { memberName: 'Brian Otieno', amount: 4000 },
  { memberName: 'Esther Achieng', amount: 6100 },
  { memberName: 'Felix Mwangi', amount: 3200 },
];

const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const LeafBadge = ({ rank }) => (
  <div className={`wa-leaf wa-leaf-${rank}`}>
    <svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
      <path
        d="M22 2 C34 6 40 16 40 24 C40 34 32 41 22 42 C12 41 4 34 4 24 C4 16 10 6 22 2 Z"
        fill="url(#leafGrad)"
        stroke="var(--gold-300)"
        strokeWidth="1"
      />
      <path d="M22 8 L22 36" stroke="var(--jungle-900)" strokeWidth="1" opacity="0.35" />
      <defs>
        <linearGradient id="leafGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--gold-300)" />
          <stop offset="100%" stopColor="var(--gold-600)" />
        </linearGradient>
      </defs>
    </svg>
    <span className="wa-leaf-rank">{rank}</span>
  </div>
);

const WelfareAnalytics = ({
  contributions = DEMO_CONTRIBUTIONS,
  isVisible = true,
  role = 'member',
}) => {
  const [sortBy, setSortBy] = useState('amount');

  const isOfficer = role === 'welfare_officer';
  const isExecutive = ['chair', 'treasurer', 'secretary'].includes(role);
  const isOverride = !isVisible && (isOfficer || isExecutive);
  const canView = isVisible || isOfficer || isExecutive;

  const { sortedStats, total, count } = useMemo(() => {
    const stats = contributions.reduce((acc, curr) => {
      acc[curr.memberName] = (acc[curr.memberName] || 0) + curr.amount;
      return acc;
    }, {});
    let entries = Object.entries(stats);
    const totalAmount = entries.reduce((sum, [, v]) => sum + v, 0);
    entries =
      sortBy === 'amount'
        ? entries.sort((a, b) => b[1] - a[1])
        : entries.sort((a, b) => a[0].localeCompare(b[0]));
    return { sortedStats: entries, total: totalAmount, count: entries.length };
  }, [contributions, sortBy]);

  const maxAmount = sortedStats.length ? Math.max(...sortedStats.map(([, v]) => v)) : 0;
  const average = count ? Math.round(total / count) : 0;
  const showPodium = sortBy === 'amount' && sortedStats.length > 0;
  const podium = showPodium ? sortedStats.slice(0, 3) : [];
  const rest = showPodium ? sortedStats.slice(3) : sortedStats;

  if (!canView) {
    return (
      <div className="wa-root">
        <style>{CSS}</style>
        <div className="wa-card wa-locked">
          <div className="wa-vine" aria-hidden="true" />
          <svg className="wa-lock-icon" viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
            <path
              d="M24 4 C31 4 36 10 36 17 V21 H38 C40 21 42 23 42 25 V40 C42 42 40 44 38 44 H10 C8 44 6 42 6 40 V25 C6 23 8 21 10 21 H12 V17 C12 10 17 4 24 4 Z M24 9 C19.5 9 17 12.5 17 17 V21 H31 V17 C31 12.5 28.5 9 24 9 Z"
              fill="var(--gold-400)"
            />
          </svg>
          <h3>Leaderboard hidden</h3>
          <p>The Welfare Officer has hidden the participation leaderboard for now. Check back later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-root">
      <style>{CSS}</style>
      <div className="wa-card">
        <div className="wa-vine" aria-hidden="true" />

        <header className="wa-header">
          <div>
            <p className="wa-eyebrow">Welfare Fund</p>
            <h3 className="wa-title">Participation Leaderboard</h3>
          </div>
          {isOverride && (
            <span className="wa-pill">Officer view · hidden from members</span>
          )}
        </header>

        <div className="wa-summary">
          <div className="wa-stat">
            <span className="wa-stat-value">
              {total.toLocaleString()} <small>KES</small>
            </span>
            <span className="wa-stat-label">Total contributed</span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">{count}</span>
            <span className="wa-stat-label">Contributors</span>
          </div>
          <div className="wa-stat">
            <span className="wa-stat-value">
              {average.toLocaleString()} <small>KES</small>
            </span>
            <span className="wa-stat-label">Average</span>
          </div>
        </div>

        <div className="wa-sortbar" role="tablist" aria-label="Sort leaderboard">
          <button
            role="tab"
            aria-selected={sortBy === 'amount'}
            className={sortBy === 'amount' ? 'active' : ''}
            onClick={() => setSortBy('amount')}
          >
            By amount
          </button>
          <button
            role="tab"
            aria-selected={sortBy === 'name'}
            className={sortBy === 'name' ? 'active' : ''}
            onClick={() => setSortBy('name')}
          >
            By name
          </button>
        </div>

        {sortedStats.length === 0 ? (
          <p className="wa-empty">No contributions recorded yet.</p>
        ) : (
          <>
            {showPodium && (
              <div className="wa-podium">
                {podium.map(([name, amt], i) => (
                  <div className={`wa-podium-card rank-${i + 1}`} key={name}>
                    <LeafBadge rank={i + 1} />
                    <div className="wa-avatar">{getInitials(name)}</div>
                    <p className="wa-podium-name">{name}</p>
                    <p className="wa-podium-amount">
                      {amt.toLocaleString()} <small>KES</small>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <ul className="wa-list">
                {rest.map(([name, amt], i) => {
                  const pct = maxAmount ? (amt / maxAmount) * 100 : 0;
                  const rank = showPodium ? i + 4 : null;
                  return (
                    <li className="wa-row" key={name}>
                      {rank && <span className="wa-rank">{rank}</span>}
                      <span className="wa-avatar small">{getInitials(name)}</span>
                      <span className="wa-name">{name}</span>
                      <div className="wa-bar-track">
                        <div className="wa-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="wa-amount">
                        {amt.toLocaleString()} <small>KES</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WelfareAnalytics;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');

.wa-root {
  --jungle-950: #081711;
  --jungle-900: #0d2318;
  --jungle-800: #123321;
  --jungle-700: #1c4a2e;
  --jungle-600: #2a6b3f;
  --jungle-500: #3f8955;
  --gold-600: #a9791f;
  --gold-400: #d4af37;
  --gold-300: #e8c565;
  --gold-100: #f7ecc9;
  --cream: #f4efdf;
  --muted: #8fae96;

  font-family: 'Work Sans', system-ui, sans-serif;
  color: var(--cream);
  display: flex;
  justify-content: center;
  padding: 8px;
}

.wa-card {
  position: relative;
  width: 100%;
  max-width: 640px;
  background: radial-gradient(120% 140% at 10% 0%, var(--jungle-800) 0%, var(--jungle-950) 65%);
  border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 20px;
  padding: 28px 26px 24px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.wa-vine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(90deg, var(--jungle-700), var(--gold-400) 50%, var(--jungle-700));
  opacity: 0.9;
}

.wa-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.wa-eyebrow {
  margin: 0 0 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold-300);
}

.wa-title {
  margin: 0;
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 24px;
  color: var(--cream);
  letter-spacing: 0.01em;
}

.wa-pill {
  align-self: flex-start;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--jungle-950);
  background: var(--gold-300);
  border-radius: 999px;
  padding: 5px 10px;
  white-space: nowrap;
}

.wa-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}

.wa-stat {
  background: rgba(212, 175, 55, 0.06);
  border: 1px solid rgba(212, 175, 55, 0.18);
  border-radius: 12px;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.wa-stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 500;
  color: var(--gold-100);
}

.wa-stat-value small {
  font-size: 10px;
  color: var(--muted);
}

.wa-stat-label {
  font-size: 11px;
  color: var(--muted);
}

.wa-sortbar {
  display: inline-flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(212, 175, 55, 0.15);
  border-radius: 999px;
  padding: 3px;
  margin-bottom: 20px;
}

.wa-sortbar button {
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: 'Work Sans', sans-serif;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.wa-sortbar button.active {
  background: var(--gold-400);
  color: var(--jungle-950);
}

.wa-sortbar button:hover:not(.active) {
  color: var(--gold-200, var(--gold-300));
}

.wa-empty {
  text-align: center;
  color: var(--muted);
  padding: 24px 0;
  font-size: 14px;
}

.wa-podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 12px;
  margin-bottom: 26px;
}

.wa-podium-card {
  flex: 1;
  max-width: 160px;
  background: linear-gradient(180deg, rgba(212, 175, 55, 0.1), rgba(212, 175, 55, 0.02));
  border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 14px;
  padding: 18px 10px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

.wa-podium-card.rank-1 { order: 2; padding-top: 8px; transform: translateY(-10px); border-color: var(--gold-400); }
.wa-podium-card.rank-2 { order: 1; }
.wa-podium-card.rank-3 { order: 3; }

.wa-leaf {
  position: relative;
  width: 40px;
  height: 40px;
  margin-bottom: 2px;
}

.wa-leaf-rank {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Fraunces', serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--jungle-950);
}

.wa-podium-card.rank-1 .wa-leaf { width: 50px; height: 50px; }

.wa-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--jungle-700);
  border: 1px solid rgba(212, 175, 55, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--gold-100);
}

.wa-avatar.small {
  width: 30px;
  height: 30px;
  font-size: 11px;
  flex-shrink: 0;
}

.wa-podium-name {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--cream);
  line-height: 1.25;
}

.wa-podium-amount {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--gold-300);
}

.wa-podium-amount small {
  font-size: 10px;
  color: var(--muted);
}

.wa-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wa-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(212, 175, 55, 0.1);
  border-radius: 10px;
  padding: 8px 12px;
}

.wa-rank {
  width: 18px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  flex-shrink: 0;
}

.wa-name {
  font-size: 13px;
  color: var(--cream);
  min-width: 96px;
  flex-shrink: 0;
}

.wa-bar-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.wa-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--jungle-600), var(--gold-400));
  transition: width 0.6s ease;
}

.wa-amount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--gold-100);
  white-space: nowrap;
  flex-shrink: 0;
}

.wa-amount small {
  font-size: 9px;
  color: var(--muted);
}

.wa-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 40px 24px;
}

.wa-locked h3 {
  margin: 6px 0 0;
  font-family: 'Fraunces', serif;
  font-size: 20px;
  color: var(--cream);
}

.wa-locked p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  max-width: 320px;
}

@media (max-width: 480px) {
  .wa-podium { flex-direction: column; align-items: stretch; }
  .wa-podium-card.rank-1 { transform: none; order: 0; }
  .wa-podium-card.rank-2 { order: 1; }
  .wa-podium-card.rank-3 { order: 2; }
  .wa-name { min-width: 70px; }
  .wa-summary { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .wa-bar-fill { transition: none; }
}
`;