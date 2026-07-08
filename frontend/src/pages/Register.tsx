import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { Input, Button, Select, Alert } from '../components/ui';
import { CantonMark, StackedPanes } from '../components/ui/CantonMark';

const COUNTRIES = [
  { value: '', label: 'Select country' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'JP', label: 'Japan' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AU', label: 'Australia' },
  { value: 'IN', label: 'India' },
  { value: 'CA', label: 'Canada' },
];

export default function Register() {
  const [form, setForm] = useState({ companyName: '', email: '', password: '', confirmPassword: '', country: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const valid =
    form.companyName && form.email && form.country &&
    form.password.length >= 8 && form.password === form.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setLoading(true);
    try {
      await authApi.register({ companyName: form.companyName, email: form.email, password: form.password, country: form.country });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-900 bg-fine-grid relative overflow-hidden px-4">
        <div className="absolute inset-0 bg-lime-glow pointer-events-none" />
        <div className="w-full max-w-sm text-center relative z-10">
          <div className="mx-auto mb-5 h-14 w-14 rounded-full bg-lime-500/15 flex items-center justify-center">
            <CantonMark size={28} />
          </div>
          <h2 className="text-xl font-semibold text-bone-100 font-display mb-2">Account created</h2>
          <p className="text-bone-500 text-sm mb-6 leading-relaxed">
            Your Canton party is being provisioned and added to the netting agreement.
            You'll receive a confirmation email once it's ready — usually under 5 seconds on sandbox.
          </p>
          <Link to="/login" className="text-lime-400 hover:text-lime-300 transition text-sm">Back to sign in →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-ink-900 bg-fine-grid relative overflow-hidden">
      <div className="absolute inset-0 bg-lime-glow pointer-events-none" />

      <div className="hidden lg:flex flex-1 flex-col p-12 relative z-10">
        <div className="flex items-center gap-2.5">
          <CantonMark size={26} />
          <span className="text-xl font-semibold text-bone-100 font-display tracking-tight">NetClear</span>
        </div>
        <div className="flex-1 flex flex-col justify-center max-w-md">
          <p className="text-xs font-medium text-lime-400 uppercase tracking-[0.2em] mb-4">Built on Canton</p>
          <h1 className="text-5xl font-display font-semibold text-bone-100 leading-[1.1]">
            Connections <span className="text-gradient-lime">without the trade-offs</span>
          </h1>
          <p className="text-bone-500 mt-5 text-base leading-relaxed">
            Join the pool and net obligations across every counterparty —
            without sacrificing privacy or control over your ledger.
          </p>

          <div className="mt-10 space-y-4">
            {[
              ['Provisioned on Canton', 'Your company gets its own party and cash account.'],
              ['One agreement, every counterparty', 'Trade with the whole pool under a single contract.'],
              ['Settle in USD', 'The pool nets and settles in one common currency.'],
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
        <div className="relative h-48 opacity-80">
          <StackedPanes className="w-full h-full" />
        </div>
      </div>

      <div className="w-full lg:w-[480px] flex items-center justify-center p-6 relative z-10 bg-ink-800/40 lg:border-l border-ink-500 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <CantonMark size={24} />
            <span className="text-xl font-semibold text-bone-100 font-display">NetClear</span>
          </div>

          <h2 className="text-xl font-semibold text-bone-100 font-display mb-1">Create company account</h2>
          <p className="text-sm text-bone-500 mb-6">Register your company and provision a Canton party.</p>

          {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Company name" placeholder="Acme Corp" value={form.companyName} onChange={f('companyName')} required />
            <Input label="Email" type="email" placeholder="you@company.com" value={form.email} onChange={f('email')} required />
            <Select label="Country" options={COUNTRIES} value={form.country} onChange={f('country')} required />
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={f('password')}
              error={form.password && form.password.length < 8 ? 'At least 8 characters' : undefined}
              required
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={f('confirmPassword')}
              error={form.confirmPassword && form.password !== form.confirmPassword ? 'Passwords do not match' : undefined}
              required
            />

            <div className="bg-lime-500/10 border border-lime-500/25 rounded-lg p-3 text-xs text-lime-400 leading-relaxed">
              Pool settles in <strong>USD</strong>. Settlement currency cannot be changed after registration.
            </div>

            <Button type="submit" loading={loading} disabled={!valid} className="w-full" size="lg">
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-bone-500">
            Already have an account?{' '}
            <Link to="/login" className="text-lime-400 hover:text-lime-300 transition">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
