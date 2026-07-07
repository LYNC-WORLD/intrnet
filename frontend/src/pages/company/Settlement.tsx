import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { settlementApi } from "../../services/api";
import { SettlementInstruction, CashAccount } from "../../types";
import {
  Card,
  CardBody,
  Badge,
  Button,
  Table,
  Th,
  Td,
  Tr,
  PageLoader,
  EmptyState,
  Modal,
  Alert,
} from "../../components/ui";
import { fmt } from "../../utils";
import { useAuth } from "@/context/AuthContext";

const LOW_BALANCE_THRESHOLD = Number(50000);

const TABS = [
  { key: "pay", label: "I Need to Pay" },
  { key: "receive", label: "I Will Receive" },
  { key: "all", label: "All" },
];

export default function Settlement() {
  const [instructions, setInstructions] = useState<SettlementInstruction[]>([]);
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modalInstruction, setModalInstruction] =
    useState<SettlementInstruction | null>(null);
  const [balance, setBalance] = useState<CashAccount | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      settlementApi.instructions(),
      settlementApi.accounts(),
    ]).then(([i, a]) => {
      if (i.status === "fulfilled")
        setInstructions(i.value.data?.instructions ?? i.value.data ?? []);
      if (a.status === "fulfilled") {
        const accounts: CashAccount[] = a.value.data ?? [];
        setBalance(
          accounts.find((x) => x.currency === "USD") ?? accounts[0] ?? null,
        );
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = instructions.filter((i) => {
    if (tab === "pay") return i.payer === user?.partyId;
    if (tab === "receive") return i.receiver === user?.partyId;
    return true;
  });

  const totalToPay = instructions
    .filter((i) => i.payer === user?.partyId && i.status === "PENDING")
    .reduce((s, i) => s + i.amount, 0);

  const totalToReceive = instructions
    .filter((i) => i.receiver === user?.partyId && i.status === "CONFIRMED")
    .reduce((s, i) => s + i.amount, 0);

  const openPayModal = async (instruction: SettlementInstruction) => {
    setModalInstruction(instruction);
    setError("");
    setModalLoading(true);
    try {
      const res = await settlementApi.accounts();
      const accounts: CashAccount[] = res.data ?? [];
      setBalance(
        accounts.find((a) => a.currency === instruction.currency) ??
          accounts[0] ??
          null,
      );
    } finally {
      setModalLoading(false);
    }
  };

  const handleConfirmPay = async () => {
    if (!modalInstruction) return;
    setConfirming(true);
    setError("");
    try {
      await settlementApi.execute(modalInstruction.contractId);
      setInstructions((prev) =>
        prev.map((i) =>
          i.contractId === modalInstruction.contractId
            ? { ...i, status: "EXECUTED" }
            : i,
        ),
      );
      toast.success("Payment sent");
      setModalInstruction(null);
    } catch {
      setError("Payment failed. Please check your balance and try again.");
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmReceipt = async (cid: string) => {
    try {
      await settlementApi.confirm(cid);
      setInstructions((prev) =>
        prev.map((i) =>
          i.contractId === cid ? { ...i, status: "CONFIRMED" } : i,
        ),
      );
      toast.success("Receipt confirmed");
    } catch {
      toast.error("Failed to confirm");
    }
  };

  const balanceAfter =
    balance && modalInstruction
      ? balance.balance - modalInstruction.amount
      : null;
  const isLow = balanceAfter !== null && balanceAfter < LOW_BALANCE_THRESHOLD;

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-bone-100">
        Settlement Instructions
      </h1>

      <div className="flex gap-1 border-b border-ink-500">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <EmptyState message="No settlement instructions" icon="💸" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cycle</Th>
                  <Th>Counterparty</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <Tr key={i.contractId}>
                    <Td>{i.cycleId}</Td>
                    <Td>
                      {user?.partyId === i.payer
                        ? i.receiver.split("::")[0]
                        : i.payer.split("::")[0]}
                    </Td>
                    <Td>
                      <span
                        className={
                          user?.partyId === i.payer
                            ? "text-red-400"
                            : "text-emerald-400"
                        }
                      >
                        {user?.partyId === i.payer ? "-" : "+"}
                        {fmt.currency(i.amount, i.currency)}
                      </span>
                    </Td>{" "}
                    <Td>
                      <Badge status={i.status} />
                    </Td>
                    <Td>{fmt.dateShort(i.createdAt)}</Td>
                    <Td>
                      {/* {i.status === "PENDING" && (
                        <Button size="sm" onClick={() => openPayModal(i)}>
                          Pay
                        </Button>
                      )} */}
                      {i.status === "EXECUTED" &&
                        i.receiver === user?.partyId && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleConfirmReceipt(i.contractId)}
                          >
                            Confirm Receipt
                          </Button>
                        )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Sticky totals */}
      <div className="sticky bottom-4 flex flex-wrap gap-4 bg-ink-800 border border-ink-500 rounded-xl shadow-sm px-6 py-3">
        <span className="text-sm text-bone-300">
          Total due:{" "}
          <strong className="text-red-400">{fmt.currency(totalToPay)}</strong>
        </span>
        <span className="text-sm text-bone-300">
          Total incoming:{" "}
          <strong className="text-emerald-400">
            {fmt.currency(totalToReceive)}
          </strong>
        </span>
      </div>

      {/* Execute payment modal */}
      <Modal
        open={!!modalInstruction}
        onClose={() => setModalInstruction(null)}
        title="Confirm Payment"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalInstruction(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmPay} loading={confirming}>
              Confirm & Pay
            </Button>
          </>
        }
      >
        {modalLoading ? (
          <PageLoader />
        ) : (
          modalInstruction && (
            <div className="space-y-4">
              <p className="text-sm text-bone-300">
                You are paying{" "}
                <strong>
                  {fmt.currency(
                    modalInstruction.amount,
                    modalInstruction.currency,
                  )}
                </strong>{" "}
                to{" "}
                <strong>
                  {modalInstruction.receiverName ?? modalInstruction.receiver}
                </strong>
              </p>
              <p className="text-xs text-bone-500">
                Cycle: {modalInstruction.cycleId}
              </p>

              <div className="bg-ink-700 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-bone-500">Current balance</span>
                  <span className="font-medium text-bone-100">
                    {balance
                      ? fmt.currency(balance.balance, balance.currency)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-bone-500">Balance after</span>
                  <span className="font-medium text-bone-100">
                    {balanceAfter !== null ? fmt.currency(balanceAfter) : "—"}
                  </span>
                </div>
              </div>

              {isLow && (
                <Alert type="warning">
                  ⚠️ Your balance after this payment will be below{" "}
                  {fmt.currency(LOW_BALANCE_THRESHOLD)}.
                </Alert>
              )}
              {error && <Alert type="error">{error}</Alert>}
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
