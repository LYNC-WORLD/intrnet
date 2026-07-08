import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { positionsApi } from "../../services/api";
import { NetPosition } from "../../types";
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
  KpiCard,
} from "../../components/ui";
import { fmt } from "../../utils";

export default function Positions() {
  const [positions, setPositions] = useState<NetPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackingId, setAckingId] = useState<string | null>(null);

  useEffect(() => {
    positionsApi
      .list()
      .then((res) => setPositions(res.data?.positions ?? res.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const handleAck = async (cid: string) => {
    setAckingId(cid);
    try {
      await positionsApi.acknowledge(cid);
      setPositions((p) =>
        p.map((x) =>
          x.contractId === cid ? { ...x, status: "ACKNOWLEDGED" } : x,
        ),
      );
      toast.success("Position acknowledged");
    } catch {
      toast.error("Failed to acknowledge");
    } finally {
      setAckingId(null);
    }
  };

  const totalReceive = positions
    .filter((p) => p.netAmountSettlement > 0 && p.status === "PENDING")
    .reduce((s, p) => s + p.netAmountSettlement, 0);
  const totalPay = positions
    .filter((p) => p.netAmountSettlement < 0 && p.status === "PENDING")
    .reduce((s, p) => s + Math.abs(p.netAmountSettlement), 0);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-bone-100">Net Positions</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label="Total Pending to Receive"
          value={fmt.currency(totalReceive)}
          color="text-emerald-400"
        />
        <KpiCard
          label="Total Pending to Pay"
          value={fmt.currency(totalPay)}
          color="text-red-400"
        />
      </div>

      <Card>
        <CardBody className="p-0">
          {positions.length === 0 ? (
            <EmptyState
              message="No positions yet. Positions are created when the operator runs a netting cycle."
              icon="⚖️"
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cycle ID</Th>
                  <Th>Net Amount</Th>
                  <Th>Currency</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <Tr key={p.contractId}>
                    <Td className="font-medium">{p.cycleId}</Td>
                    <Td>
                      <span
                        className={
                          p.netAmountSettlement >= 0
                            ? "text-emerald-400 font-medium"
                            : "text-red-400 font-medium"
                        }
                      >
                        {p.netAmountSettlement >= 0 ? "+" : ""}
                        {fmt.currency(p.netAmountSettlement)}
                      </span>
                    </Td>
                    <Td>{p.currency || p.settlementCurrency}</Td>
                    <Td>
                      <Badge status={p.status} />
                    </Td>
                    <Td>
                      {p.status === "PENDING" ? (
                        <Button
                          size="sm"
                          onClick={() => handleAck(p.contractId)}
                          loading={ackingId === p.contractId}
                        >
                          Acknowledge
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled>
                          Acknowledged
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
    </div>
  );
}
