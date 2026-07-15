import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  useObligations,
  useAcceptObligation,
  useRejectObligation,
} from "../../hooks/queries";
import { Obligation } from "../../types";
import {
  Card,
  CardBody,
  Badge,
  Button,
  Select,
  Input,
  Table,
  Th,
  Td,
  Tr,
  PageLoader,
  EmptyState,
} from "../../components/ui";
import { fmt } from "../../utils";
import { useAuth } from "@/context/AuthContext";
import { useDebounce } from "@/hooks";

const TABS = [
  { key: "all", label: "All" },
  { key: "payer", label: "I Owe (Payer)" },
  { key: "receiver", label: "Owed to Me (Receiver)" },
  { key: "pending", label: "Pending Acceptance" },
];

const CURRENCIES = [
  { value: "", label: "All currencies" },
  ...["USD", "EUR", "GBP", "JPY", "CHF", "AUD"].map((c) => ({
    value: c,
    label: c,
  })),
];
const STATUSES = [
  { value: "", label: "All statuses" },
  ...["PENDING", "ACCEPTED", "NETTED"].map((s) => ({
    value: s,
    label: s,
  })),
];

export default function Obligations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "all";
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const limit = 10;

  const queryParams: Record<string, string | number | undefined> = {
    page,
    limit,
  };
  if (currency) queryParams.currency = currency;
  if (status) queryParams.status = status;
  if (tab === "payer") queryParams.role = "payer";
  if (tab === "receiver") queryParams.role = "receiver";
  if (tab === "pending") {
    queryParams.status = "PENDING";
    queryParams.role = "receiver";
  }

  const { data, isLoading } = useObligations(queryParams);
  const acceptMutation = useAcceptObligation();
  const rejectMutation = useRejectObligation();

  let obligations: Obligation[] = data?.obligations ?? data ?? [];
  const total: number = data?.total ?? obligations.length;
  if (debouncedSearch)
    obligations = obligations.filter((o) =>
      o.invoiceRef.toLowerCase().includes(debouncedSearch.toLowerCase()),
    );

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

  const exportCsv = () => {
    const rows = [
      [
        "Invoice Ref",
        "Direction",
        "Counterparty",
        "Amount",
        "Currency",
        "Status",
        "Date",
      ],
      ...obligations.map((o) => [
        o.invoiceRef,
        user?.partyId === o.payer ? "Pay" : "Receive",
        user?.partyId === o.payer
          ? o.receiver.split("::")[0]
          : o.payer.split("::")[0],
        String(o.amount),
        o.currency,
        o.status,
        o.createdAt,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "obligations.csv";
    a.click();
  };

  useEffect(() => {
    setPage(1);
  }, [tab, currency, status, debouncedSearch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-bone-100">My Obligations</h1>
        <Button onClick={() => navigate("/obligations/new")}>
          + New Obligation
        </Button>
      </div>

      <div className="flex gap-1 border-b border-ink-500 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setParams({ tab: t.key });
              setPage(1);
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key
                ? "border-lime-500 text-lime-400"
                : "border-transparent text-bone-500 hover:text-bone-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="flex flex-wrap gap-3 items-end !px-4">
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:w-40">
              <Select
                options={CURRENCIES}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
            <div className="flex-1 sm:w-40">
              <Select
                options={STATUSES}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Search invoice ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <PageLoader />
          ) : obligations.length === 0 ? (
            <EmptyState message="No obligations found" icon="📄" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice Ref</Th>
                  <Th>Direction</Th>
                  <Th>Counterparty</Th>
                  <Th>Amount</Th>
                  <Th>Currency</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((o) => {
                  // Track which specific row's button is mid-mutation so only
                  // that row shows a spinner, not the whole table.
                  const isAccepting =
                    acceptMutation.isPending &&
                    acceptMutation.variables === o.contractId;
                  const isRejecting =
                    rejectMutation.isPending &&
                    rejectMutation.variables?.cid === o.contractId;

                  return (
                    <Tr key={o.contractId}>
                      <Td>
                        <Link
                          to={`/obligations/${o.contractId}`}
                          className="text-lime-400 hover:text-lime-300 hover:underline font-medium"
                        >
                          {o.invoiceRef}
                        </Link>
                      </Td>
                      <Td>
                        {user?.partyId === o.payer ? (
                          <span className="text-red-400 font-medium text-xs">
                            ↑ Pay
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium text-xs">
                            ↓ Receive
                          </span>
                        )}
                      </Td>
                      <Td>
                        {user?.partyId === o.payer
                          ? o.receiver.split("::")[0]
                          : o.payer.split("::")[0]}
                      </Td>
                      <Td>{fmt.number(o.amount)}</Td>
                      <Td>{o.currency}</Td>
                      <Td>
                        <Badge status={o.status} />
                      </Td>
                      <Td>{fmt.dateShort(o.createdAt)}</Td>
                      <Td>
                        {o.status === "PENDING" && o.payer !== user?.partyId ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAccept(o.contractId)}
                              loading={isAccepting}
                              disabled={isRejecting}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleReject(o.contractId)}
                              loading={isRejecting}
                              disabled={isAccepting}
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
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {total > limit && (
        <div className="flex justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="px-3 py-1.5 text-sm text-bone-500">
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
