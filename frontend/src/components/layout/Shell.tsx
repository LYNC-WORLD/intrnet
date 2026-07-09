import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useAuth } from "../../context/AuthContext";
import { CantonMark } from "../ui/CantonMark";
import {
  LayoutDashboard,
  FileText,
  RefreshCw,
  Scale,
  ArrowLeftRight,
  Wallet,
} from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const companyNav: NavItem[] = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: <LayoutDashboard size={16} />,
  },
  { label: "Obligations", path: "/obligations", icon: <FileText size={16} /> },
  { label: "Cycles", path: "/cycles", icon: <RefreshCw size={16} /> },
  { label: "Positions", path: "/positions", icon: <Scale size={16} /> },
  {
    label: "Settlement",
    path: "/settlement",
    icon: <ArrowLeftRight size={16} />,
  },
  { label: "Account", path: "/account", icon: <Wallet size={16} /> },
];

export default function Shell({ children }: { children: ReactNode }) {
  const { user, clearSession } = useAuth();
  const { logout: auth0Logout } = useAuth0();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const handleLogout = async () => {
    await auth0Logout({
      logoutParams: { returnTo: window.location.origin + "/login" },
    });
    clearSession();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
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
              <span className="w-4 flex items-center justify-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-ink-500 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-lime-500 flex items-center justify-center text-ink-900 text-sm font-semibold shrink-0">
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
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-bone-500 hover:text-red-400 hover:bg-ink-700 border border-ink-500 hover:border-red-400/30 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
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
      <div className="flex-1 flex flex-col lg:ml-60  min-w-0">
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
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-bone-500">{getGreeting()},</span>
            <span className="text-sm font-semibold text-bone-100">
              {(user?.partyId ?? "user").split("::")[0]}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
