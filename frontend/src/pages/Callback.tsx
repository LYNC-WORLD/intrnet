import { CantonMark } from "../components/ui/CantonMark";

export default function Callback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-ink-900 bg-fine-grid">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <CantonMark size={32} spin />
        </div>
        <p className="text-bone-300 text-sm">Authenticating…</p>
      </div>
    </div>
  );
}
