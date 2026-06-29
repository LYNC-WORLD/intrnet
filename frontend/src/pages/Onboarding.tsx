import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { onboardingApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Input, Select, Button, Alert } from "../components/ui";
import { CantonMark, StackedPanes } from "../components/ui/CantonMark";

const COUNTRIES = [
  { value: "", label: "Select country" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "JP", label: "Japan" },
  { value: "SG", label: "Singapore" },
  { value: "AU", label: "Australia" },
  { value: "IN", label: "India" },
  { value: "CA", label: "Canada" },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export default function Onboarding() {
  const {
    user: auth0User,
    getAccessTokenSilently,
    logout: auth0Logout,
  } = useAuth0();
  const { user: backendUser, updateUser } = useAuth();

  const handleSignOut = () => {
    auth0Logout({
      logoutParams: { returnTo: window.location.origin + "/login" },
    });
  };

  const [form, setForm] = useState({
    email: auth0User?.email ?? "",
    companyName: "",
    contactName: auth0User?.name ?? "",
    phone: "",
    country: "",
    partyHint: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const f =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        if (field === "companyName") {
          next.partyHint = slugify(value);
        }
        return next;
      });
    };

  const valid =
    form.email &&
    form.companyName &&
    form.contactName &&
    form.phone &&
    form.country &&
    form.partyHint;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError("");
    setSubmitting(true);
    try {
      const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
      const auth0Token = await getAccessTokenSilently({
        authorizationParams: { audience },
      });
      await onboardingApi.submit(form, auth0Token);
      updateUser({ status: "PENDING", onboardingState: "SUBMITTED" });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(msg ?? "Could not submit your details. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const alreadySubmitted =
    backendUser?.onboardingState === "SUBMITTED" &&
    backendUser?.status === "PENDING";

  // ─── Submitted / pending review state ──────────────────────────────────
  if (success || alreadySubmitted) {
    const firstName =
      form.contactName.split(" ")[0] ||
      auth0User?.given_name ||
      auth0User?.name?.split(" ")[0] ||
      "there";

    return (
      <div className="min-h-screen flex bg-ink-900 bg-fine-grid relative overflow-hidden">
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

            <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-lime-500/10 border border-lime-500/25 flex items-center justify-center">
              <CantonMark size={30} spin />
            </div>
            <h2 className="text-xl font-semibold text-bone-100 font-display mb-2">
              Submitted for review
            </h2>
            <p className="text-bone-500 text-sm mb-8 leading-relaxed">
              Thanks, {firstName}. You'll get access as soon as your company is
              approved — check back here, no further action is needed from you
              in the meantime.
            </p>
            <Button
              onClick={handleSignOut}
              variant="secondary"
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

  // ─── Form state ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-ink-900 bg-fine-grid relative overflow-hidden">
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
            One-time setup
          </p>
          <h1 className="text-5xl font-display font-semibold text-bone-100 leading-[1.1]">
            Get your company{" "}
            <span className="text-gradient-lime italic">on-chain</span>
          </h1>
          <p className="text-bone-500 mt-5 text-base leading-relaxed">
            A few details and your company is provisioned as a Canton party in
            the pool — ready to submit and net obligations with every
            counterparty on the network.
          </p>

          <div className="mt-10 space-y-4">
            {[
              [
                "Canton party",
                "Your company gets its own party and cash account.",
              ],
              [
                "One agreement",
                "Trade with the whole pool under a single contract.",
              ],
              [
                "Quick review",
                "The operator approves new companies, usually same day.",
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

      {/* Right: form panel */}
      <div className="w-full lg:w-[560px] flex items-center justify-center p-6 relative z-10 bg-ink-800/40 lg:border-l border-ink-500 py-10">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <div className="lg:hidden flex items-center gap-2.5">
              <CantonMark size={24} />
              <span className="text-xl font-semibold text-bone-100 font-display">
                NetClear
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="text-sm text-bone-500 hover:text-red-400 transition-colors ml-auto"
            >
              Sign out
            </button>
          </div>

          <h2 className="text-xl font-semibold text-bone-100 font-display mb-1">
            Tell us about your company
          </h2>
          <p className="text-sm text-bone-500 mb-6">
            This gets your company provisioned as a Canton party in the pool.
          </p>

          {error && (
            <div className="mb-4">
              <Alert type="error">{error}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={f("email")}
              required
              disabled={!!auth0User?.email}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Company name"
                placeholder="Acme Corp"
                value={form.companyName}
                onChange={f("companyName")}
                required
              />
              <Input
                label="Contact name"
                placeholder="Alice"
                value={form.contactName}
                onChange={f("contactName")}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Phone"
                type="tel"
                placeholder="+1234567890"
                value={form.phone}
                onChange={f("phone")}
                required
              />
              <Select
                label="Country"
                options={COUNTRIES}
                value={form.country}
                onChange={f("country")}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={submitting}
              disabled={!valid}
            >
              Submit for approval
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
