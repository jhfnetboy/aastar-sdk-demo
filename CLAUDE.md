# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AAStar Launch is an **Account Abstraction (ERC-4337) ecosystem** composed of four sub-projects:

| Sub-project | Purpose |
|-------------|---------|
| `aastar-sdk/` | TypeScript monorepo SDK (pnpm, vitest) — core deliverable |
| `yetanotheraa/` | Full-stack WebAuthn + BLS + ERC-4337 platform (NestJS + Next.js) |
| `contracts/sale/` | Foundry smart contracts for GToken and aPNTs sales |
| `local-dev-demo/` | Integrated demo (recommended for local testing) |

Each sub-project has its own package manager and tooling. See `aastar-sdk/CLAUDE.md` for SDK-specific guidance.

## Common Commands

### AAStar SDK (`aastar-sdk/`)
```bash
pnpm install
pnpm -r build
pnpm -r test                              # vitest unit tests
pnpm exec vitest run packages/core/src/actions/account.test.ts  # single test file
pnpm -r lint
./run_sdk_regression.sh                   # Anvil: deploys contracts + L1-L4 regression
./run_sdk_regression.sh --env sepolia     # against Sepolia testnet
pnpm run test:regression                  # sequential regression scripts 00–05 + BLS
```

### YetAnotherAA (`yetanotheraa/`)
```bash
npm install                               # root workspace install
npm run start:dev -w aastar               # NestJS backend (port 3000)
npm run dev -w aastar-frontend            # Next.js frontend (port 8080)
npm run ci                                # format:check + lint + build + test:ci + audit
docker build -t yaaa:latest . && docker run -p 80:80 yaaa:latest
```

### Sale Contracts (`contracts/sale/`)
```bash
forge build
forge test
forge test --match-contract SaleContract --gas-report
forge script script/DeployAPNTsSaleContract.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY_SUPPLIER \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY
```

### Local Dev Demo (`local-dev-demo/`)
```bash
pnpm install
./faucet.sh   # port 3002 — faucet + paymaster setup
./ui.sh       # port 3001 — demo UI
# Browser: http://localhost:3001
```

## Architecture

### System Layers
```
Frontend (Next.js / Demo UIs)
    ↓
NestJS Backend (yetanotheraa/aastar/) — auth, account, transfer, KMS
    ↓
@aastar/sdk (L3 role clients: EndUser / Operator / Community / Admin)
    ↓
@aastar/core (ABIs, canonical addresses, viem action factories)
    ↓
Smart Contracts on Sepolia / Optimism
  Registry · GToken · Staking · MySBT · SuperPaymaster · xPNTsFactory · aPNTs
  GTokenSaleContract · APNTsSaleContract · EntryPoint (ERC-4337 v0.7)
```

### Canonical Contract Addresses (Sepolia 11155111)
These are the source of truth — do NOT read from `.env` files:
```
Registry:         0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788
GToken:           0x9ceDeC089921652D050819ca5BE53765fc05aa9E
Staking:          0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC
MySBT:            0x677423f5Dad98D19cAE8661c36F094289cb6171a
SuperPaymaster:   0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A
PaymasterFactory: 0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d
xPNTsFactory:     0x6EafdA3477F3eec1F848505e1c06dFB5532395b6
aPNTs:            0xDf669834F04988BcEE0E3B6013B6b867Bd38778d
EntryPoint v0.7:  0x0000000071727De22E5E9d8BAf0edAc6f37da032
```

### SDK L1–L4 Tiers
- **L1** — raw contract wrappers (`packages/core/src/actions/`)
- **L2** — atomic multi-step workflows (`packages/{enduser,operator,community}/src/`)
- **L3** — role-based clients via `createEndUserClient()`, `createOperatorClient()`, etc. (`packages/sdk/src/clients/`)
- **L4** — full lifecycle regression on Anvil/testnets (`tests/regression/`, `scripts/`)

### YetAnotherAA Backend Modules (`yetanotheraa/aastar/src/`)
`auth` · `account` · `transfer` · `kms` · `paymaster` · `registry` · `community` · `operator` · `admin` · `sale`

## Key Conventions

- **ABI source**: Always use exports from `@aastar/core`. ESLint forbids calling `parseAbi()` directly from viem.
- **Package manager**: `aastar-sdk/` uses **pnpm only**. `yetanotheraa/` uses **npm**.
- **Contract addresses**: Canonical source is `@aastar/core` `CANONICAL_ADDRESSES[chainId]`, not `.env` files.
- **SuperPaymaster sibling repo**: `run_sdk_regression.sh` expects a `../SuperPaymaster` directory for Anvil deployments and ABI sync.
- **Pre-commit hook** (`aastar-sdk/.githooks/pre-commit`): scans for leaked keys. Activate with `git config core.hooksPath .githooks`.
- **Paymaster versions**: V4 is active; V3 is maintained for compatibility. Both live in `packages/paymaster/src/`.

## Environment Setup

Create `.env` files (never commit them):
- `aastar-sdk/.env.sepolia` — RPC URLs, private keys, Pimlico API key, KMS key
- `yetanotheraa/aastar/.env` — JWT secret, DB config, chain ID, bundler URL, contract addresses
- `yetanotheraa/aastar-frontend/.env.local` — API base URL

See `aastar-sdk/env.template` for required variable names.

## Rules

1. All code comments in English
2. All conversation responses in Chinese (中文)
