import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import {
  useParticipants,
  useFxRates,
  useAgreement,
  useCreateObligation,
  useSettlementBalance,
} from "../../hooks/queries";
import { Participant } from "../../types";
import {
  Card,
  CardBody,
  Input,
  Select,
  Textarea,
  Button,
  PageLoader,
  Alert,
} from "../../components/ui";
import { fmt, convertToUSD } from "../../utils";
import { useAuth } from "@/context/AuthContext";

const CURRENCIES = ["EUR", "GBP", "JPY", "CHF", "AUD", "USD"];

export default function CreateObligation() {
  const { user } = useAuth();

  const { data: participantsData, isLoading: loadingParticipants } =
    useParticipants();
  const { data: ratesData, isLoading: loadingRates } = useFxRates();
  const { data: agreementData, isLoading: loadingAgreement } = useAgreement(
    user?.agreementId ?? undefined,
  );
  const { data: balance, isLoading: loadingBalance } = useSettlementBalance();
  const createMutation = useCreateObligation();

  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    receiver: "",
    amount: "",
    currency: "USD",
    invoiceRef: "",
    description: "",
  });

  const allParticipants: Participant[] = participantsData ?? [];
  const participants = allParticipants.filter(
    (p) => p.partyId !== user?.partyId,
  );
  const rates = ratesData ?? [];

  const estimatedUsd =
    form.amount && !isNaN(Number(form.amount))
      ? convertToUSD(Number(form.amount), form.currency, rates)
      : null;

  const exceedsBalance =
    balance != null && estimatedUsd != null && estimatedUsd > balance.total;

  const valid =
    form.receiver &&
    form.amount &&
    Number(form.amount) > 0 &&
    form.invoiceRef &&
    form.description &&
    !exceedsBalance;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    createMutation.mutate(
      {
        receiver: form.receiver,
        amount: Number(form.amount),
        currency: form.currency,
        description: form.description,
        invoiceRef: form.invoiceRef,
        agreementId: agreementData?.agreementId,
      },
      {
        onSuccess: (res) => {
          const receiverName =
            participants.find((p) => p.partyId === form.receiver)
              ?.companyName ?? "receiver";
          setSuccess(res.data?.contractId ?? null);
          toast.success(`Obligation sent to ${receiverName} for acceptance`);
        },
        onError: () => toast.error("Failed to create obligation"),
      },
    );
  };

  const loading =
    loadingParticipants || loadingRates || loadingAgreement || loadingBalance;
  if (loading) return <PageLoader />;

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Check className="h-[40px] w-[40px] mb-4 mx-auto" />
        <h2 className="text-xl font-semibold text-bone-100 mb-2">
          Obligation created
        </h2>
        <p className="text-bone-500 text-sm mb-6">
          It has been sent to the receiver for acceptance.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to={`/obligations/${success}`}>
            <Button variant="secondary">View Detail</Button>
          </Link>
          <Link to="/obligations">
            <Button>Back to Obligations</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-bone-100">
        Create New Obligation
      </h1>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="Receiver"
              options={[
                { value: "", label: "Select company..." },
                ...participants.map((p) => ({
                  value: p.partyId,
                  label: p.companyName,
                })),
              ]}
              value={form.receiver}
              onChange={(e) =>
                setForm((f) => ({ ...f, receiver: e.target.value }))
              }
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                required
                error={exceedsBalance ? "Exceeds available balance" : undefined}
              />
              <Select
                label="Currency"
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value }))
                }
              />
            </div>

            <Input
              label="Invoice reference"
              placeholder="INV-2025-001"
              value={form.invoiceRef}
              onChange={(e) =>
                setForm((f) => ({ ...f, invoiceRef: e.target.value }))
              }
              required
            />

            <Textarea
              label="Description"
              placeholder="Reason for payment..."
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              required
            />

            <div className="bg-ink-700 border border-ink-500 rounded-lg p-3">
              <p className="text-xs text-bone-500 mb-1">Estimated USD value</p>
              <p className="text-lg font-semibold text-bone-100">
                {estimatedUsd !== null ? fmt.currency(estimatedUsd) : "—"}
              </p>
              <p className="text-xs text-bone-700 mt-1">
                Display only · based on latest FX rate
                {balance && (
                  <>
                    {" "}
                    · Available balance:{" "}
                    {fmt.currency(balance.total, balance.currency)}
                  </>
                )}
              </p>
            </div>

            {exceedsBalance && (
              <Alert type="error">
                <strong>Insufficient balance.</strong> This obligation exceeds
                your available balance of{" "}
                {fmt.currency(balance!.total, balance!.currency)}.
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={createMutation.isPending}
              disabled={!valid}
            >
              Create Obligation
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
