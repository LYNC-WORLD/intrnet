import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { cyclesApi, positionsApi, obligationsApi, settlementApi } from '../../services/api';
import { NettingCycle, NetPosition, Obligation, SettlementInstruction } from '../../types';
import { Card, CardHeader, CardBody, Badge, Button, Table, Th, Td, Tr, PageLoader } from '../../components/ui';
import { fmt } from '../../utils';

export default function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const [cycle, setCycle] = useState<NettingCycle | null>(null);
  const [position, setPosition] = useState<NetPosition | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [instructions, setInstructions] = useState<SettlementInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    if (!cycleId) return;
    Promise.allSettled([
      cyclesApi.list(),
      positionsApi.list({ cycleId }),
      obligationsApi.list({ status: 'NETTED' }),
      settlementApi.instructions(),
    ]).then(([c, p, o, s]) => {
      if (c.status === 'fulfilled') {
        const list: NettingCycle[] = c.value.data ?? [];
        setCycle(list.find(x => x.cycleId === cycleId) ?? null);
      }
      if (p.status === 'fulfilled') {
        const list: NetPosition[] = p.value.data?.positions ?? p.value.data ?? [];
        setPosition(list.find(x => x.cycleId === cycleId) ?? list[0] ?? null);
      }
      if (o.status === 'fulfilled') {
        const list: Obligation[] = o.value.data?.obligations ?? o.value.data ?? [];
        setObligations(list.filter(x => x.cycleId === cycleId));
      }
      if (s.status === 'fulfilled') {
        const list: SettlementInstruction[] = s.value.data?.instructions ?? s.value.data ?? [];
        setInstructions(list.filter(x => x.cycleId === cycleId));
      }
      setLoading(false);
    });
  }, [cycleId]);

  const handleAck = async () => {
    if (!position) return;
    setAcking(true);
    try {
      await positionsApi.acknowledge(position.contractId);
      setPosition(p => p ? { ...p, status: 'ACKNOWLEDGED' } : p);
      toast.success('Position acknowledged');
    } catch { toast.error('Failed to acknowledge'); }
    finally { setAcking(false); }
  };

  if (loading) return <PageLoader />;
  if (!cycle) return <p className="text-center text-bone-700 py-16">Cycle not found.</p>;

  return (
    <div className="space-y-6">
      <Link to="/cycles" className="text-sm text-lime-400 hover:text-lime-300 hover:underline">← Back to cycles</Link>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-bone-100">{cycle.cycleId}</h1>
              <p className="text-xs text-bone-500">Cutoff: {fmt.date(cycle.cutoffTime)} · {cycle.settlementCurrency}</p>
            </div>
            <Badge status={cycle.status} />
          </div>
        </CardHeader>
      </Card>

      {/* Net position */}
      {position && (
        <Card>
          <CardBody className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-bone-500 mb-1">Your net position</p>
              <p className={`text-2xl font-bold ${position.netAmountSettlement >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                You will {position.netAmountSettlement >= 0 ? 'RECEIVE' : 'PAY'} {fmt.currency(Math.abs(position.netAmountSettlement))}
              </p>
            </div>
            {position.status === 'PENDING' ? (
              <Button onClick={handleAck} loading={acking}>Acknowledge</Button>
            ) : (
              <Badge status="ACKNOWLEDGED" />
            )}
          </CardBody>
        </Card>
      )}

      {/* My contributions */}
      <Card>
        <CardHeader><h2 className="font-semibold text-bone-100">My Contributions</h2></CardHeader>
        <CardBody className="p-0">
          {obligations.length === 0 ? (
            <p className="text-sm text-bone-700 px-6 py-8 text-center">No obligations in this cycle yet.</p>
          ) : (
            <Table>
              <thead><tr><Th>Invoice Ref</Th><Th>Counterparty</Th><Th>Amount</Th></tr></thead>
              <tbody>
                {obligations.map(o => (
                  <Tr key={o.contractId}>
                    <Td>{o.invoiceRef}</Td>
                    <Td>{o.receiverName ?? o.payerName ?? '—'}</Td>
                    <Td>{fmt.currency(o.amount, o.currency)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Settlement instructions */}
      {instructions.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold text-bone-100">Settlement Instructions</h2></CardHeader>
          <CardBody className="p-0">
            <Table>
              <thead><tr><Th>Counterparty</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
              <tbody>
                {instructions.map(i => (
                  <Tr key={i.contractId}>
                    <Td>{i.payerName ?? i.receiverName ?? '—'}</Td>
                    <Td>{fmt.currency(i.amount, i.currency)}</Td>
                    <Td><Badge status={i.status} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
