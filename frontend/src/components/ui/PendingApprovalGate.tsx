import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "./index";
import { CantonMark, StackedPanes } from "./CantonMark";

/**
 * Full-screen blocking overlay shown when the backend reports the
 * signed-in user's company status as PENDING (awaiting admin approval).
 * Not a dismissible Modal — there's no "close" action, only sign out.
 */
export function PendingApprovalGate({ companyName }: { companyName?: string }) {
  const { logout: auth0Logout } = useAuth0();

  const handleLogout = async () => {
    await auth0Logout({
      logoutParams: { returnTo: window.location.origin + "/login" },
    });
    localStorage.removeItem("nc_token");
    localStorage.removeItem("nc_user");
  };

  return (
    <div className="fixed inset-0 z-[100] flex bg-ink-900 bg-fine-grid">
      <div className="absolute inset-0 bg-lime-glow pointer-events-none" />

      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-1 flex-col p-12 relative z-10">
        <div className="flex items-center gap-2.5">
          <CantonMark size={26} />
          <span className="text-xl font-semibold text-bone-100 font-display tracking-tight">
            NetClear
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-md">
          <p className="text-xs font-medium text-lime-400 uppercase tracking-[0.2em] mb-4">
            Provisioning in progress
          </p>
          <h1 className="text-5xl font-display font-semibold text-bone-100 leading-[1.1]">
            Almost <span className="text-gradient-lime italic">there</span>
          </h1>
          <p className="text-bone-500 mt-5 text-base leading-relaxed">
            Your company's details are with the pool operator now. Once
            approved, your Canton party and cash account go live — no further
            steps needed from you.
          </p>

          <div className="mt-10 space-y-4">
            {[
              [
                "Details received",
                "The operator has your onboarding submission.",
              ],
              [
                "Under review",
                "Approval is typically quick — usually same day.",
              ],
              [
                "Automatic access",
                "This page lets you straight in once approved.",
              ],
            ].map(([title, desc], i) => (
              <div key={title} className="flex gap-3">
                <div
                  className={`h-1.5 w-1.5 rounded-full mt-2 shrink-0 bg-lime-500 ${i === 1 ? "animate-pulse" : ""}`}
                />
                <div>
                  <p className="text-sm font-medium text-bone-100">{title}</p>
                  <p className="text-xs text-bone-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: status panel */}
      <div className="w-full lg:w-[480px] flex items-center justify-center p-6 relative z-10 bg-ink-800/40 lg:border-l border-ink-500">
        <div className="w-full max-w-sm text-center">
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <CantonMark size={24} />
            <span className="text-xl font-semibold text-bone-100 font-display">
              NetClear
            </span>
          </div>

          <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
            <CantonMark size={30} spin />
          </div>
          <h2 className="text-xl font-semibold text-bone-100 font-display mb-2">
            Approval pending
          </h2>
          <p className="text-bone-500 text-sm mb-8 leading-relaxed">
            {companyName ? (
              <>
                Thanks for submitting{" "}
                <strong className="text-bone-300">{companyName}</strong>.
              </>
            ) : (
              "Your account"
            )}{" "}
            is waiting on review from the pool operator. You'll get access as
            soon as it's approved — there's nothing else to do for now.
          </p>
          <Button
            variant="secondary"
            onClick={handleLogout}
            className="w-full"
            size="lg"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
