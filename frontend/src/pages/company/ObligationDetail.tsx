import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { obligationsApi } from '../../services/api';
import { Obligation } from '../../types';
import { Card, CardHeader, CardBody, Badge, Button, PageLoader } from '../../components/ui';
import { fmt } from '../../utils';

export default function ObligationDetail() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const [obligation, setObligation] = useState<Obligation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contractId) return;
    obligationsApi.get(contractId).then(res => setObligation(res.data)).finally(() => setLoading(false));
  }, [contractId]);

  const handleAccept = async () => {
    if (!contractId) return;
    try {
      await obligationsApi.accept(contractId);
      toast.success('Obligation accepted');
      navigate('/obligations');
    } catch { toast.error('Failed to accept'); }
  };

  const handleReject = async () => {
    if (!contractId) return;
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    try {
      await obligationsApi.reject(contractId, reason);
      toast.success('Obligation rejected');
      navigate('/obligations');
    } catch { toast.error('Failed to reject'); }
  };

  if (loading) return <PageLoader />;
  if (!obligation) return <p className="text-center text-bone-700 py-16">Obligation not found.</p>;

  const timeline = [
    { label: 'Created', at: obligation.createdAt, done: true },
    { label: obligation.status === 'REJECTED' ? 'Rejected' : 'Accepted', at: undefined, done: obligation.status !== 'PENDING' },
    { label: 'Netted', at: undefined, done: obligation.status === 'NETTED' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/obligations" className="text-sm text-lime-400 hover:text-lime-300 hover:underline">← Back to obligations</Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-bone-100">{obligation.invoiceRef}</h1>
              <p className="text-xs text-bone-500">Created {fmt.date(obligation.createdAt)}</p>
            </div>
            <Badge status={obligation.status} />
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-bone-500 mb-0.5">Payer</p>
              <p className="text-sm font-medium text-bone-100">{obligation.payerName ?? obligation.payer}</p>
              <p className="text-xs text-bone-700 font-mono truncate">{obligation.payer}</p>
            </div>
            <div>
              <p className="text-xs text-bone-500 mb-0.5">Receiver</p>
              <p className="text-sm font-medium text-bone-100">{obligation.receiverName ?? obligation.receiver}</p>
              <p className="text-xs text-bone-700 font-mono truncate">{obligation.receiver}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-bone-500 mb-0.5">Amount</p>
              <p className="text-lg font-semibold text-bone-100">{fmt.currency(obligation.amount, obligation.currency)}</p>
            </div>
            {obligation.agreementId && (
              <div>
                <p className="text-xs text-bone-500 mb-0.5">Agreement</p>
                <p className="text-sm text-bone-300 font-mono">{obligation.agreementId}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-bone-500 mb-1">Description</p>
            <p className="text-sm text-bone-300">{obligation.description}</p>
          </div>

          {obligation.cycleId && (
            <div className="bg-lime-500/10 border border-lime-500/25 rounded-lg p-3">
              <p className="text-xs text-lime-400">Included in cycle</p>
              <Link to={`/cycles/${obligation.cycleId}`} className="text-sm font-medium text-lime-400 hover:text-lime-300 hover:underline">
                {obligation.cycleId} →
              </Link>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs text-bone-500 mb-2">Timeline</p>
            <div className="flex items-center gap-2">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${t.done ? 'bg-lime-500' : 'bg-ink-500'}`} />
                  <span className={`text-xs ${t.done ? 'text-bone-300' : 'text-bone-700'}`}>{t.label}</span>
                  {i < timeline.length - 1 && <div className="flex-1 h-px bg-ink-500" />}
                </div>
              ))}
            </div>
          </div>

          {obligation.status === 'PENDING' && (
            <div className="flex gap-3 pt-2">
              <Button onClick={handleAccept}>Accept</Button>
              <Button variant="danger" onClick={handleReject}>Reject</Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
