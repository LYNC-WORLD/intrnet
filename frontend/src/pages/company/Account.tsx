import {
  useMe,
  useSettlementInstructions,
  useFxRates,
  useSettlementBalance,
} from "../../hooks/queries";
import { SettlementInstruction, FxRate } from "../../types";
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Th,
  Td,
  Tr,
  PageLoader,
  EmptyState,
} from "../../components/ui";
import { fmt } from "../../utils";

export default function Account() {
  const { data: profile, isLoading: loadingMe } = useMe();
  const { data: account, isLoading: loadingBalance } = useSettlementBalance();

  const { data: historyData, isLoading: loadingHistory } =
    useSettlementInstructions({ status: "CONFIRMED" });
  const { data: ratesData, isLoading: loadingRates } = useFxRates();

  const history: SettlementInstruction[] =
    historyData?.instructions ?? historyData ?? [];
  const rates: FxRate[] = ratesData ?? [];

  const loading = loadingMe || loadingBalance || loadingHistory || loadingRates;

  if (loading) return <PageLoader />;

  const txRows = history.map((h) => {
    const isCredit = h.receiver === profile?.partyId;
    return { ...h, isCredit };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-bone-100">Account & Balance</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-bone-100">Company Info</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <Row label="Company name" value={profile?.companyName ?? "—"} />
            <Row
              label="Canton party ID"
              value={profile?.partyId ?? "—"}
              mono
              copyable
            />
            <Row
              label="Agreement ID"
              value={profile?.agreementId ?? "—"}
              mono
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-bone-100">Cash Balance</h2>
          </CardHeader>
          <CardBody>
            <p className="text-3xl font-bold text-bone-100">
              {account ? fmt.currency(account.total, account.currency) : "—"}
            </p>
            <p className="text-xs text-bone-700 mt-1">
              On-ledger settlement account
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-bone-100">Transaction History</h2>
        </CardHeader>
        <CardBody className="p-0">
          {txRows.length === 0 ? (
            <EmptyState message="No settled transactions yet" icon="🏦" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Amount</Th>
                  <Th>Counterparty</Th>
                  <Th>Cycle</Th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((t) => (
                  <Tr key={t.contractId}>
                    <Td>{fmt.dateShort(t.confirmedAt ?? t.createdAt)}</Td>
                    <Td
                      className={
                        t.isCredit ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {t.isCredit ? "Credit" : "Debit"}
                    </Td>
                    <Td>
                      <span
                        className={
                          t.isCredit ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {t.isCredit ? "+" : "-"}
                        {fmt.currency(t.amount, t.currency)}
                      </span>
                    </Td>
                    <Td>
                      {t.isCredit
                        ? t.payer.split("::")[0]
                        : t.receiver.split("::")[0]}
                    </Td>
                    <Td>{t.cycleId}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-bone-100">
              Supported Currencies
            </h2>
          </CardHeader>
          <CardBody>
            <div className="flex gap-2 flex-wrap">
              {["USD", "EUR", "GBP", "JPY", "CHF", "AUD"].map((c) => (
                <span
                  key={c}
                  className="px-3 py-1 bg-ink-600 rounded-full text-sm font-medium text-bone-300"
                >
                  {c}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-bone-100">Current FX Rates</h2>
          </CardHeader>
          <CardBody className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Pair</Th>
                  <Th>Rate</Th>
                </tr>
              </thead>
              <tbody>
                {rates.slice(0, 5).map((r) => (
                  <Tr key={r.contractId}>
                    <Td>
                      {r.fromCurrency}/{r.toCurrency}
                    </Td>
                    <Td>{r.rate.toFixed(4)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-bone-500">{label}</span>
      <span
        className={`text-sm text-bone-100 ${mono ? "font-mono" : "font-medium"} truncate max-w-[180px]`}
      >
        {value}
        {copyable && value !== "—" && (
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="ml-2 text-bone-700 hover:text-lime-400"
          >
            ⧉
          </button>
        )}
      </span>
    </div>
  );
}
