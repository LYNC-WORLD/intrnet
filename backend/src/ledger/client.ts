import axios, { AxiosInstance } from "axios";
import {
  decodeTokenClaims,
  extractPackageId,
  matchesTemplate,
  newCommandId,
  qualifyTemplateId,
  resolvePartyHint,
  templateSuffix,
  toLegacyEvents,
  wildcardEventFormat,
} from "./v2";

export interface CreateCmd {
  templateId: string;
  payload: Record<string, unknown>;
}

export interface ExerciseCmd {
  templateId: string;
  contractId: string;
  choice: string;
  argument: Record<string, unknown>;
}

export interface QueryFilter {
  [key: string]: unknown;
}

export interface LedgerRight {
  kind: {
    CanActAs?: { value: { party: string } };
    CanReadAs?: { value: { party: string } };
  };
}

type V2Event = Record<string, unknown>;

export class LedgerClient {
  private http: AxiosInstance;
  private token: string;
  private claims: ReturnType<typeof decodeTokenClaims>;
  private packageId: string | null = process.env.NETCLEAR_PACKAGE_ID ?? null;
  private partyCache: string[] | null = null;
  private streamTimer: ReturnType<typeof setInterval> | null = null;

  constructor(partyToken: string, baseURL: string = process.env.LEDGER_API_URL!) {
    this.token = partyToken;
    this.claims = decodeTokenClaims(partyToken);
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${partyToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  private async listPartyIds(): Promise<string[]> {
    if (this.partyCache) return this.partyCache;
    const res = await this.http.get("/v2/parties");
    const parties = (res.data.partyDetails ?? res.data.result?.partyDetails ?? []).map(
      (p: { party: string }) => p.party,
    );
    this.partyCache = parties;
    return parties;
  }

  private async resolveParties(parties: string[] = []): Promise<string[]> {
    const known = await this.listPartyIds();
    const source = parties.length ? parties : (this.claims.actAs ?? []);
    return [...new Set(source.map((party) => resolvePartyHint(party, known)))];
  }

  private async resolveReadParties(actAs: string[]): Promise<string[]> {
    const readAs = this.claims.readAs ?? [];
    if (readAs.includes("*")) return actAs;
    const resolved = await this.resolveParties(readAs);
    return [...new Set([...actAs, ...resolved])];
  }

  private async ensurePackageId(): Promise<string> {
    if (this.packageId) return this.packageId;

    const parties = await this.resolveParties();
    const offset = await this.getLedgerEnd();
    const contracts = await this.queryActiveContracts(parties, offset);
    for (const contract of contracts) {
      const templateId = contract.templateId as string;
      const pkg = extractPackageId(templateId);
      if (pkg && matchesTemplate(templateId, "NetClear.NettingAgreement:NettingAgreement")) {
        this.packageId = pkg;
        return pkg;
      }
    }

    for (const contract of contracts) {
      const templateId = contract.templateId as string;
      const pkg = extractPackageId(templateId);
      if (pkg && templateId.includes("NetClear.")) {
        this.packageId = pkg;
        return pkg;
      }
    }

    throw new Error("Could not resolve NetClear package id from ledger (set NETCLEAR_PACKAGE_ID)");
  }

  private async getLedgerEnd(): Promise<number> {
    const res = await this.http.get("/v2/state/ledger-end");
    return res.data.offset as number;
  }

  private async queryActiveContracts(parties: string[], offset: number) {
    const res = await this.http.post("/v2/state/active-contracts", {
      activeAtOffset: offset,
      eventFormat: wildcardEventFormat(parties),
    });

    const contracts: Array<{ contractId: string; templateId: string; payload: Record<string, unknown> }> = [];
    for (const item of res.data as Array<Record<string, unknown>>) {
      const entry = item.contractEntry as Record<string, unknown> | undefined;
      const active = (entry?.JsActiveContract ?? entry?.ActiveContract) as
        | Record<string, unknown>
        | undefined;
      const created = active?.createdEvent as Record<string, unknown> | undefined;
      if (!created) continue;
      contracts.push({
        contractId: created.contractId as string,
        templateId: created.templateId as string,
        payload: (created.createArgument ?? {}) as Record<string, unknown>,
      });
    }
    return contracts;
  }

  private async submitAndWait(commands: Array<Record<string, unknown>>) {
    const actAs = await this.resolveParties();
    if (!actAs.length) throw new Error("No actAs parties available for ledger command");

    const readAs = await this.resolveReadParties(actAs);
    const body = {
      commands: {
        commandId: newCommandId(),
        userId: this.claims.sub,
        actAs,
        readAs,
        commands,
      },
    };

    const res = await this.http.post("/v2/commands/submit-and-wait-for-transaction", body);
    return res.data.transaction as {
      offset: number;
      events: V2Event[];
    };
  }

  async create(cmd: CreateCmd) {
    const packageId = await this.ensurePackageId();
    const transaction = await this.submitAndWait([
      {
        CreateCommand: {
          templateId: qualifyTemplateId(cmd.templateId, packageId),
          createArguments: cmd.payload,
        },
      },
    ]);

    const created = transaction.events.find((event) => event.CreatedEvent)?.CreatedEvent as
      | Record<string, unknown>
      | undefined;
    if (!created) throw new Error(`Create did not return a CreatedEvent for ${cmd.templateId}`);

    return {
      contractId: created.contractId as string,
      payload: (created.createArgument ?? {}) as Record<string, unknown>,
    };
  }

  async exercise(cmd: ExerciseCmd) {
    const packageId = await this.ensurePackageId();
    const transaction = await this.submitAndWait([
      {
        ExerciseCommand: {
          templateId: qualifyTemplateId(cmd.templateId, packageId),
          contractId: cmd.contractId,
          choice: cmd.choice,
          choiceArgument: cmd.argument,
        },
      },
    ]);

    const exercised = transaction.events.find((event) => event.ExercisedEvent)?.ExercisedEvent as
      | Record<string, unknown>
      | undefined;

    return {
      exerciseResult: exercised?.exerciseResult ?? null,
      events: toLegacyEvents(transaction.events),
    };
  }

  async query(templateId: string, filter?: QueryFilter) {
    const parties = await this.resolveReadParties(await this.resolveParties());
    const offset = await this.getLedgerEnd();
    const contracts = await this.queryActiveContracts(parties, offset);
    return contracts
      .filter((contract) => matchesTemplate(contract.templateId, templateId))
      .filter((contract) => {
        if (!filter) return true;
        return Object.entries(filter).every(([key, value]) => contract.payload[key] === value);
      })
      .map((contract) => ({
        contractId: contract.contractId,
        payload: contract.payload,
      }));
  }

  async fetchById(contractId: string) {
    const parties = await this.resolveReadParties(await this.resolveParties());
    const res = await this.http.post("/v2/events/events-by-contract-id", {
      contractId,
      eventFormat: wildcardEventFormat(parties),
    });

    const created = res.data.created?.createdEvent as Record<string, unknown> | undefined;
    if (!created) return null;

    return {
      contractId: created.contractId as string,
      payload: (created.createArgument ?? {}) as Record<string, unknown>,
    };
  }

  async allocateParty(partyIdHint: string) {
    const parties = await this.listParties();
    const existing = parties.find(
      (p) => p.party === partyIdHint || p.party.startsWith(`${partyIdHint}::`),
    );
    if (existing) return { partyId: existing.party };

    const res = await this.http.post("/v2/parties", {
      partyIdHint,
      identityProviderId: "",
      localMetadata: null,
    });
    const details = res.data.partyDetails ?? res.data;
    this.partyCache = null;
    return { partyId: details.party as string };
  }

  async listParties() {
    const res = await this.http.get("/v2/parties");
    return (res.data.partyDetails ?? res.data.result?.partyDetails ?? []) as Array<{
      party: string;
      isLocal: boolean;
    }>;
  }

  async userExists(userId: string): Promise<boolean> {
    try {
      await this.http.get(`/v2/users/${encodeURIComponent(userId)}`);
      return true;
    } catch (err: any) {
      if (err?.response?.status === 404) return false;
      throw err;
    }
  }

  async createUser(userId: string, rights: LedgerRight[], primaryParty = "") {
    if (await this.userExists(userId)) {
      await this.grantRights(userId, rights);
      return;
    }

    await this.http.post("/v2/users", {
      user: {
        id: userId,
        identityProviderId: "",
        isDeactivated: false,
        metadata: null,
        primaryParty,
      },
      rights,
    });
  }

  async grantRights(userId: string, rights: LedgerRight[]) {
    await this.http.post(`/v2/users/${encodeURIComponent(userId)}/rights`, {
      userId,
      rights,
    });
  }

  async stream(
    templateIds: string[],
    onData: (events: unknown[]) => Promise<void>,
    onError?: (err: Error) => void,
  ) {
    let lastOffset = 0;
    const suffixes = templateIds.map(templateSuffix);

    const poll = async () => {
      try {
        const parties = await this.resolveReadParties(await this.resolveParties());
        const res = await this.http.post("/v2/updates", {
          beginExclusive: lastOffset,
          updateFormat: {
            includeTransactions: {
              eventFormat: {
                ...wildcardEventFormat(parties),
                verbose: false,
              },
              transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
            },
          },
        });

        const legacyEvents: unknown[] = [];
        let maxOffset = lastOffset;

        for (const item of res.data as Array<Record<string, unknown>>) {
          const update = item.update as Record<string, unknown> | undefined;
          const transaction = update?.Transaction as { value?: { offset?: number; events?: V2Event[] } } | undefined;
          const tx = transaction?.value;
          if (!tx?.events?.length) continue;

          maxOffset = Math.max(maxOffset, tx.offset ?? lastOffset);
          for (const legacy of toLegacyEvents(tx.events)) {
            const templateId =
              (legacy as { created?: { templateId: string } }).created?.templateId ??
              (legacy as { archived?: { templateId: string } }).archived?.templateId;
            if (!templateId) continue;
            if (suffixes.some((suffix) => matchesTemplate(templateId, suffix))) {
              legacyEvents.push(legacy);
            }
          }
        }

        lastOffset = Math.max(lastOffset, maxOffset);
        if (legacyEvents.length) await onData(legacyEvents);
      } catch (err) {
        onError?.(err as Error);
      }
    };

    await poll();
    this.streamTimer = setInterval(poll, 2000);

    return {
      close: () => {
        if (this.streamTimer) clearInterval(this.streamTimer);
        this.streamTimer = null;
      },
    };
  }
}

export const operatorClient = () => new LedgerClient(process.env.OPERATOR_JWT!);
export const partyClient = (token: string) => new LedgerClient(token);
export const operatorAdminClient = () =>
  new LedgerClient(process.env.OPERATOR_ADMIN_JWT ?? process.env.OPERATOR_JWT!);
