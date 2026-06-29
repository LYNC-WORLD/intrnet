import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { obligationsApi } from '../../services/api';
import { Obligation } from '../../types';
import { Card, CardBody, Badge, Button, Select, Input, Table, Th, Td, Tr, PageLoader, EmptyState } from '../../components/ui';
import { fmt } from '../../utils';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'payer', label: 'I Owe (Payer)' },
  { key: 'receiver', label: 'Owed to Me (Receiver)' },
  { key: 'pending', label: 'Pending Acceptance' },
];

const CURRENCIES = [{ value: '', label: 'All currencies' }, ...['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD'].map(c => ({ value: c, label: c }))];
const STATUSES = [{ value: '', label: 'All statuses' }, ...['PENDING', 'ACCEPTED', 'REJECTED', 'NETTED'].map(s => ({ value: s, label: s }))];

export default function Obligations() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'all';
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const limit = 20;

  const load = useCallback(() => {
    setLoading(true);
    const query: Record<string, string | number | undefined> = { page, limit };
    if (currency) query.currency = currency;
    if (status) query.status = status;
    if (tab === 'payer') query.role = 'payer';
    if (tab === 'receiver') query.role = 'receiver';
    if (tab === 'pending') { query.status = 'PENDING'; query.role = 'receiver'; }

    obligationsApi.list(query).then(res => {
      let list: Obligation[] = res.data?.obligations ?? res.data ?? [];
      if (search) list = list.filter(o => o.invoiceRef.toLowerCase().includes(search.toLowerCase()));
      setObligations(list);
      setTotal(res.data?.total ?? list.length);
    }).finally(() => setLoading(false));
  }, [page, currency, status, tab, search]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (cid: string) => {
    try {
      await obligationsApi.accept(cid);
      setObligations(o => o.map(x => x.contractId === cid ? { ...x, status: 'ACCEPTED' } : x));
      toast.success('Obligation accepted');
    } catch { toast.error('Failed to accept'); }
  };

  const handleReject = async (cid: string) => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    try {
      await obligationsApi.reject(cid, reason);
      setObligations(o => o.map(x => x.contractId === cid ? { ...x, status: 'REJECTED' } : x));
      toast.success('Obligation rejected');
    } catch { toast.error('Failed to reject'); }
  };

  const exportCsv = () => {
    const rows = [['Invoice Ref', 'Counterparty', 'Amount', 'Currency', 'Status', 'Date'],
      ...obligations.map(o => [o.invoiceRef, o.receiverName ?? o.payerName ?? '', String(o.amount), o.currency, o.status, o.createdAt])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'obligations.csv'; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-bone-100">My Obligations</h1>
        <Button onClick={() => navigate('/obligations/new')}>+ New Obligation</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-500 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setParams({ tab: t.key }); setPage(1); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-lime-500 text-lime-400' : 'border-transparent text-bone-500 hover:text-bone-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap gap-3 items-end">
          <div className="w-40"><Select options={CURRENCIES} value={currency} onChange={e => setCurrency(e.target.value)} /></div>
          <div className="w-40"><Select options={STATUSES} value={status} onChange={e => setStatus(e.target.value)} /></div>
          <div className="flex-1 min-w-[180px]"><Input placeholder="Search invoice ref..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {loading ? <PageLoader /> : obligations.length === 0 ? (
            <EmptyState message="No obligations found" icon="📄" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice Ref</Th><Th>Counterparty</Th><Th>Amount</Th><Th>Currency</Th><Th>Status</Th><Th>Date</Th><Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {obligations.map(o => (
                  <Tr key={o.contractId}>
                    <Td>
                      <Link to={`/obligations/${o.contractId}`} className="text-lime-400 hover:text-lime-300 hover:underline font-medium">{o.invoiceRef}</Link>
                    </Td>
                    <Td>{o.receiverName ?? o.payerName ?? '—'}</Td>
                    <Td>{fmt.number(o.amount)}</Td>
                    <Td>{o.currency}</Td>
                    <Td><Badge status={o.status} /></Td>
                    <Td>{fmt.dateShort(o.createdAt)}</Td>
                    <Td>
                      {o.status === 'PENDING' ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAccept(o.contractId)}>Accept</Button>
                          <Button size="sm" variant="danger" onClick={() => handleReject(o.contractId)}>Reject</Button>
                        </div>
                      ) : (
                        <Link to={`/obligations/${o.contractId}`} className="text-sm text-bone-500 hover:text-lime-400">View</Link>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Pagination */}
      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="px-3 py-1.5 text-sm text-bone-500">Page {page} of {Math.ceil(total / limit)}</span>
          <Button variant="secondary" size="sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
