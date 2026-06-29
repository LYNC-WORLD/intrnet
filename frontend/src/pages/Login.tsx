import { useAuth0 } from "@auth0/auth0-react";
import { useSearchParams } from "react-router-dom";
import { Button, Alert, PageLoader } from "../components/ui";
import { CantonMark, StackedPanes } from "../components/ui/CantonMark";
import { useAuth0Bridge } from "../hooks/useAuth0Bridge";

export default function Login() {
  const { isLoading: auth0Loading } = useAuth0();

  const { loginWithGoogle, exchanging, error } = useAuth0Bridge();
  const [params] = useSearchParams();

  const busy = exchanging;

  return (
    <div className="min-h-screen flex bg-ink-900 bg-fine-grid relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 bg-lime-glow pointer-events-none" />

      {/* Left: brand panel (hidden on small screens) */}
      <div className="hidden lg:flex flex-1 flex-col p-12 relative z-10">
        <div className="flex items-center gap-2.5">
          <CantonMark size={26} />
          <span className="text-xl font-semibold text-bone-100 font-display tracking-tight">
            NetClear
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-md">
          <p className="text-xs font-medium text-lime-400 uppercase tracking-[0.2em] mb-4">
            Built on Canton
          </p>
          <h1 className="text-5xl font-display font-semibold text-bone-100 leading-[1.1]">
            Where settlement{" "}
            <span className="text-gradient-lime italic">flows</span>
          </h1>
          <p className="text-bone-500 mt-5 text-base leading-relaxed">
            Multilateral netting for the pool — obligations in, one settlement
            instruction out. Privacy-preserving, on-ledger, and built for every
            counterparty in the network.
          </p>

          <div className="mt-10 space-y-4">
            {[
              [
                "Submit obligations",
                "Create and accept invoices with any pool participant.",
              ],
              [
                "Net automatically",
                "The operator computes one position per cycle, per company.",
              ],
              [
                "Settle once",
                "Pay or receive a single net amount instead of dozens.",
              ],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-lime-500 mt-2 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-bone-100">{title}</p>
                  <p className="text-xs text-bone-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: sign-in panel */}
      <div className="w-full lg:w-[480px] flex items-center justify-center p-6 relative z-10 bg-ink-800/40 lg:border-l border-ink-500">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <CantonMark size={24} />
            <span className="text-xl font-semibold text-bone-100 font-display">
              NetClear
            </span>
          </div>

          <h2 className="text-xl font-semibold text-bone-100 font-display mb-1">
            Sign in
          </h2>
          <p className="text-sm text-bone-500 mb-6">
            Access your settlement pool account.
          </p>

          {params.get("expired") && (
            <div className="mb-4">
              <Alert type="warning">
                Your session has expired. Please sign in again.
              </Alert>
            </div>
          )}

          {error && (
            <div className="mb-4">
              <Alert type="error">{error}</Alert>
            </div>
          )}

          {busy ? (
            <div className="py-8">
              <PageLoader />
              <p className="text-center text-sm text-bone-500 mt-2">
                Signing you in…
              </p>
            </div>
          ) : (
            <Button onClick={loginWithGoogle} className="w-full" size="lg">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                className="shrink-0"
              >
                <path
                  fill="#1A1A1C"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.89 2.69-6.64z"
                />
                <path
                  fill="#1A1A1C"
                  d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.93v2.33C2.42 15.98 5.48 18 9 18z"
                />
                <path
                  fill="#1A1A1C"
                  d="M3.97 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.93a8.99 8.99 0 0 0 0 8.06l3.04-2.33z"
                />
                <path
                  fill="#1A1A1C"
                  d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.42 2.02.93 4.97l3.04 2.33C4.68 5.16 6.66 3.58 9 3.58z"
                />
              </svg>
              Continue with Google
            </Button>
          )}

          <p className="text-xs text-bone-700 mt-6 text-center leading-relaxed">
            New here? Signing in with Google will start your onboarding
            automatically — no separate registration needed.
          </p>
        </div>
      </div>
    </div>
  );
}
