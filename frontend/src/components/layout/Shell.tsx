import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useAuth } from "../../context/AuthContext";
import { CantonMark } from "../ui/CantonMark";

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const companyNav: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: "◇" },
  { label: "Obligations", path: "/obligations", icon: "▤" },
  { label: "Cycles", path: "/cycles", icon: "↻" },
  { label: "Positions", path: "/positions", icon: "⚖" },
  { label: "Settlement", path: "/settlement", icon: "⇄" },
  { label: "Account", path: "/account", icon: "▣" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const { user, clearSession } = useAuth();
  const { logout: auth0Logout } = useAuth0();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    clearSession();
    auth0Logout({
      logoutParams: { returnTo: window.location.origin + "/login" },
    });
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen flex bg-ink-900">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-ink-800 border-r border-ink-500 flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-ink-500">
          <CantonMark size={22} />
          <span className="text-lg font-semibold text-bone-100 font-display tracking-tight">
            NetClear
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {companyNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? "bg-lime-500/10 text-lime-400"
                  : "text-bone-500 hover:bg-ink-700 hover:text-bone-100"
              }`}
            >
              <span className="text-base w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-ink-500 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-lime-500 flex items-center justify-center text-ink-900 text-sm font-semibold">
              {user?.companyName?.[0] ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-bone-100 truncate">
                {user?.companyName}
              </p>
              <p className="text-xs text-bone-700 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-bone-500 hover:text-red-400 transition-colors px-1"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col lg:ml-60">
        {/* Top bar */}
        <header className="h-16 bg-ink-800/80 backdrop-blur border-b border-ink-500 flex items-center px-6 gap-4 sticky top-0 z-20">
          <button
            className="lg:hidden p-2 rounded-lg text-bone-500 hover:bg-ink-700"
            onClick={() => setSidebarOpen(true)}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="flex-1" />
          <span className="text-sm text-bone-500">{user?.companyName}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
