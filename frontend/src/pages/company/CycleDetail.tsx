import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  useCycles,
  usePositions,
  useObligations,
  useSettlementInstructions,
  useAcknowledgePosition,
} from "../../hooks/queries";
import {
  NettingCycle,
  NetPosition,
  Obligation,
  SettlementInstruction,
} from "../../types";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Table,
  Th,
  Td,
  Tr,
  PageLoader,
} from "../../components/ui";
import { fmt } from "../../utils";
import { useAuth } from "@/context/AuthContext";

export default function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const { user } = useAuth();

  const { data: cyclesData, isLoading: loadingCycles } = useCycles();
  const { data: positionsData, isLoading: loadingPositions } = usePositions(
    cycleId ? { cycleId } : undefined,
  );
  const { data: obligationsData, isLoading: loadingObligations } =
    useObligations({ status: "NETTED" });
  const { data: instructionsData, isLoading: loadingInstructions } =
    useSettlementInstructions();
  const ackMutation = useAcknowledgePosition();

  const cycles: NettingCycle[] = cyclesData ?? [];
  const cycle = cycles.find((x) => x.cycleId === cycleId) ?? null;

  const allPositions: NetPosition[] =
    positionsData?.positions ?? positionsData ?? [];
  const position =
    allPositions.find((x) => x.cycleId === cycleId) ?? allPositions[0] ?? null;

  const obligations: Obligation[] =
    obligationsData?.obligations ?? obligationsData ?? [];

  const allInstructions: SettlementInstruction[] =
    instructionsData?.instructions ?? instructionsData ?? [];
  const instructions = allInstructions.filter((x) => x.cycleId === cycleId);

  const handleAck = () => {
    if (!position) return;
    ackMutation.mutate(position.contractId, {
      onSuccess: () => toast.success("Position acknowledged"),
      onError: () => toast.error("Failed to acknowledge"),
    });
  };

  const loading =
    loadingCycles ||
    loadingPositions ||
    loadingObligations ||
    loadingInstructions;

  if (loading) return <PageLoader />;
  if (!cycle)
    return <p className="text-center text-bone-700 py-16">Cycle not found.</p>;

  return (
    <div className="space-y-6">
      <Link
        to="/cycles"
        className="text-sm text-lime-400 hover:text-lime-300 hover:underline"
      >
        ← Back to cycles
      </Link>

      <Card>
        <CardHeader className="border-none">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-bone-100">
                {cycle.cycleId}
              </h1>
              <p className="text-xs text-bone-500">
                Cutoff: {fmt.date(cycle.cutoffTime)} ·{" "}
                {cycle.settlementCurrency}
              </p>
            </div>
            <Badge status={cycle.status} />
          </div>
        </CardHeader>
      </Card>

      {position && (
        <Card>
          <CardBody className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-bone-500 mb-1">Your net position</p>
              <p
                className={`text-2xl font-bold ${position.netAmountSettlement >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                You will {position.netAmountSettlement >= 0 ? "RECEIVE" : "PAY"}{" "}
                {fmt.currency(Math.abs(position.netAmountSettlement))}
              </p>
            </div>
            {position.status === "PENDING" ? (
              <Button onClick={handleAck} loading={ackMutation.isPending}>
                Acknowledge
              </Button>
            ) : (
              <Badge status="ACKNOWLEDGED" />
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-bone-100">My Contributions</h2>
        </CardHeader>
        <CardBody className="p-0">
          {obligations.length === 0 ? (
            <p className="text-sm text-bone-700 px-6 py-8 text-center">
              No obligations in this cycle yet.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice Ref</Th>
                  <Th>Direction</Th>
                  <Th>Counterparty</Th>
                  <Th>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((o) => (
                  <Tr key={o.contractId}>
                    <Td>{o.invoiceRef}</Td>
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
                    <Td>{fmt.currency(o.amount, o.currency)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {instructions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-bone-100">
              Settlement Instructions
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Direction</Th>
                  <Th>Counterparty</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {instructions.map((i) => (
                  <Tr key={i.contractId}>
                    <Td>
                      {user?.partyId === i.payer ? (
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
                      {user?.partyId === i.payer
                        ? i.receiver.split("::")[0]
                        : i.payer.split("::")[0]}
                    </Td>
                    <Td>{fmt.currency(i.amount, i.currency)}</Td>
                    <Td>
                      <Badge status={i.status} />
                    </Td>
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
