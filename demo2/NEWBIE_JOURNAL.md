# Newbie Developer Journal: AAStar Gasless Demo

This document records the step-by-step journey of a "newbie" developer building a gasless demo using the AAStar SDK.

## Step 1: Browse Official Documentation
**Date**: 2026-01-19
**Action**: Reading `docs.aastar.io` (mapped to `aastar-sdk/docs`).

### Observations:
- **Core Concept**: SuperPaymaster allows credit-based gasless transactions where an operator sponsors the gas.
- **Client Model**: The SDK uses a "Role-Based" approach (`EndUserClient`, `CommunityClient`, `OperatorClient`, etc.).
- **Gasless Mechanism**: `SuperPaymasterClient.submitGaslessTransaction` seems to be the one-liner helper I need.
- **Environment**: Sepolia is the primary testnet for this demo.
- **Hurdles**: The `config.sepolia.json` in the SDK root is the source of truth for contract addresses. I need to make sure my demo loads these correctly.

### Improvement Suggestions:
- Ensure the `SuperPaymasterClient` documentation explicitly mentions the dependency on a funded `operator` credit line.
- A "Getting Started" guide specifically for `aastar-sdk-demo` would be helpful.

---

## Step 2: Environment Setup
**Date**: 2026-01-19
**Action**: Ran `pnpm install`. Verified dependency links to local `@aastar/sdk` and `@aastar/core`.

### Observations:
- **Link Success**: The `package.json` uses `link:../aastar-sdk/...` which is great for local development. It avoids the need for npm registry during testing.
- **Dependency Issues**: None encountered. The environment is clean.

---

## Step 4.2: Obstacle - Faucet Staking Failure
**Date**: 2026-01-19
**Action**: Debugging `Contract call failed: prepareTestAccount` at Staking Approval.

### Observations:
- **Hurdle**: The faucet failed when trying to approve the Staking contract. 
- **Root Cause**: The `SepoliaFaucetAPI` relies on `registry.GTOKEN_STAKING()` to find the staking address. If the Registry contract on-chain doesn't have the `GTOKEN_STAKING` address set, or if the SDK doesn't have the right address in its internal mapping, it fails.
- **Improved Workflow**: I realized I should verify if the `GTOKEN_STAKING` address is correctly set in the Registry before running the faucet.

---

## Step 4.1: Obstacle - Method Not Found
**Date**: 2026-01-19
**Action**: Debugging `userClient.getAccountAddress is not a function`.

### Observations:
- **Hurdle**: I assumed `EndUserClient` would have a `getAccountAddress` method (common in AA SDKs). It seems I was wrong or it's named differently.
- **Newbie Frustration**: When a core method is missing or named unexpectedly, it breaks the "it just works" experience. I need to check the source code to see how to get the AA address for a user.

---

## Step 3 & 4: Logic Implementation (Account & Faucet)
**Date**: 2026-01-19
**Action**: Implementing `gasless_demo.ts`.

### Observations:
- **KeyManager**: Very intuitive API. `generateKeyPair()` worked flawlessly.
- **SepoliaFaucetAPI**: This is a powerhouse. It handles role registration and token minting in one go. 
- **Hurdle**: I initially forgot that I needed to calculate the AA address *before* calling the faucet, so the faucet knows who to fund. `EndUserClient.getAccountAddress()` makes this easy even before deployment.

---

## Step 5.1: Debugging Imports
**Date**: 2026-01-19
**Action**: Fixing `SyntaxError` in `gasless_demo.ts`.

### Observations:
- **Hurdle**: I assumed `createPublicClient` and other `viem` helpers were re-exported by `@aastar/sdk`. They are not. 
- **Solution**: Imported `viem` functions directly from `viem`. 
- **Newbie Note**: The SDK documentation should be clear about what is a native SDK function and what comes from `viem`. As a newbie, I often get confused between the two.

---

## Step 6: UI Visualization

**Date**: 2026-01-19
**Action**: Built a glassmorphism dashboard using vanilla HTML/CSS/JS.

### Observations:
- **Polling vs WebSockets**: For a simple demo, a 2-second polling of `/api/state` is sufficient and easier to implement than WebSockets.
- **Error Feedback**: Making sure errors from the backend are visible in the UI logs is crucial for debugging.
- **Visuals**: Modern UI (gradients, dark mode) makes the technology feel more premium, even if it's "just" a gasless transfer.

---

## Step 7: Architectural Pivot (Two-Service Model)
**Date**: 2026-01-19
**Action**: Split the demo into a Public Faucet Service (Anni-based) and a Demo Interactive Client.

### Observations:
- **Scalability**: By making the faucet a standalone service, multiple demo pages could theoretically use the same funding source.
- **Contract State**: Sourcing paymaster addresses from `l4-state.json` is a great way to ensure we use the "canonical" test instances created during regression setup.
- **Hurdle**: Cross-Origin Resource Sharing (CORS) between Port 3001 (UI) and 3002 (Faucet) must be enabled.

---

## Step 8.1: Obstacle - Token Minting Permissions
**Date**: 2026-01-19
**Action**: Investigating `mintTestTokens` failure for `bPNTs`.

### Observations:
- **Hurdle**: The faucet failed when trying to mint Bob's token (`bPNTs`) using Jason's key. 
- **Reason**: In the AAStar logic, tokens are often owned/managed by their respective operators. Jason's key (Supplier) doesn't have the "Minter" role for Bob's token.
- **Lesson**: A "Public Faucet" in a multi-operator ecosystem needs either a super-admin key or a pool of pre-funded tokens for all supported operators.
- **Fix**: Updated the Faucet Service to gracefully continue if a specific token minting fails, so the user can still get ETH and whatever tokens are available.

### The Final Boss: Oracle Staleness (Jan 19, 2026)
After fixing AA onboarding and getting the ENDUSER role, I still hit `gas required exceeds allowance (0)`. Investigation revealed that the `SuperPaymaster`'s price cache was from **Jan 2025**, making it a year stale! The Entrypoint rejected it because the `validUntil` window was in the past. 

Manually refreshing the price via `updatePriceDVT` as owner finally unblocked the flow. 

**Summary of the "Big Three" Requirements for Gasless:**
1.  **GToken Stake**: AA must have tokens locked for the ENDUSER role.
2.  **Community Registry**: AA must be explicitly onboarded to a community profile.
3.  **Fresh Oracle Price**: The Paymaster must have a valid, recent price cache to set a valid sponsorship window.

**Current Status**: 🏁 END-TO-END SUCCESS ON SEPOLIA!
UI is live at `http://localhost:3001`.

### The Twist: "Execution Reverted" & The Execute Wrapper (Jan 19, 2026)
Just when I thought it was over, the Faucet failed with `execution reverted`.
**Reason**: I was calling `gToken.approve()` and `registry.registerRole()` directly using the EOA. But the **Approver/Registrant needs to be the AA itself**.
**Fix**: I wrapped these calls in `SimpleAccount.execute(dest, value, func)`. 
*   **Wrong**: `gToken.approve(Staking)` (Sender is EOA)
*   **Right**: `AA.execute(gToken, 0, gToken.approve(Staking))` (Sender is AA)

This was the final key to unlocking the L4 onboarding flow.

---

## Step 8: Final Integration (Script Verification)
**Goal**: Run both services and complete the "Generate -> Fund -> Test" flow.
