# intrnet

Frontend for intrnet — a multilateral netting platform on the Canton Network. Companies submit obligations to each other, the pool operator nets them into a single settlement instruction per cycle, and everyone pays or receives once instead of settling every invoice individually.

---

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Auth0 + backend values
npm run dev
```

The app runs at `http://localhost:5173`.

### Environment variables

```dotenv
VITE_API_BASE_URL=https://intrnet.lync.world
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=https://canton.network.global
```

| Variable               | Purpose                            |
| ---------------------- | ---------------------------------- |
| `VITE_API_BASE_URL`    | Backend base URL                   |
| `VITE_AUTH0_DOMAIN`    | Auth0 tenant domain                |
| `VITE_AUTH0_CLIENT_ID` | Auth0 application client ID        |
| `VITE_AUTH0_AUDIENCE`  | API identifier configured in Auth0 |

**Auth0 setup checklist:** add your app's URL to all three of Auth0's Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins. Confirm Google sign-in is enabled for the application, and that an API with the matching audience identifier exists on the same tenant.

---

## Folder structure

```
intrnet/
├── .env
├── .env.example
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── README.md
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx                   # Entry point
    ├── App.tsx                    # Routes and guards
    ├── index.css                  # Theme styles
    │
    ├── components/
    │   ├── ui/
    │   │   ├── index.tsx           # Buttons, cards, tables, modals, alerts, etc.
    │   │   ├── CantonMark.tsx       # Brand mark / loading spinner
    │   │   └── PendingApprovalGate.tsx
    │   └── layout/
    │       ├── Shell.tsx            # Sidebar + topbar
    │       └── Guards.tsx           # Route protection
    │
    ├── context/
    │   └── AuthContext.tsx         # Session state
    │
    ├── hooks/
    │   ├── queries.ts              # Data fetching + caching
    │   ├── useAuth0Bridge.ts        # Google sign-in <-> backend session
    │   └── useDebounce.ts
    │
    ├── pages/
    │   ├── Login.tsx
    │   ├── Onboarding.tsx
    │   ├── Callback.tsx
    │   ├── NotFound.tsx
    │   └── company/
    │       ├── Dashboard.tsx
    │       ├── Obligations.tsx
    │       ├── CreateObligation.tsx
    │       ├── ObligationDetail.tsx
    │       ├── Cycles.tsx
    │       ├── CycleDetail.tsx
    │       ├── Positions.tsx
    │       ├── Settlement.tsx
    │       └── Account.tsx
    │
    ├── services/
    │   └── api.ts                  # All backend API calls
    │
    ├── types/
    │   └── index.ts                 # Shared data shapes
    │
    └── utils/
        └── index.ts
```
