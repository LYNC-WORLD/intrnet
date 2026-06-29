import { Link } from 'react-router-dom';
import { CantonMark } from '../components/ui/CantonMark';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 bg-fine-grid">
      <div className="text-center">
        <div className="flex justify-center mb-4"><CantonMark size={40} /></div>
        <p className="text-6xl font-display font-semibold text-gradient-lime">404</p>
        <p className="text-bone-500 mt-2 mb-6">This page doesn't exist on the ledger.</p>
        <Link to="/" className="text-lime-400 hover:text-lime-300 transition text-sm">Go home →</Link>
      </div>
    </div>
  );
}
