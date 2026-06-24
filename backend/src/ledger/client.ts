import axios, { AxiosError, AxiosInstance } from "axios";
import {
  decodeTokenClaims,
  extractPackageId,
  matchesTemplate,
  newCommandId,
  qualifyTemplateId,
  templateSuffix,
  toLegacyEvents,
  wildcardEventFormat,
} from "./v2";
import { withProxyHostHeader } from "../http/proxyHeaders";
import { clearOperatorLedgerTokenCache, getOperatorLedgerToken } from "./tokenProvider";
import { cachePartyByHint, getCachedPartyByHint } from "./partyHintCache";

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

export function partyActReadRights(partyId: string): LedgerRight[] {
  return [
    { kind: { CanActAs: { value: { party: partyId } } } },
    { kind: { CanReadAs: { value: { party: partyId } } } },
  ];
}

type V2Event = Record<string, unknown>;
type TokenResolver = () => Promise<string>;

export class LedgerClient {
  private http: AxiosInstance;
  private token: string | null;
  private tokenResolver: TokenResolver | null;
  private claims: ReturnType<typeof decodeTokenClaims>;
  private packageId: string | null = process.env.INTRNET_PACKAGE_ID ?? null;
  private partyCache: string[] | null = null;
  private streamTimer: ReturnType<typeof setInterval> | null = null;

  constructor(auth: string | TokenResolver, baseURL: string = process.env.LEDGER_API_URL!) {
    this.token = typeof auth === "string" ? auth : null;
    this.tokenResolver = typeof auth === "function" ? auth : null;
    this.claims = decodeTokenClaims(this.token ?? "");
    const defaultTimeout = Number(process.env.LEDGER_HTTP_TIMEOUT_MS ?? 120000);
    this.http = axios.create({
      baseURL,
      headers: withProxyHostHeader({
        "Content-Type": "application/json",
      }),
      timeout: Number.isFinite(defaultTimeout) ? defaultTimeout : 120000,
    });

    this.http.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      if (token) {
        this.setToken(token);
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  private setToken(token: string) {
    this.token = token;
    this.claims = decodeTokenClaims(token);
  }

  private async getToken() {
    if (this.tokenResolver) return this.tokenResolver();
    return this.token;
  }

  private async withAuthRetry<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 401 && this.tokenResolver) {
        clearOperatorLedgerTokenCache();
        return fn();
      }
      throw err;
    }
  }

  private commandUserId(): string {
    return (
      process.env.LEDGER_API_ADMIN_USER?.trim() ||
      process.env.OPERATOR_LEDGER_USER_ID?.trim() ||
      this.claims.sub ||
      ""
    );
  }

  private async resolveParties(parties: string[] = []): Promise<string[]> {
    let source = parties.length ? parties : (this.claims.actAs ?? []);
    // OAuth client-credentials tokens (validator devnet) carry no actAs claims.
    if (!source.length) {
      const hint = process.env.OPERATOR_PARTY?.trim();
      if (hint) source = [hint];
    }

    const resolved: string[] = [];
    for (const party of source) {
      if (party.includes("::")) {
        resolved.push(party);
        continue;
      }
      const found = await this.findPartyByHint(party);
      resolved.push(found ?? party);
    }

    const unique = [...new Set(resolved)];
    if (!unique.length) {
      throw new Error(
        "No actAs parties available (set OPERATOR_PARTY or use a token with actAs claims)",
      );
    }
    return unique;
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
      if (pkg && matchesTemplate(templateId, "Intrnet.NettingAgreement:NettingAgreement")) {
        this.packageId = pkg;
        return pkg;
      }
    }

    for (const contract of contracts) {
      const templateId = contract.templateId as string;
      const pkg = extractPackageId(templateId);
      if (pkg && templateId.includes("Intrnet.")) {
        this.packageId = pkg;
        return pkg;
      }
    }

    throw new Error("Could not resolve Intrnet package id from ledger (set INTRNET_PACKAGE_ID)");
  }

  private async getLedgerEnd(): Promise<number> {
    const res = await this.withAuthRetry(() => this.http.get("/v2/state/ledger-end"));
    return res.data.offset as number;
  }

  private async queryActiveContracts(parties: string[], offset: number) {
    const res = await this.withAuthRetry(() => this.http.post("/v2/state/active-contracts", {
      activeAtOffset: offset,
      eventFormat: wildcardEventFormat(parties),
    }));

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
        userId: this.commandUserId(),
        actAs,
        readAs,
        commands,
      },
    };

    const res = await this.withAuthRetry(() =>
      this.http.post("/v2/commands/submit-and-wait-for-transaction", body),
    );
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
    const res = await this.withAuthRetry(() => this.http.post("/v2/events/events-by-contract-id", {
      contractId,
      eventFormat: wildcardEventFormat(parties),
    }));

    const created = res.data.created?.createdEvent as Record<string, unknown> | undefined;
    if (!created) return null;

    return {
      contractId: created.contractId as string,
      payload: (created.createArgument ?? {}) as Record<string, unknown>,
    };
  }

  async allocateParty(partyIdHint: string) {
    const existing = await this.findPartyByHint(partyIdHint);
    if (existing) return { partyId: existing };

    try {
      const res = await this.withAuthRetry(() => this.http.post("/v2/parties", {
        partyIdHint,
        identityProviderId: process.env.IDENTITY_PROVIDER_ID ?? "",
        localMetadata: null,
      }));
      const details = res.data.partyDetails ?? res.data;
      this.partyCache = null;
      const partyId = details.party as string;
      cachePartyByHint(partyIdHint, partyId);
      return { partyId };
    } catch (err) {
      const axiosErr = err as AxiosError<{ cause?: string }>;
      const cause = axiosErr.response?.data?.cause ?? "";
      if (axiosErr.response?.status === 400 && cause.includes("already")) {
        const found = await this.findPartyByHint(partyIdHint);
        if (found) return { partyId: found };
      }
      throw err;
    }
  }

  async listParties() {
    const res = await this.withAuthRetry(() => this.http.get("/v2/parties"));
    return (res.data.partyDetails ?? res.data.result?.partyDetails ?? []) as Array<{
      party: string;
      isLocal: boolean;
    }>;
  }

  async findPartyByHint(hint: string): Promise<string | null> {
    if (hint.includes("::")) return hint;

    const cached = getCachedPartyByHint(hint);
    if (cached) return cached;

    let pageToken: string | undefined;
    let fallback: string | null = null;

    do {
      const path = pageToken
        ? `/v2/parties?pageToken=${encodeURIComponent(pageToken)}`
        : "/v2/parties";
      const res = await this.withAuthRetry(() => this.http.get(path));
      const details = (res.data.partyDetails ?? res.data.result?.partyDetails ?? []) as Array<{
        party: string;
        isLocal: boolean;
      }>;

      for (const entry of details) {
        if (entry.party !== hint && !entry.party.startsWith(`${hint}::`)) continue;
        if (entry.isLocal) {
          cachePartyByHint(hint, entry.party);
          return entry.party;
        }
        if (!fallback) fallback = entry.party;
      }

      pageToken = res.data.nextPageToken as string | undefined;
    } while (pageToken);

    if (fallback) cachePartyByHint(hint, fallback);
    return fallback;
  }

  async userExists(userId: string): Promise<boolean> {
    try {
      await this.withAuthRetry(() => this.http.get(`/v2/users/${encodeURIComponent(userId)}`));
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

    await this.withAuthRetry(() => this.http.post("/v2/users", {
      user: {
        id: userId,
        identityProviderId: process.env.IDENTITY_PROVIDER_ID ?? "",
        isDeactivated: false,
        metadata: null,
        primaryParty,
      },
      rights,
    }));
  }

  async grantRights(userId: string, rights: LedgerRight[]) {
    await this.withAuthRetry(() => this.http.post(`/v2/users/${encodeURIComponent(userId)}/rights`, {
      userId,
      rights,
    }));
  }

  async stream(
    templateIds: string[],
    onData: (events: unknown[]) => Promise<void>,
    onError?: (err: Error) => void,
  ) {
    let lastOffset: number | null = null;
    let disabled = false;
    const suffixes = templateIds.map(templateSuffix);
    const streamParties = await this.resolveReadParties(await this.resolveParties());
    const updatesTimeoutMs = Number(process.env.LEDGER_UPDATES_TIMEOUT_MS ?? 120000);

    const poll = async () => {
      if (disabled) return;
      try {
        if (lastOffset === null) {
          // Shared devnet ledgers are huge — never replay from offset 0 (nginx returns 413).
          lastOffset = await this.getLedgerEnd();
        }

        const eventFormat = {
          ...wildcardEventFormat(streamParties),
          verbose: false,
        };

        const res = await this.withAuthRetry(() =>
          this.http.post(
            "/v2/updates",
            {
              beginExclusive: lastOffset,
              updateFormat: {
                includeTransactions: {
                  eventFormat,
                  transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
                },
              },
            },
            { timeout: Number.isFinite(updatesTimeoutMs) ? updatesTimeoutMs : 120000 },
          ),
        );

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
        const axiosErr = err as AxiosError;
        const status = axiosErr?.response?.status;
        if (status === 403) {
          disabled = true;
          if (this.streamTimer) clearInterval(this.streamTimer);
          this.streamTimer = null;
          onError?.(
            new Error(
              "Ledger /v2/updates returned 403. Grant CanReadAs for the operator party on the ledger admin user.",
            ),
          );
          return;
        }
        if (status === 413) {
          lastOffset = await this.getLedgerEnd();
          onError?.(
            new Error("Ledger /v2/updates returned 413 (payload too large); resumed from current ledger end."),
          );
          return;
        }
        if (axiosErr.code === "ECONNABORTED") return;
        onError?.(err as Error);
      }
    };

    await poll();
    if (!disabled) {
      this.streamTimer = setInterval(poll, 2000);
    }

    return {
      close: () => {
        if (this.streamTimer) clearInterval(this.streamTimer);
        this.streamTimer = null;
      },
    };
  }
}

export const partyClient = (token: string) => new LedgerClient(token);
export const operatorAdminClient = async () => new LedgerClient(getOperatorLedgerToken);
export const operatorClient = async () => new LedgerClient(getOperatorLedgerToken);
