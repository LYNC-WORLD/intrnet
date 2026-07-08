# NetClear — Frontend

React + TypeScript + Tailwind frontend for NetClear, a multilateral netting platform on Canton.

## Setup

```bash
npm install
cp .env.example .env   # then edit VITE_API_BASE_URL to point at your backend
npm run dev
```

The app runs at `http://localhost:5173` by default.

## Build

```bash
npm run build
npm run preview
```

## Folder structure

```
src/
  components/
    ui/            Reusable UI primitives (Button, Card, Modal, Table, Badge, etc.)
    layout/         Shell (sidebar/topbar) and route guards
  context/          AuthContext (JWT + user state)
  pages/
    company/        Participant-facing pages (Dashboard, Obligations, Cycles, Positions, Settlement, Account)
    operator/        Operator-facing pages (Dashboard, Participants, FX Rates, Obligations Monitor,
                      Cycle Management, Run Cycle Wizard, Positions Overview, Settlement Monitor, Audit Log, Settings)
    Login.tsx, Register.tsx, NotFound.tsx
  services/         api.ts — axios instance + all endpoint wrappers, grouped by resource
  types/             Shared TypeScript interfaces
  utils/             Formatting helpers, status color map, FX conversion helper
  App.tsx            Route definitions + guards
  main.tsx           Entry point
```

## Environment variables

See `.env.example`:

- `VITE_API_BASE_URL` — backend base URL (no trailing slash)
- `VITE_JWT_KEY` — localStorage key used to store the JWT (`nc_token` per the API spec)
- `VITE_APP_NAME` — display name
- `VITE_SETTLEMENT_CURRENCY` — informational, pool settles in USD
- `VITE_LOW_BALANCE_THRESHOLD` — threshold used for the low-balance warning in the payment modal

## Auth

JWT is stored in `localStorage` under the key from `VITE_JWT_KEY`. The axios interceptor in
`src/services/api.ts` attaches it to every request and redirects to `/login?expired=1` on any 401.

## Routing

- `/login`, `/register` — public
- `/dashboard`, `/obligations`, `/cycles`, `/positions`, `/settlement`, `/account` — participant routes, guarded by `RequireAuth`
- `/operator/*` — operator-only routes, guarded by `RequireOperator`
