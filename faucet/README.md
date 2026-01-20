# AAStar Faucet Service

> A standalone Vercel-ready service for AAStar L4 onboarding and funding.
> Based effectively on `@aastar/sdk` logic but exposed as a secure HTTP API.

## 🚀 Deployment (Vercel)

This project is configured for Vercel Serverless Functions (`api/index.ts`).

1.  **Import Project**: Import this `faucet` directory as a new project in Vercel.
2.  **Environment Variables**:
    Set the following secrets in Vercel Project Settings:

    | Variable | Description |
    | :--- | :--- |
    | `FAUCET_SECRET` | A password/token to protect the API. |
    | `PRIVATE_KEY_SUPPLIER` | The private key of the admin wallet (must have ETH/GToken/aPNTs). |
    | `SEPOLIA_RPC_URL` | RPC Endpoint for Sepolia. |

3.  **Config**: Ensure `config.sepolia.json` is deployed (included in repo).

## 🛠️ Usage

### API Endpoint

**POST** `/faucet`

**Headers**:
- `Content-Type: application/json`
- `Authorization: Bearer <Your-FAUCET_SECRET>`

**Body**:
```json
{
  "target": "0xYourAAAddress",
  "ownerKey": "0xYourOwnerPrivateKey"
}
```

### Response

```json
{
  "success": true,
  "results": [
    { "name": "AA ETH Funding", "status": "success", "tx": "0x..." },
    ...
  ]
}
```

## 💻 Local Development

1.  Copy `.env` from `.env.example` or root.
2.  Run:
    ```bash
    pnpm install
    # Start server on port 3002
    pnpm start
    ```
