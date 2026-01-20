# AAStar Faucet Service

> A standalone Vercel-ready service for AAStar L4 onboarding and funding.
> Based effectively on `@aastar/sdk` logic but exposed as a secure HTTP API.

## 🚀 Deployment (Vercel)

This project is configured for Vercel Serverless Functions (`api/index.js`).
It has been converted to Pure JavaScript (ESM) for maximum stability.

1.  **Import Project**: Import this `faucet` directory as a new project in Vercel.
2.  **Environment Variables**:
    Set the following secrets in Vercel Project Settings:

    | Variable | Description |
    | :--- | :--- |
    | `FAUCET_SECRET` | A password/token to protect the API. |
    | `PRIVATE_KEY_SUPPLIER` | The private key of the admin wallet (must have ETH/GToken/aPNTs). |
## 🛠️ Usage

...

## ⚙️ Configuration

### Environment Variables
Configure these in your Vercel Project Settings or local `.env`:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `FAUCET_SECRET` | 🔒 **Secret Key** to protect the API. | `s3cr3t-k3y-d0-n0t-sh4r3` |
| `PRIVATE_KEY_SUPPLIER` | 🔒 **Admin Wallet Key** (Must have funds). | `0x...` |
| `SEPOLIA_RPC_URL` | RPC Endpoint. | `https://eth-sepolia...` |

> ⚠️ **IMPORTANT**: Never commit `.env` files with real keys to GitHub!

## 🛠️ Tech Stack
*   **Runtime**: Node.js (Vercel Serverless)
*   **SDK**: `@aastar/sdk` (Logic Ported/Inlined)
*   **Blockchain**: Viem (Sepolia)
*   **Security**: `crypto.timingSafeEqual` for constant-time auth checks.

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
