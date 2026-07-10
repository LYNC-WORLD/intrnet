import { useState } from "react";
import toast from "react-hot-toast";
import {
  useSettlementInstructions,
  useSettlementBalance,
  useExecuteSettlement,
  useConfirmSettlement,
} from "../../hooks/queries";
import { SettlementInstruction } from "../../types";
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
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [modalInstruction, setModalInstruction] =
    useState<SettlementInstruction | null>(null);

  const { data: instructionsData, isLoading } = useSettlementInstructions();
  const { data: balance } = useSettlementBalance();
  const executeMutation = useExecuteSettlement();
  const confirmMutation = useConfirmSettlement();

  const instructions: SettlementInstruction[] =
    instructionsData?.instructions ?? instructionsData ?? [];

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

  // const openPayModal = (instruction: SettlementInstruction) => setModalInstruction(instruction);

  const handleConfirmPay = () => {
    if (!modalInstruction) return;
    executeMutation.mutate(modalInstruction.contractId, {
      onSuccess: () => {
        toast.success("Payment sent");
        setModalInstruction(null);
      },
      onError: () =>
        toast.error("Payment failed. Please check your balance and try again."),
    });
  };

  const handleConfirmReceipt = (cid: string) => {
    confirmMutation.mutate(cid, {
      onSuccess: () => toast.success("Receipt confirmed"),
      onError: () => toast.error("Failed to confirm"),
    });
  };

  const balanceAfter =
    balance && modalInstruction
      ? balance.available - modalInstruction.amount
      : null;
  const isLow = balanceAfter !== null && balanceAfter < LOW_BALANCE_THRESHOLD;

  if (isLoading) return <PageLoader />;

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
                {filtered.map((i) => {
                  const isConfirming =
                    confirmMutation.isPending &&
                    confirmMutation.variables === i.contractId;
                  return (
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
                      </Td>
                      <Td>
                        <Badge status={i.status} />
                      </Td>
                      <Td>{fmt.dateShort(i.createdAt)}</Td>
                      <Td>
                        {/* {i.status === "PENDING" && (
                          <Button size="sm" onClick={() => openPayModal(i)}>Pay</Button>
                        )} */}
                        {i.status === "EXECUTED" &&
                          i.receiver === user?.partyId && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleConfirmReceipt(i.contractId)}
                              loading={isConfirming}
                            >
                              Confirm Receipt
                            </Button>
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
            <Button
              onClick={handleConfirmPay}
              loading={executeMutation.isPending}
            >
              Confirm & Pay
            </Button>
          </>
        }
      >
        {modalInstruction && (
          <div className="space-y-4">
            <p className="text-sm text-bone-300">
              You are paying{" "}
              <strong>
                {fmt.currency(
                  modalInstruction.amount,
                  modalInstruction.currency,
                )}
              </strong>{" "}
              to <strong>{modalInstruction.receiver.split("::")[0]}</strong>
            </p>
            <p className="text-xs text-bone-500">
              Cycle: {modalInstruction.cycleId}
            </p>

            <div className="bg-ink-700 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-bone-500">Current balance</span>
                <span className="font-medium text-bone-100">
                  {balance
                    ? fmt.currency(balance.available, balance.currency)
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
            {executeMutation.isError && (
              <Alert type="error">
                Payment failed. Please check your balance and try again.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
