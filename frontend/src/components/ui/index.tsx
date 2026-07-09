import {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from "react";
import { getStatusColor } from "../../utils";
import { CantonMark } from "./CantonMark";

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${getStatusColor(status)}`}
    >
      {status}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

const variantCls: Record<string, string> = {
  primary:
    "bg-lime-500 hover:bg-lime-400 text-ink-950 font-semibold shadow-glow",
  secondary: "bg-ink-700 hover:bg-ink-600 text-bone-100 border border-ink-500",
  danger: "bg-red-500/90 hover:bg-red-500 text-white",
  ghost: "text-bone-300 hover:bg-ink-700 hover:text-bone-100",
};
const sizeCls: Record<string, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-2.5 text-base",
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled,
  loading,
  className = "",
}: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 disabled:opacity-40 disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]} ${className}`}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-ink-800 rounded-xl border border-ink-500 ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-6 py-4 border-b border-ink-500 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, className = "", ...props }, ref) => (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-bone-300">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`w-full px-3 py-2 bg-ink-700 border rounded-lg text-sm text-bone-100 placeholder:text-bone-700 focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:border-lime-500/60 transition disabled:opacity-50 ${error ? "border-red-500/60" : "border-ink-400"} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {helper && !error && <p className="text-xs text-bone-700">{helper}</p>}
    </div>
  ),
);
Input.displayName = "Input";

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({
  label,
  error,
  options,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-bone-300">
          {label}
        </label>
      )}
      <select
        className={`w-full px-3 py-2 bg-ink-700 border rounded-lg text-sm text-bone-100 focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:border-lime-500/60 transition ${error ? "border-red-500/60" : "border-ink-400"} ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-700">
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({
  label,
  error,
  className = "",
  ...props
}: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-bone-300">
          {label}
        </label>
      )}
      <textarea
        className={`w-full px-3 py-2 bg-ink-700 border rounded-lg text-sm text-bone-100 placeholder:text-bone-700 focus:outline-none focus:ring-2 focus:ring-lime-500/60 focus:border-lime-500/60 resize-none transition ${error ? "border-red-500/60" : "border-ink-400"} ${className}`}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = { sm: 16, md: 24, lg: 32 }[size];
  return <CantonMark size={px} spin />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-zinc-800 border-t-lime-400" />
        <div className="absolute inset-2 animate-spin rounded-full border-4 border-transparent border-t-lime-400 [animation-direction:reverse] [animation-duration:1.5s]" />
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-ink-800 border border-ink-500 rounded-xl shadow-2xl w-full max-w-md mx-4 z-10 animate-fade-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-500">
          <h3 className="text-base font-semibold text-bone-100 font-display">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-bone-500 hover:text-bone-100 transition"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-ink-500 flex gap-3 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({
  message,
  icon,
}: {
  message: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-bone-700">
      {/* <div className="mb-3 opacity-70">
        <CantonMark size={36} />
      </div> */}
      {/* {icon && <div className="mb-2 text-3xl">{icon}</div>} */}
      <p className="text-sm text-bone-500">{message}</p>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-lime-500/0 via-lime-500/60 to-lime-500/0" />
      <CardBody className="py-5">
        <p className="text-xs font-medium text-bone-500 uppercase tracking-wider">
          {label}
        </p>
        <p
          className={`text-2xl font-bold mt-1 font-display ${color ?? "text-bone-100"}`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-bone-700 mt-0.5">{sub}</p>}
      </CardBody>
    </Card>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────
export function Alert({
  type,
  children,
}: {
  type: "info" | "warning" | "error" | "success";
  children: ReactNode;
}) {
  const cls = {
    info: "bg-lime-500/10 border-lime-500/30 text-lime-400",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    error: "bg-red-500/10 border-red-500/30 text-red-400",
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  }[type];
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

// ─── Table primitives ────────────────────────────────────────────────────────
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full divide-y divide-ink-500">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3  text-left text-xs font-medium text-bone-500 uppercase text-nowrap tracking-wider">
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm text-bone-300 whitespace-nowrap ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-ink-600 last:border-0 ${onClick ? "cursor-pointer hover:bg-ink-700/60" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}
