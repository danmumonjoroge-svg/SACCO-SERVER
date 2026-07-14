import React, { useState, useCallback } from "react";
import "./ChamaWelfare.css";
import { HeartHandshake, ShieldCheck, FileText, BarChart } from "lucide-react";

import WelfareOverview          from "./WelfareOverview";
import WelfareOfficerDashboard  from "./WelfareOfficerDashboard";
import WelfareReportPDF         from "./WelfareReportPDF";

const ChamaWelfare = ({ chamaId, member, role }) => {
  const [activeTab, setActiveTab] = useState('overview');

  // Bumped any time a case is created OR a contribution is made, from either
  // tab. Passed down as a prop so a component can force-reload even if it's
  // already mounted (tabs unmounting/remounting already refetches on their
  // own, but this covers cases where that assumption changes later, and lets
  // the officer dashboard hand back a signal to Overview without lifting all
  // its state up here).
  const [refreshSignal, setRefreshSignal] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshSignal(s => s + 1), []);

  const isOfficer   = role === 'welfare_officer';
  const isExecutive = ['chair', 'treasurer', 'secretary'].includes(role);

  return (
    <div className="welfare-module">
      {/* PROFESSIONAL TAB NAVIGATION */}
      <div className="welfare-tabs-header">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
          <HeartHandshake size={16} /> Overview
        </button>
        {isOfficer && (
          <button className={activeTab === 'manage' ? 'active' : ''} onClick={() => setActiveTab('manage')}>
            <ShieldCheck size={16} /> Management
          </button>
        )}
        {(isOfficer || isExecutive) && (
          <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>
            <FileText size={16} /> Reports
          </button>
        )}
      </div>

      {/* CONTENT SWITCHER */}
      <div className="welfare-tab-content">
        {activeTab === 'overview' && (
          <WelfareOverview
            chamaId={chamaId}
            member={member}
            role={role}
            refreshSignal={refreshSignal}
            onContributed={bumpRefresh}
          />
        )}
        {activeTab === 'manage' && (
          <WelfareOfficerDashboard
            chamaId={chamaId}
            member={member}
            role={role}
            refreshSignal={refreshSignal}
            onCaseCreated={bumpRefresh}
          />
        )}
        {activeTab === 'reports' && <WelfareReportPDF role={role} chamaId={chamaId} />}
      </div>
    </div>
  );
};

export default ChamaWelfare;