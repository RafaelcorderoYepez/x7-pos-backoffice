<p align="center">
  <a href="https://react.dev/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original.svg" width="60" alt="React Logo" />
  </a>
  &nbsp;&nbsp;
  <a href="https://vitejs.dev/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vite/vite-original.svg" width="60" alt="Vite Logo" />
  </a>
  &nbsp;&nbsp;
  <a href="https://www.typescriptlang.org/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg" width="60" alt="TypeScript Logo" />
  </a>
  &nbsp;&nbsp;
  <a href="https://tailwindcss.com/" target="blank">
    <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/tailwindcss/tailwindcss-original.svg" width="60" alt="Tailwind CSS Logo" />
  </a>
</p>

# X7 POS Backoffice

React + Vite + TypeScript + Tailwind CSS frontend for X7 Point of Sale.

## Prerequisites

- Node.js 20+
- Backend API running (default: `http://localhost:3001`)

## Setup

```bash
cd x7-pos-backoffice
npm install
cp .env.example .env
```

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

API calls use the Vite proxy (`/api` → `http://localhost:3001`).

## Demo data

`scripts/seed-demo.mjs` fills the backend with demo data through the API, the same way the
backoffice does. Everything goes into its own company and merchant (**X7 Demo Bistro**, Miami FL),
so it does not touch anyone else's data, and it can be re-run: it only creates what is missing.
The data follows US conventions and is in English: USD, Florida + Miami-Dade sales tax (7%) added
on top of menu prices, 18/20/22% tips, FLSA overtime, Florida minimum wage with tip credit, and
federal withholdings (income tax, Social Security, Medicare).

```bash
node scripts/seed-demo.mjs --dry-run              # show what would be created, write nothing
node scripts/seed-demo.mjs                        # create what is missing
node scripts/seed-demo.mjs --only=kitchen,orders  # only some areas
```

Sign in as `admin@miami.x7demo.dev` / `Demo1234!`; the staff users (e.g. `emily@miami.x7demo.dev`)
use the same password. The API comes from `VITE_API_URL` in `.env`; override it, or the
credentials, with `SEED_API_URL`, `SEED_EMAIL` and `SEED_PASSWORD`. If the admin does not exist,
the script registers the company through the onboarding wizard (plan Professional).

Areas, in run order: `catalog`, `config`, `inventory` (also sets the sales stock location),
`kitchen`, `dining`, `orders` (kitchen tickets), `staff`, `shifts`, `cash`, `customers`,
`reservations`, `delivery`, `online`, `qr`, `sales`, `tips`, `supplies` (raw materials and stock),
`purchasing`, `payables` (supplier invoices, payments, allocations, credit note), `accounting`
(journal entries), `timeentries`, `payroll`, `onlineorders`, `deliveryorders`, `rules` (payroll,
overtime and tip rules), `contracts`, `cashtransactions`, `tipdistribution` (tips, allocations,
settlement, cash tip movement, pool members), `recipes`, `movements` (waste and a transfer),
`tableassignments`, `kdsdevices`, `onlinemenu` (online menu categories and items),
`onlinepayments` (payments and delivery info of online orders), `reservationdetails` (guests and
notes), `orderdetails` (modifiers, sales tax and payments of table orders), `receipts`,
`cashmovements` (shift expense and inflow), `kitchenevents`, `deliverytracking`, `payrolldetails`
(withholdings, bonuses and deductions). Dates are relative to today, so a run on a later day adds
the shifts, time entries, payroll period and tip pool of that day.

Known requirements of the backend:

- The schema must be up to date (`npm run migration:run` in the backend).
- Some areas need backend fixes that are not in `main` yet (branches `fix/*` in the backend):
  the receipt `merchant_id` (`receipts`), the table assignment conflict per shift
  (`tableassignments`), the optional `tableId` for delivery orders (`deliveryorders`) and the
  tip percentage validation (`rules`).
- `cash` needs the admin's collaborator profile (`staff`) and an active work shift (`shifts`).
  On a fresh database run `--only=staff` first, then the full script.
- Suppliers are created without `tax_id`: the backend only accepts a Chilean RUT there, not an
  EIN.

## Routes

| Path | Description |
|------|-------------|
| `/login` | Sign in |
| `/forgot-password` | Request password reset email |
| `/reset-password?token=…` | Set a new password from email link |
| `/` | Placeholder dashboard (requires login) |

## Backend configuration

Set `FRONTEND_URL=http://localhost:5173` in the backend `.env` so password-reset emails link to this app.
