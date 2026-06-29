import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  obligationsApi,
  positionsApi,
  settlementApi,
  cyclesApi,
} from "../../services/api";
import {
  Obligation,
  NetPosition,
  CashAccount,
  NettingCycle,
} from "../../types";
import {
  KpiCard,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  PageLoader,
  Alert,
} from "../../components/ui";
import { fmt } from "../../utils";

export default function Dashboard() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<Obligation[]>([]);
  const [position, setPosition] = useState<NetPosition | null>(null);
  const [balance, setBalance] = useState<CashAccount | null>(null);
  const [openCycle, setOpenCycle] = useState<NettingCycle | null>(null);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      obligationsApi.list({ status: "PENDING", role: "receiver", limit: 5 }),
      obligationsApi.list({ status: "ACCEPTED", limit: 1 }),
      positionsApi.list(),
      settlementApi.accounts(),
      cyclesApi.list(),
    ]).then(([p, a, pos, acc, cyc]) => {
      if (p.status === "fulfilled")
        setPending(p.value.data?.obligations ?? p.value.data ?? []);
      if (a.status === "fulfilled") setAcceptedCount(a.value.data?.total ?? 0);
      if (pos.status === "fulfilled") {
        const all: NetPosition[] =
          pos.value.data?.positions ?? pos.value.data ?? [];
        if (all.length)
          setPosition(
            all.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )[0],
          );
      }
      if (acc.status === "fulfilled") {
        const accounts: CashAccount[] = Array.isArray(acc.value.data)
          ? acc.value.data
          : [];

        setBalance(
          accounts.find((a) => a.currency === "USD") ?? accounts[0] ?? null,
        );
      }
      if (cyc.status === "fulfilled") {
        const cycles: NettingCycle[] = Array.isArray(cyc.value.data)
          ? cyc.value.data
          : [];

        setOpenCycle(cycles.find((c) => c?.status === "OPEN") ?? null);
      }
      setLoading(false);
    });
  }, []);

  const handleAccept = async (cid: string) => {
    try {
      await obligationsApi.accept(cid);
      setPending((p) => p.filter((o) => o.contractId !== cid));
      toast.success("Obligation accepted");
    } catch {
      toast.error("Failed to accept");
    }
  };

  const handleReject = async (cid: string) => {
    const reason = prompt("Reason for rejection:");
    if (!reason) return;
    try {
      await obligationsApi.reject(cid, reason);
      setPending((p) => p.filter((o) => o.contractId !== cid));
      toast.success("Obligation rejected");
    } catch {
      toast.error("Failed to reject");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-bone-100">Dashboard</h1>
        <Button onClick={() => navigate("/obligations/new")}>
          + New Obligation
        </Button>
      </div>

      {openCycle && (
        <Alert type="info">
          🔄 Cycle <strong>{openCycle.cycleId}</strong> is currently open.
          Cutoff: {fmt.date(openCycle.cutoffTime)}.{" "}
          <Link to="/cycles" className="underline font-medium">
            View your position →
          </Link>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Pending Obligations"
          value={pending.length}
          sub="Awaiting your action"
          color="text-amber-400"
        />
        <KpiCard
          label="Accepted Obligations"
          value={acceptedCount}
          sub="Total accepted"
        />
        <KpiCard
          label="Net Position"
          value={position ? fmt.currency(position.netAmountSettlement) : "—"}
          sub={
            position
              ? position.netAmountSettlement >= 0
                ? "You receive"
                : "You owe"
              : "No position yet"
          }
          color={
            position
              ? position.netAmountSettlement >= 0
                ? "text-emerald-400"
                : "text-red-400"
              : undefined
          }
        />
        <KpiCard
          label="Cash Balance"
          value={
            balance ? fmt.currency(balance.balance, balance.currency) : "—"
          }
          sub="On-ledger account"
        />
      </div>

      {/* Pending obligations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-bone-100">Pending Obligations</h2>
            <Link
              to="/obligations?tab=pending"
              className="text-sm text-lime-400 hover:text-lime-300 hover:underline"
            >
              View all →
            </Link>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {Array.isArray(pending) && pending.length === 0 ? (
            <div className="py-12 text-center text-sm text-bone-700">
              No pending obligations
            </div>
          ) : (
            <ul className="divide-y divide-ink-500">
              {Array.isArray(pending) &&
                pending.map((o) => (
                  <li
                    key={o.contractId}
                    className="px-6 py-4 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-bone-100 truncate">
                        {o.invoiceRef}
                      </p>
                      <p className="text-xs text-bone-500">
                        From {o.payerName ?? o.payer} ·{" "}
                        {fmt.currency(o.amount, o.currency)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(o.contractId)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleReject(o.contractId)}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => navigate("/obligations")}>
          My Obligations
        </Button>
        <Button variant="secondary" onClick={() => navigate("/positions")}>
          View Positions
        </Button>
        <Button variant="secondary" onClick={() => navigate("/settlement")}>
          Settlement
        </Button>
      </div>
    </div>
  );
}
