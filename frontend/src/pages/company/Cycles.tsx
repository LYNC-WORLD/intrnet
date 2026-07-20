import { useState } from "react";
import { Link } from "react-router-dom";
import { useCycles, usePositions } from "../../hooks/queries";
import { NettingCycle, NetPosition } from "../../types";
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
  Alert,
} from "../../components/ui";
import { fmt } from "../../utils";

const LIMIT = 10;

export default function Cycles() {
  const [page, setPage] = useState(1);

  const { data: cyclesData, isLoading: loadingCycles } = useCycles({
    page,
    limit: LIMIT,
  });
  const { data: positionsData, isLoading: loadingPositions } = usePositions();

  const cycles: NettingCycle[] = (cyclesData?.cycles ?? [])
    .slice()
    .sort(
      (a: NettingCycle, b: NettingCycle) =>
        new Date(b.cutoffTime).getTime() - new Date(a.cutoffTime).getTime(),
    );
  const total: number = cyclesData?.total ?? cycles.length;

  const allPositions: NetPosition[] = Array.isArray(positionsData)
    ? positionsData
    : (positionsData?.positions ?? []);

  const positions: Record<string, NetPosition> = {};
  allPositions.forEach((pos) => {
    positions[pos.cycleId] = pos;
  });

  const openCycle = cycles.find((c) => c.status === "OPEN");

  if (loadingCycles || loadingPositions) return <PageLoader />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-bone-100">Netting Cycles</h1>

      {openCycle && (
        <Alert type="info">
          🔄 Cycle <strong>{openCycle.cycleId}</strong> closes at{" "}
          {fmt.date(openCycle.cutoffTime)}.
        </Alert>
      )}

      <Card>
        <CardBody className="p-0">
          {cycles.length === 0 ? (
            <EmptyState message="No netting cycles yet" icon="🔄" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cycle ID</Th>
                  <Th>Period</Th>
                  <Th>Status</Th>
                  <Th>Settlement Currency</Th>
                  <Th>My Net Position</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => {
                  const pos = positions[c.cycleId];
                  return (
                    <Tr key={c.cycleId}>
                      <Td className="font-medium">{c.cycleId}</Td>
                      <Td>
                        {fmt.dateShort(c.createdAt)} –{" "}
                        {fmt.dateShort(c.cutoffTime)}
                      </Td>
                      <Td>
                        <Badge status={c.status} />
                      </Td>
                      <Td>{c.settlementCurrency}</Td>
                      <Td>
                        {pos ? (
                          <span
                            className={
                              pos.netAmountSettlement >= 0
                                ? "text-emerald-400 font-medium"
                                : "text-red-400 font-medium"
                            }
                          >
                            {pos.netAmountSettlement >= 0 ? "+" : ""}
                            {fmt.currency(pos.netAmountSettlement)}
                          </span>
                        ) : (
                          <span className="text-bone-700">—</span>
                        )}
                        {pos?.status === "PENDING" && (
                          <span className="ml-2 text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">
                            Acknowledge
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Link to={`/cycles/${c.cycleId}`}>
                          <Button size="sm" variant="secondary">
                            View
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {total > LIMIT && (
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
            Page {page} of {Math.ceil(total / LIMIT)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= Math.ceil(total / LIMIT)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
