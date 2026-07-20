# Intrnet — Multilateral Netting & Settlement on Canton

Intrnet is a multi-company netting and settlement platform on [Canton Network](https://www.canton.network/). Counterparties create obligations, run netting cycles, and settle net positions with CIP-56 settlement tokens from operator custody — with on-ledger privacy and workflow gates.

On **devnet**, settlement uses **tUSD** (a mock USD instrument you register on Utility) and a **faucet** for in-app credits plus TransferPreapproval setup. **Production** would use a real settlement asset (e.g. tokenized USD) and real funding via bank rails or on-chain deposits — not the faucet.

## How It Works

1. **Sign in with Auth0** — Participants and the operator use OAuth; ledger rights are linked to the Auth0 `sub`.
2. **Onboard & join an agreement** — Submit company details; the operator approves, allocates a Canton party, and adds the company to a `NettingAgreement`.
3. **Fund in-app balance** — **Devnet:** claim the faucet (daily mock credit + TransferPreapproval) or sync real tUSD deposits into custody. **Production:** fund only via verified deposits (CIP-56 transfer into operator custody, attributed to your party) or operator manual credit after off-chain settlement.
4. **Create & accept obligations** — Companies raise bilateral invoices; counterparties accept or reject on-ledger.
5. **Run a netting cycle** — Operator starts a cycle, pulls accepted obligations, computes net positions; participants acknowledge.
6. **Settle** — Operator executes CIP-56 custody payouts for payers; receivers confirm (or auto-accept if TransferPreapproval is active). Payers’ in-app balance decreases; receivers receive on-chain holdings.

## Devnet vs production

| | Devnet (current) | Production (intended) |
|---|------------------|------------------------|
| Settlement token | **tUSD** — mock USD on Utility/Canton devnet | Real CIP-56 asset (e.g. regulated tokenized USD), same mechanics |
| Getting spendable balance | **Faucet** (`POST /api/settlement/faucet`) — once/day in-app credit from pre-funded custody pool; also creates **TransferPreapproval** | No faucet. Participants **deposit** tUSD/USD token to operator custody; `POST /api/admin/deposits/sync` credits in-app balance from on-chain holdings + attribution |
| Custody pool | Operator pre-mints / holds a large tUSD balance for demos | Operator custody funded by real participant deposits and treasury policy |


**Actual production flow (funding & settlement):**

1. Participant sends settlement token to **operator custody** on-ledger (or completes off-chain funding per your ops process).
2. Operator runs **deposit sync** — accepts pending TransferInstructions if needed, attributes holdings to depositor party, credits **in-app `available`** once per holding.
3. Obligations → cycle → compute → ack → settle (unchanged on-ledger).
4. **Execute:** reserve payer in-app balance → CIP-56 transfer custody → receiver (direct if preapproved) → attest on `SettlementInstruction` → debit payer bookkeeping.
5. **Confirm:** receiver `ConfirmReceipt` on the instruction.

The faucet and mock tUSD exist so devnet users can run the full cycle without bank integration or manual minting for every party.

## Architecture

```
Canton Ledger (Intrnet Daml + CIP-56 settlement token; tUSD on devnet)
    ↕ JSON Ledger API + Utility Registry
Node Backend (Express + Prisma)
    ├── Auth0 OAuth (participants + operator M2M)
    ├── Obligations / Cycles / Positions / Settlement
    ├── Balance bookkeeping (available / reserved)
    ├── CIP-56 transfer + TransferPreapproval (+ devnet faucet)
    ├── PQS read models (agreements, cycles, instructions)
    └── OpenAPI (/api/docs)
    ↕ REST
React Frontend (Vite + Tailwind)
    ├── Participant: dashboard, obligations, cycles, settlement, account
    └── Operator: companies, cycles, FX, settlement monitor
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Query, Auth0 |
| Backend | Node.js, Express, TypeScript, Prisma, Axios |
| Ledger | Canton JSON Ledger API, Daml 3.5 (`intrnet-contracts`) |
| Settlement | CIP-56 Holding / TransferFactory, Utility Registry, **tUSD (devnet mock USD)** |
| Read models | Participant Query Store (PQS) + PostgreSQL |
| Auth | Auth0 SPA + M2M (ledger admin / operator) |

## Features

- **On-ledger netting** — Obligations, cycles, positions, and settlement instructions are Canton contracts with privacy and choice gates.
- **Multi-agreement** — Companies belong to an `agreementId`; cycles and obligations are scoped per agreement.
- **CIP-56 custody payout** — Settlement execute transfers settlement token from operator custody to receivers via TransferFactory.
- **Devnet faucet** — Daily in-app credit + TransferPreapproval setup (**devnet only**; not used in production).
- **Clean balance model** — In-app `available` rises on deposit/faucet (devnet) only; settlement payers are debited; receivers get on-chain holdings.
- **Operator gates** — Compute → acknowledge → settle / force-settle → close, enforced in Daml and exposed in the API.
- **OpenAPI** — Interactive docs at `/api/docs`.

## Daml Contracts

Package: `intrnet-contracts` (under `intrnet-daml/`). SDK 3.5.x. Operator is signatory on workflow contracts; participants are observers (and controllers on their choices).

| Template | Role |
|----------|------|
| `NettingAgreement` | Multi-party agreement: participants list, `AddParticipant`, `StartNettingCycle` (non-consuming) |
| `Obligation` | Bilateral invoice: create → `Accept` / `Reject`; later marked `NETTED` in a cycle |
| `NettingCycle` | Cycle lifecycle: add obligations, compute positions, settle / force-settle, close |
| `NetPosition` | Per-party net in a cycle; participant `AcknowledgePosition` |
| `SettlementInstruction` | Payer → receiver amount after settle: `AttestPayment` → `ConfirmReceipt` (or `FailPayment`) |
| `FxRateOracle` | Operator FX rates used when converting obligation currencies into settlement currency |

### Cycle gates (on-ledger)

- **OPEN** — accept obligations until compute  
- **COMPUTED** — positions created; participants must ack before normal settle  
- **SETTLING** — settlement instructions active  
- **SettleCycle** — requires acks (and related gates)  
- **ForceSettleCycle** — operator override when ack deadline / policy allows  
- **CloseCycle** — after instructions are terminal  

### Settlement instruction status

`PENDING` → operator attests CIP-56 payout (`EXECUTED`) → receiver `ConfirmReceipt` (`CONFIRMED`), or operator `FailPayment` (`FAILED`).

Contract ids rotate on many choices; APIs return `newContractId`. Cycles can also be addressed by stable `cycleId`.

## Quick Start

### Prerequisites

- Docker (Compose v2)
- Node.js 20+ (frontend local dev)
- PostgreSQL — **two databases**: `intrnet` (Prisma app data) and `pqs` (Participant Query Store projection), reachable from containers (use `host.docker.internal` in `.env` when Postgres runs on the host)
- Canton participant / Ledger JSON API access
- Auth0 tenant (SPA + M2M)
- Deployed Intrnet DAR + CIP-56 tUSD registry access

PQS is not optional for the product UI: obligations, cycles, positions, settlement lists, FX oracle reads, operator dashboard counts, and onboarding auto-approval all query the PQS Postgres (`active()` / `archives()`). Writes still go through the JSON Ledger API, but the app has no ledger read path without PQS. Compose starts **backend** and **pqs** together; Postgres stays external (see `backend/.env.example`).

### Install

```bash
cd backend
cp .env.example .env   # ledger, Auth0, DATABASE_URL, PQS_DATABASE_URL, SETTLEMENT_*, INTRNET_PACKAGE_*, host URLs for Docker

cd ../frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3001 (match backend PORT)
```

### Contracts

```bash
cd intrnet-daml && dpm build --all
# Deploy DAR: contracts/.daml/dist/intrnet-contracts-0.0.5.dar
# Optional: dpm test under intrnet-daml/tests
```

### Run

From `backend/` with `.env` configured (including `PQS_POSTGRES_*` and ledger gRPC for the PQS container):

```bash
cd backend
docker compose build

# First time (or after schema changes)
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend node dist/db/seed.js

docker compose up -d
```

Backend API (default): `http://localhost:3001` · OpenAPI: `http://localhost:3001/api/docs`

Frontend (local Vite):

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` → Auth0 login → onboard (participant) or operate cycles (operator).

**If PQS is not healthy:** list/detail APIs and onboarding stay empty or error until the `pqs` service has synced the ledger into the `pqs` database (operator: `GET /api/admin/pqs/health`). End-to-end netting needs both `backend` and `pqs` up (`docker compose ps`).

## Netting & Settlement Flow

### Obligations
- Participant creates an obligation (payer → receiver, amount, currency, invoice ref).
- Receiver **Accept** or **Reject** on-ledger.
- Accepted obligations can enter an open netting cycle.

### Cycle
1. Operator **StartNettingCycle** (cutoff / ack deadline).
2. **Add obligations** into the cycle.
3. **ComputeNetPositions** + **MarkAsNetted**.
4. Participants **AcknowledgePosition**.
5. Operator **SettleCycle** (or **ForceSettleCycle** when gates allow).
6. Per instruction: **Execute** (reserve → CIP-56 transfer → attest → debit payer) then receiver **Confirm**.
7. **CloseCycle** when settlements are done.

### Balances
| Field | Meaning |
|-------|---------|
| `available` / `reserved` / `total` | In-app custody claim (spend inside Intrnet) |
| `holdingsTotal` | On-chain CIP-56 settlement token (tUSD on devnet) owned by that party |

**Devnet only:** `POST /api/settlement/faucet` — once per UTC day, credits `FAUCET_AMOUNT` in-app and ensures TransferPreapproval (fails if preapproval cannot be created). Production funding uses deposits + deposit sync only.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/oauth/login` | Link Auth0 identity |
| GET | `/api/auth/me` | Profile + `canClaimFaucet` |
| POST | `/api/onboarding/submit` | Participant onboarding |
| GET | `/api/admin/companies` | List companies (paginated) |
| GET | `/api/admin/dashboard` | Operator summary + activity |
| POST | `/api/admin/deposits/sync` | Accept inbound transfers + credit deposits |
| GET | `/api/obligations` | List obligations (`page`, `limit`, filters) |
| POST | `/api/obligations` | Create obligation |
| POST | `/api/obligations/:cid/accept` | Accept obligation |
| POST | `/api/obligations/:cid/reject` | Reject obligation |
| GET | `/api/cycles` | List cycles (paginated) |
| POST | `/api/cycles` | Start cycle (operator) |
| POST | `/api/cycles/:id/add-obligations` | Pull accepted obligations |
| POST | `/api/cycles/:id/compute` | Compute net positions |
| POST | `/api/cycles/:id/settle` | Open settlement phase |
| POST | `/api/positions/:cid/acknowledge` | Ack net position |
| GET | `/api/settlement/balance` | Caller balance + `holdingsTotal` |
| GET | `/api/settlement/balances` | List balances (operator: all) |
| POST | `/api/settlement/faucet` | Daily faucet + TransferPreapproval (**devnet**) |
| POST | `/api/settlement/:cid/execute` | Custody payout + attest (operator) |
| POST | `/api/settlement/:cid/confirm` | Receiver confirm (+ Accept if needed) |
| GET | `/api/fx-rates` | FX oracle rates |

Full surface: OpenAPI at `/api/docs`.

## Repo layout

```
netClear/
├── backend/          Express API, Prisma, CIP-56 settlement
├── frontend/         React participant + operator UI
└── intrnet-daml/     Daml contracts, scripts, tests
```

## License

Built for Canton hackathon by LYNC.
