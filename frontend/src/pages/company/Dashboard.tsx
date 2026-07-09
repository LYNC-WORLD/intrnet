import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import {
  useObligations,
  useCycles,
  usePositions,
  useSettlementAccounts,
  useAcceptObligation,
  useRejectObligation,
} from "../../hooks/queries";
import {
  NetPosition,
  CashAccount,
  NettingCycle,
  Obligation,
} from "../../types";
import {
  KpiCard,
  Card,
  CardHeader,
  CardBody,
  Button,
  PageLoader,
  Alert,
} from "../../components/ui";
import { fmt } from "../../utils";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    data: pendingData,
    isLoading: loadingPending,
    isRefetching,
  } = useObligations({ status: "PENDING", role: "receiver", limit: 5 });
  const { data: acceptedData } = useObligations({
    status: "ACCEPTED",
    limit: 1,
  });
  const { data: positionsData } = usePositions();
  const { data: accountsData } = useSettlementAccounts();
  const { data: cyclesData } = useCycles();

  const acceptMutation = useAcceptObligation();
  const rejectMutation = useRejectObligation();

  const pending: Obligation[] = pendingData?.obligations ?? pendingData ?? [];
  const acceptedCount: number = acceptedData?.total ?? 0;

  const allPositions: NetPosition[] =
    positionsData?.positions ?? positionsData ?? [];
  const position = allPositions.length
    ? allPositions.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0]
    : null;

  const accounts: CashAccount[] = Array.isArray(accountsData)
    ? accountsData
    : [];
  const balance =
    accounts.find((a) => a.currency === "USD") ?? accounts[0] ?? null;

  const cycles: NettingCycle[] = Array.isArray(cyclesData) ? cyclesData : [];
  const openCycle = cycles.find((c) => c?.status === "OPEN") ?? null;

  const handleAccept = (cid: string) => {
    acceptMutation.mutate(cid, {
      onSuccess: () => toast.success("Obligation accepted"),
      onError: () => toast.error("Failed to accept"),
    });
  };

  const handleReject = (cid: string) => {
    const reason = prompt("Reason for rejection:");
    if (!reason) return;
    rejectMutation.mutate(
      { cid, reason },
      {
        onSuccess: () => toast.success("Obligation rejected"),
        onError: () => toast.error("Failed to reject"),
      },
    );
  };

  if (loadingPending) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-bone-100 flex items-center gap-2">
          Dashboard
          {isRefetching && (
            <span className="text-xs text-bone-700 font-normal flex items-center gap-1">
              <RefreshCw size={11} className="animate-spin" /> Updating
            </span>
          )}
        </h1>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          {pending.length === 0 ? (
            <div className="py-12 text-center text-sm text-bone-700">
              No pending obligations
            </div>
          ) : (
            <ul className="divide-y divide-ink-500">
              {pending.map((o) => (
                <li
                  key={o.contractId}
                  className="px-2 sm:px-6 py-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-bone-100 truncate">
                      {o.invoiceRef}
                    </p>
                    <p className="text-xs flex items-center flex-wrap gap-1 text-bone-500">
                      From{" "}
                      <span className="truncate max-w-[80px] sm:max-w-[200px]">
                        {o.payer.split("::")[0]}
                      </span>{" "}
                      · {fmt.currency(o.amount, o.currency)}
                    </p>
                  </div>
                  {o.payer !== user?.partyId ? (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(o.contractId)}
                        loading={acceptMutation.isPending}
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
                  ) : (
                    <Link
                      to={`/obligations/${o.contractId}`}
                      className="text-sm text-bone-500 hover:text-lime-400"
                    >
                      View
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

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
