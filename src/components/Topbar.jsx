import { useEffect, useRef, useState } from "react";

export default function Topbar({
  title = "Admin Dashboard",
  user = { name: "Admin User", role: "Administrator" },
  notifications = [],
  onToggleSidebar,
  onLogout,
  onSearch,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close dropdowns on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Close dropdowns on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleLogout = () => {
    setProfileOpen(false);
    if (onLogout) onLogout();
    else alert("Logout clicked");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(query);
  };

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-full bg-white shadow p-4 flex justify-between items-center gap-4">

      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="text-gray-500 hover:text-gray-800 md:hidden"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
        )}
        <h1 className="font-semibold text-lg truncate">{title}</h1>
      </div>

      <form onSubmit={handleSearchSubmit} className="hidden sm:flex flex-1 max-w-sm">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members, loans, payments…"
          className="w-full border border-gray-200 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </form>

      <div className="flex items-center gap-4">

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative text-gray-500 hover:text-gray-800"
            aria-label="Notifications"
            aria-expanded={notifOpen}
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] leading-none rounded-full px-1.5 py-1">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-100 rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 font-semibold text-sm">Notifications</div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="text-sm text-gray-400 px-4 py-6 text-center">No notifications yet.</p>
                )}
                {notifications.map((n, i) => (
                  <div
                    key={i}
                    className={`px-4 py-3 text-sm border-b border-gray-50 last:border-none ${
                      n.read ? "text-gray-500" : "text-gray-800 bg-blue-50/40"
                    }`}
                  >
                    {n.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2"
            aria-expanded={profileOpen}
          >
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-semibold">
              {initials}
            </span>
            <span className="hidden sm:block text-sm text-left">
              <span className="block font-medium leading-tight">{user.name}</span>
              <span className="block text-xs text-gray-400 leading-tight">{user.role}</span>
            </span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-lg z-50 overflow-hidden">
              <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Profile</button>
              <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Settings</button>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
