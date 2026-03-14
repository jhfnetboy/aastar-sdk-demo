# AAStar 管理界面开发里程碑计划

> 版本：v1.0 | 更新：2026-03-14
> 基于：plan-v3.1 + aastar-sdk L4 setup 分析 + .env.sepolia 配置确认

---

## 环境基准说明

**开发环境**：`@aastar/core` canonical 地址（AAStar 社区规范部署）+ `.env.sepolia` 提供 deployer 私钥

```
合约地址（@aastar/core CANONICAL_ADDRESSES[11155111]，优先使用）：
  registry:         0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788
  gToken:           0x9ceDeC089921652D050819ca5BE53765fc05aa9E
  staking:          0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC
  sbt:              0x677423f5Dad98D19cAE8661c36F094289cb6171a
  superPaymaster:   0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A
  paymasterFactory: 0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d
  xPNTsFactory:     0x6EafdA3477F3eec1F848505e1c06dFB5532395b6
  aPNTs:            0xDf669834F04988BcEE0E3B6013B6b867Bd38778d
  priceFeed:        0x694AA1769357215DE4FAC081bf1f309aDC325306  (ETH/USD)
  entryPoint:       0x0000000071727De22E5E9d8BAf0edAc6f37da032

.env.sepolia 用途（仅部署销售合约）：
  PRIVATE_KEY_SUPPLIER = 0x1b9c251d... （用于 forge script 部署销售合约）
  SEPOLIA_RPC_URL      = https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-...
  （.env.sepolia 里的其他合约地址是旧部署，不使用）

xPNTs 部署 paymasterAOA 处理：
  → 首次部署传 address(0) 占位（SDK l4-setup.ts 已验证）
  → V4 部署后调用 xPNTsToken.setSuperPaymasterAddress(v4Address) 更新

质押锁定期：从链上 Registry.getRoleConfig().roleLockDuration 读取，本地缓存。

测试规则：所有 E2E 测试必须通过并输出完整报告后，才能 git commit。
```

---

## 总体里程碑地图

```
M0 ──► M1 ──► M2 ──► M3 ──► M4       Phase 1: 角色管理
                                │
                                ▼
                        M5 ──► M6 ──► M7 ──► M8    Phase 2: 销售合约
                                                │
                                                ▼
                                        M9 ──► M10   Phase 3: 集成验收
```

| 里程碑 | 名称 | 预估工时 | 验收标准 |
|---|---|---|---|
| M0 | 环境就绪 | 2天 | YetAnotherAA 本地跑通，Passkey 登录成功 |
| M1 | Registry 集成 | 3天 | 角色查询、注册、退出 API + 页面 |
| M2 | Community Admin | 3天 | 社区创建、xPNTs 部署、成员管理 |
| M3 | Operator（SPO + V4） | 3天 | SPO 注册/配置/退出，V4 部署/充值 |
| M4 | Protocol Admin | 2天 | 角色参数配置、SPO 紧急暂停 |
| M5 | GTokenSaleContract | 3天 | 合约实现 + Foundry 测试 + 部署 |
| M6 | APNTsSaleContract | 2天 | 合约实现 + Foundry 测试 + 部署 |
| M7 | 销售事件缓存 | 2天 | NestJS sale 模块 + SQLite 同步 |
| M8 | 销售页面 | 3天 | /sale 完整购买流程 |
| M9 | E2E 全链路 | 3天 | 全角色 E2E 报告通过 |
| M10 | 验收报告 | 1天 | 完整验收文档输出 |

---

## M0：环境就绪

### 子任务

- [ ] **T0.1** 进入 `yetanotheraa/`，执行 `pnpm install`
- [ ] **T0.2** 写入 `aastar/.env`（按下方模板）
- [ ] **T0.3** 写入 `aastar-frontend/.env.local`（按下方模板）
- [ ] **T0.4** 安装新依赖：`cd aastar && pnpm add @aastar/sdk @aastar/core viem`
- [ ] **T0.5** 安装前端依赖：`cd aastar-frontend && pnpm add @aastar/core viem`
- [ ] **T0.6** 启动：`pnpm dev`（后端 3000 + 前端 3001）
- [ ] **T0.7** 创建根目录 `.env`（链接 .env.sepolia 内容供 Foundry 使用）
- [ ] **T0.8** 验证合约常量加载：在 NestJS 中 import `@aastar/core` 打印地址

### aastar/.env 模板

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=<openssl rand -hex 32>
JWT_EXPIRES_IN=7d
USER_ENCRYPTION_KEY=<openssl rand -hex 16>
DB_TYPE=json

CHAIN_ID=11155111
ETH_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-vnwJUePSAAD7N
BUNDLER_RPC_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=pim_gcVkLnianG5Fj4AvFYhAEh
ENTRY_POINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
DEFAULT_ENTRYPOINT_VERSION=0.7

BLS_SEED_NODES=https://v1.aastar.io
KMS_ENABLED=true
KMS_ENDPOINT=https://kms1.aastar.io
KMS_API_KEY=kms_b3994135cfd148ec9c5be29ef0690679

# Contract addresses (@aastar/core canonical, Sepolia 11155111)
REGISTRY_ADDRESS=0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788
STAKING_ADDRESS=0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC
SUPER_PAYMASTER_ADDRESS=0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A
GTOKEN_ADDRESS=0x9ceDeC089921652D050819ca5BE53765fc05aa9E
XPNTS_FACTORY_ADDRESS=0x6EafdA3477F3eec1F848505e1c06dFB5532395b6
PAYMASTER_FACTORY_ADDRESS=0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d
MYSBT_ADDRESS=0x677423f5Dad98D19cAE8661c36F094289cb6171a
APNTS_ADDRESS=0xDf669834F04988BcEE0E3B6013B6b867Bd38778d
PRICE_FEED_ADDRESS=0x694AA1769357215DE4FAC081bf1f309aDC325306
```

### aastar-frontend/.env.local 模板

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_KMS_URL=https://kms1.aastar.io
NEXT_PUBLIC_KMS_API_KEY=kms_b3994135cfd148ec9c5be29ef0690679
NEXT_PUBLIC_BLS_SEED_NODE=https://v1.aastar.io
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_REGISTRY_ADDRESS=0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788
NEXT_PUBLIC_GTOKEN_ADDRESS=0x9ceDeC089921652D050819ca5BE53765fc05aa9E
NEXT_PUBLIC_XPNTS_FACTORY_ADDRESS=0x6EafdA3477F3eec1F848505e1c06dFB5532395b6
NEXT_PUBLIC_APNTS_ADDRESS=0xDf669834F04988BcEE0E3B6013B6b867Bd38778d
NEXT_PUBLIC_SUPER_PAYMASTER_ADDRESS=0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A
```

### M0 验收测试

```bash
# 手动验证（不需要 E2E 框架）
curl http://localhost:3000/api/docs              # Swagger 可访问
curl http://localhost:3000/api/v1/auth/profile   # 返回 401（未登录，说明路由正常）
# 浏览器打开 http://localhost:3001 → 可看到登录页
# 注册账户 → Passkey 登录 → 查看余额 → Gasless 转账测试
```

---

## M1：Registry 集成

### 子任务

**后端（NestJS）**

- [ ] **T1.1** 创建 `registry/registry.module.ts`：依赖注入 viem publicClient + walletClient
- [ ] **T1.2** `registry/registry.service.ts`：
  - `getUserRoles(address)` → `registryActions.getUserRoles()` + `getRoleConfig()` + stake 信息聚合
  - `getExitPreview(roleId, address)` → `calculateExitFee()` + 锁定期计算（读链 + 本地缓存）
  - `registerRole(roleId, passkeyAssertion)` → 多步骤 TX 协调
  - `initiateExit(roleId, passkeyAssertion)` → `exitRole()`
  - `withdrawStake(roleId, passkeyAssertion)` → staking withdraw
- [ ] **T1.3** `registry/registry.controller.ts`：REST API（见 plan-v3.1 第七节）
- [ ] **T1.4** `registry/dto/`：DTO 类型定义（RegisterRoleDto, ExitRoleDto）
- [ ] **T1.5** 缓存：`lockDuration` per roleId 缓存到内存（TTL 1小时）

**前端（Next.js）**

- [ ] **T1.6** `/role/page.tsx`：角色检测中心（读 `GET /registry/roles/:address` → 展示角色卡片）
- [ ] **T1.7** `components/RoleStatusBadge.tsx`：角色标识 + 质押状态
- [ ] **T1.8** `components/PreflightCheck.tsx`：前置条件检查面板
- [ ] **T1.9** `components/ExitFeePreview.tsx`：退出费预览组件
- [ ] **T1.10** `components/CountdownTimer.tsx`：锁定期倒计时
- [ ] **T1.11** 导航栏：根据角色动态显示菜单项

### M1 单元测试

```typescript
// aastar/src/registry/registry.service.spec.ts
describe('RegistryService', () => {
  describe('getUserRoles', () => {
    it('should return empty array for new address');
    it('should return ROLE_COMMUNITY for registered community admin');
    it('should return multiple roles for SPO (COMMUNITY + PAYMASTER_SUPER)');
    it('should include stake info and lock duration');
  });
  describe('getExitPreview', () => {
    it('should calculate correct 5% exit fee for ROLE_COMMUNITY');
    it('should calculate correct 10% exit fee for ROLE_PAYMASTER_SUPER');
    it('should return canExitAt = 0 when lock duration elapsed');
    it('should cache lockDuration after first chain read');
  });
  describe('registerRole', () => {
    it('should reject PAYMASTER_SUPER if no ROLE_COMMUNITY');
    it('should return txHash on success');
  });
});
```

### M1 E2E 测试

```typescript
// e2e/m1-registry.e2e.ts
describe('M1: Registry Integration', () => {
  let testAddress: string;

  it('GET /api/v1/registry/roles/:address - new address returns empty roles', async () => {
    const res = await request(app).get(`/api/v1/registry/roles/${testAddress}`);
    expect(res.status).toBe(200);
    expect(res.body.roles).toHaveLength(0);
  });

  it('GET /api/v1/registry/exit-preview/ROLE_COMMUNITY - returns preview', async () => {
    const res = await request(app)
      .get(`/api/v1/registry/exit-preview/ROLE_COMMUNITY`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(res.body).toMatchObject({
      staked: expect.any(String),
      exitFee: expect.any(String),
      netAmount: expect.any(String),
      canExitAt: expect.any(Number)
    });
  });

  it('GET /role page - shows role detection', async () => {
    await page.goto('http://localhost:3001/role');
    await expect(page).toHaveTitle(/Role/);
    // 显示 GToken 余额
    await expect(page.locator('[data-testid="gt-balance"]')).toBeVisible();
  });
});
```

**M1 E2E 报告格式：**

```
M1 Registry Integration - E2E Test Report
==========================================
Run Time: 2026-XX-XX HH:MM:SS
Network: Sepolia (11155111)
Registry: 0xC84A8B0C...

Test Results:
  ✅ GET /registry/roles/:address (new)      → [] (200ms)
  ✅ GET /registry/roles/:address (community) → [ROLE_COMMUNITY] (312ms)
  ✅ GET /registry/exit-preview              → {staked: "30", fee: "1.5", net: "28.5"} (180ms)
  ✅ /role page renders                      → visible (1.2s)
  ✅ Role badge shows correctly              → "Community Admin" (350ms)

Total: 5/5 PASSED | Duration: 2.3s
```

---

## M2：Community Admin

### 子任务

**后端**

- [ ] **T2.1** `community/community.service.ts`：
  - `launchCommunity(config, passkeyAssertion)` → `CommunityClient.launchCommunity()`（3步 TX）
  - `deployXPNTs(params, passkeyAssertion)` → `CommunityClient.issueXPNTs()` + 解析 `xPNTsTokenDeployed` 事件 → 真实地址
  - `setXPNTsPaymasterAOA(xpntsAddress, v4Address, passkeyAssertion)` → `xPNTsToken.setSuperPaymasterAddress()`
  - `getCommunityStats(communityId)` → 聚合：`getRoleUserCount()` + `getTokenAddress()` + `totalSupply()`
  - `getMembers(communityId, offset, limit)` → `getRoleMembers()` + SBT data
  - `configureSBTRules(rules)` → 直接 viem 调用 `registry.configureRole()`
- [ ] **T2.2** `community/community.controller.ts`：REST API
- [ ] **T2.3** 存储社区 xPNTs 地址（DB entity: `community_tokens`）

**前端**

- [ ] **T2.4** `/community/page.tsx`：社区总览（已有/引导创建）
- [ ] **T2.5** `/community/launch/page.tsx`：创建向导 + `MultiStepTx`（3步）
  - **注意**：`checkLaunchRequirements()` 前置检查，GToken ≥ 33
- [ ] **T2.6** `/community/tokens/page.tsx`：xPNTs 管理
  - 部署向导（name/symbol/communityENS/exchangeRate，paymasterAOA 传 address(0)）
  - 部署成功后显示真实合约地址（从事件解析）
  - `[更新 V4 Paymaster 地址]` 按钮（V4 部署后调用 setSuperPaymasterAddress）
- [ ] **T2.7** `/community/members/page.tsx`：成员列表（分页）
- [ ] **T2.8** `/community/sbt-rules/page.tsx`：SBT 规则配置
- [ ] **T2.9** `components/MultiStepTx.tsx`：多步骤 TX 进度条

### M2 单元测试

```typescript
describe('CommunityService', () => {
  describe('launchCommunity', () => {
    it('should fail if GToken balance < 33');
    it('should return communityId and txHash on success');
    it('should execute 3 transactions in order (approve, register, configure)');
  });
  describe('deployXPNTs', () => {
    it('should deploy with paymasterAOA = address(0)');
    it('should parse xPNTsTokenDeployed event for real token address');
    it('should NOT return address(0) as the final address');
    it('should persist token address to DB');
  });
  describe('getCommunityStats', () => {
    it('should aggregate from 3 contracts');
    it('should return 0 members for new community');
  });
});
```

### M2 E2E 测试

```typescript
describe('M2: Community Admin', () => {
  it('POST /community/launch - creates community with 3 txs');
  it('POST /community/deploy-xpnts - deploys token, returns real address');
  it('GET /community/stats - returns aggregated stats');
  it('GET /community/members - returns paginated member list');
  it('/community/launch page - 3-step wizard completes');
  it('/community/tokens page - shows deployed xPNTs with correct address');
});
```

**M2 E2E 报告（含真实链上数据）：**

```
M2 Community Admin - E2E Test Report
=====================================
Network: Sepolia (11155111)
Test Community: "TestCommunity_<timestamp>"

Lifecycle Test:
  ✅ Pre-flight check (GToken balance ≥ 33)     → balance: 50.0 GT
  ✅ Approve GToken (step 1/3)                   → tx: 0xabc... (8.2s)
  ✅ Register ROLE_COMMUNITY (step 2/3)           → tx: 0xdef... (9.1s)
  ✅ Configure community (step 3/3)               → tx: 0x123... (7.8s)
  ✅ Community registered                         → id: 0xTestAddr
  ✅ Deploy xPNTs (paymasterAOA=0x0)             → tx: 0x456... (11.2s)
  ✅ xPNTs address parsed from event             → 0x789... (NOT address(0))
  ✅ getCommunityStats                            → {members:0, xpnts: 0x789...}
  ✅ Member list (empty new community)            → [] (200ms)

Total: 9/9 PASSED | Total on-chain time: 36.3s | Gas used: ~0.012 ETH
```

---

## M3：Operator（SPO + V4）

### 子任务

**后端**

- [ ] **T3.1** `operator/operator.service.ts`：
  - `registerSPO(params, passkeyAssertion)` → `PaymasterOperatorClient.registerAsSuperPaymasterOperator()`（4步 TX）
  - `registerV4(params, passkeyAssertion)` → `deployAndRegisterPaymasterV4()`（幂等）
  - `configure(params, passkeyAssertion)` → `configureOperator(xPNTsToken, treasury, exchangeRate)`
  - `depositCollateral(amount, passkeyAssertion)` → `depositCollateral()`
  - `withdrawCollateral(to, amount, passkeyAssertion)` → `withdrawCollateral()`
  - `getDetails(address?)` → `getOperatorDetails()`
  - `initiateExit(passkeyAssertion)` → `initiateExit()`（SPO: `unlockStake`；V4: 走 Registry）
  - `withdrawAllFunds(passkeyAssertion)` → 批量：withdrawCollateral + unlockStake + withdrawStake + exitRole
- [ ] **T3.2** `operator/operator.controller.ts`

**前端**

- [ ] **T3.3** `/operator/page.tsx`：运营总览（aPNTs余额 / reputation 0-100 / isPaused / 统计）
- [ ] **T3.4** `/operator/register/page.tsx`：注册向导
  - SPO Tab：PreflightCheck（ROLE_COMMUNITY + GT≥55）→ 4步 MultiStepTx
  - V4 Tab：PreflightCheck（ROLE_COMMUNITY + GT≥33）→ 2步 MultiStepTx
- [ ] **T3.5** `/operator/configure/page.tsx`：configureOperator（xPNTs/treasury/exchangeRate）
- [ ] **T3.6** `/operator/collateral/page.tsx`：aPNTs 存取（SPO only）
- [ ] **T3.7** `/operator/exit/page.tsx`：退出流程（ExitFeePreview + 30天倒计时 + 批量提取）
- [ ] **T3.8** `components/TierProgress.tsx` 预留（M8 使用）

### M3 单元测试

```typescript
describe('OperatorService', () => {
  describe('registerSPO', () => {
    it('should fail if no ROLE_COMMUNITY');
    it('should fail if GToken < 55');
    it('should execute 4 transactions: approve, register, approve-aPNTs, deposit');
  });
  describe('registerV4', () => {
    it('should be idempotent (re-run returns existing address)');
    it('should return paymasterAddress, deployHash, registerHash');
  });
  describe('configure', () => {
    it('should reject xPNTsToken not from xPNTsFactory');
    it('should succeed with valid xPNTs address');
  });
  describe('initiateExit', () => {
    it('should start 30-day countdown');
    it('should reject if still in lock period');
  });
});
```

### M3 E2E 测试

```
M3 Operator - E2E Test Report
===============================
Network: Sepolia (11155111)

SPO Lifecycle:
  ✅ Pre-flight: ROLE_COMMUNITY ✓, GT=55.0 ✓, aPNTs=100.0 ✓
  ✅ Approve GToken (1/4)                      → tx: 0x... (8.1s)
  ✅ Register ROLE_PAYMASTER_SUPER (2/4)        → tx: 0x... (9.8s)
  ✅ Approve aPNTs (3/4)                       → tx: 0x... (7.2s)
  ✅ Deposit aPNTs (4/4)                       → tx: 0x... (8.9s)
  ✅ configureOperator                         → tx: 0x... (8.5s)
  ✅ getOperatorDetails                        → {aPNTsBalance: "100", reputation: 100, isConfigured: true}
  ✅ depositCollateral +50 aPNTs              → aPNTsBalance: "150"
  ✅ withdrawCollateral 20 aPNTs              → aPNTsBalance: "130"
  ✅ initiateExit                             → unstakeRequestedAt set
  ✅ countdown displayed                       → "29 days 23:59:59"

V4 Lifecycle:
  ✅ deployAndRegisterPaymasterV4              → paymasterAddress: 0x...
  ✅ Idempotency check (redeploy)             → returns same address
  ✅ getOperatorDetails V4                    → configured

Total: 13/13 PASSED | Total on-chain time: ~85s
```

---

## M4：Protocol Admin

### 子任务

**后端**

- [ ] **T4.1** `admin/admin.service.ts`：
  - `getProtocolStatus()` → 所有角色配置 + SP 全局配置 + active operators 列表
  - `configureRole(roleId, params, passkeyAssertion)` → `adminConfigureRole()`
  - `setProtocolFee(feeBPS, passkeyAssertion)` → `superPaymasterActions.setProtocolFee()`
  - `pauseOperator(operator, passkeyAssertion)` → `setOperatorPaused()`
  - `replenishGTokenPool(amount, passkeyAssertion)` → `gToken.transfer(saleContract, amount)`
- [ ] **T4.2** Owner 验证中间件（读链验证 msg.sender = contract owner）

**前端**

- [ ] **T4.3** `/admin/page.tsx`：协议全状态总览
- [ ] **T4.4** `/admin/roles/page.tsx`：角色参数配置（修改前显示 24h 公告提示）
- [ ] **T4.5** `/admin/superpaymaster/page.tsx`：SP 全局配置 + Operator 列表 + 紧急暂停
- [ ] **T4.6** `/admin/transfer-dao/page.tsx`：移交 DAO（双确认弹窗）

### M4 单元测试

```typescript
describe('AdminService', () => {
  describe('getProtocolStatus', () => {
    it('should return all 7 role configs');
    it('should include active operator count');
  });
  describe('configureRole', () => {
    it('should reject if caller is not contract owner');
    it('should update minStake successfully');
  });
  describe('pauseOperator', () => {
    it('should set isPaused=true for target operator');
    it('should be instant (no timelock)');
  });
});
```

### M4 E2E 报告

```
M4 Protocol Admin - E2E Test Report
=====================================
  ✅ getProtocolStatus - 7 roles returned with correct params
  ✅ adminConfigureRole - ROLE_ENDUSER minStake updated to 0.3 GT
  ✅ setProtocolFee - 200 BPS (2%) set
  ✅ pauseOperator - operator paused, isPaused=true confirmed on-chain
  ✅ unpauseOperator - operator resumed
  ✅ /admin page renders all role configs
  ✅ /admin/superpaymaster - pause button triggers on-chain tx

Total: 7/7 PASSED
```

---

## M5：GTokenSaleContract

### 子任务

**合约（contracts/sale/src/）**

- [ ] **T5.1** `GTokenSaleContract.sol` 核心实现：
  - `Tier` struct（revenueTarget / priceUSD / perPersonMaxUSD / whitelistRequired）
  - `initTiers()` → 4 层初始配置（$0.15 起，+12%）
  - `buyGToken(paymentToken, amount, recipient, permit, sig)` 含截断逻辑
  - `tierSpent` mapping（个人限额，跨层累计）
  - 价格提升触发：`currentTierRevenue >= revenueTarget` → `TierAdvanced` 事件
  - `replenishPool()` → GToken transfer 入合约
- [ ] **T5.2** Chainlink ETH/USD 集成（Sepolia feed: 0x694AA1...）
- [ ] **T5.3** 支付 token：USDC / USDT / WETH / WBTC / ETH（native）
- [ ] **T5.4** Pause / Unpause + ReentrancyGuard
- [ ] **T5.5** 初始化脚本（Foundry script，使用 PRIVATE_KEY_SUPPLIER 部署）
- [ ] **T5.6** 部署后初始化：`initTiers()` 写入 4 层配置

**部署**

```bash
# contracts/sale/ 目录下
forge script script/DeployGTokenSale.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY_SUPPLIER \
  --broadcast
# 记录部署地址 → 写入 .env 和 frontend .env.local
```

### M5 单元测试（Foundry）

```solidity
// test/GTokenSaleContract.t.sol
contract GTokenSaleTest is Test {
    // 收入驱动阶梯跃迁
    function test_TierAdvancesOnRevenueTarget() public;
    function test_TierDoesNotAdvanceOnTokenCount() public;

    // 个人限额
    function test_AutoTruncateExceedingPersonalLimit() public;
    function test_PersonalLimitResetsBetweenTiers() public;
    function test_SameAddressCanBuyAcrossMultipleTiers() public;

    // 支付
    function test_BuyWithUSDC() public;
    function test_BuyWithETH() public;
    function test_BuyWithETHRefundsExcess() public;

    // 边界
    function test_PoolExhaustedReverts() public;
    function test_PausedContractReverts() public;
    function test_InitTiersOnlyOwner() public;

    // 报价
    function test_GetQuoteMatchesBuyResult() public;
    function test_GetQuoteWouldTruncate() public;
}
```

### M5 E2E 报告

```
M5 GTokenSaleContract - E2E Test Report
=========================================
Network: Sepolia (fork at block #XXXXXX)
Contract: 0x<新部署地址>
GToken Pool: 644,175 GT pre-funded

Unit Tests (Foundry):
  ✅ test_TierAdvancesOnRevenueTarget         gas: 45,231
  ✅ test_AutoTruncateExceedingPersonalLimit  gas: 38,102
  ✅ test_BuyWithUSDC                        gas: 112,443
  ✅ test_BuyWithETH (with Chainlink feed)   gas: 134,211
  ✅ test_PersonalLimitResetsBetweenTiers    gas: 67,890
  ✅ test_SameAddressMultipleTiers           gas: 89,234
  ✅ test_PoolExhaustedReverts               gas: 23,112
  ✅ test_GetQuoteMatchesBuyResult           gas: 18,234
  [8/8 tests pass]

Live Sepolia Test:
  ✅ Deploy GTokenSaleContract               → 0x<addr> (tx: 0x...)
  ✅ initTiers (4 tiers)                     → tx: 0x... (Tier1=$0.15, rev=$1200)
  ✅ replenishPool (1000 GT)                 → poolBalance: 1000 GT
  ✅ buyGToken $5 USDC → 33.33 GT           → tx: 0x...
  ✅ TierAdvanced event at $1200 revenue     → Tier2 $0.168 activated

Solidity Coverage: 94.2% lines, 91.7% branches
Total: 13/13 PASSED
```

---

## M6：APNTsSaleContract

### 子任务

**合约**

- [ ] **T6.1** `APNTsSaleContract.sol`：
  - 浮动定价（MIN_PRICE=$0.018，MAX_PRICE=$0.030，默认$0.02）
  - `monthlyServiceCapacityUSD`：$10,000 预警（事件，非强制）
  - `buyAPNTs(paymentToken, amount, recipient)` → 预分配池
  - `adminMint(recipient, amount, reason)` → 直接 mint（含事件 reason 字段）
  - `replenishPool(amount)` → communityOwner mint aPNTs → 存入合约
- [ ] **T6.2** 部署 + 初始化脚本
- [ ] **T6.3** communityOwner 权限验证（`replenishPool` 和 `adminMint`）

### M6 单元测试（Foundry）

```solidity
contract APNTsSaleTest is Test {
    function test_BuyAPNTs() public;
    function test_PriceClampedToMinMax() public;
    function test_MonthlyCapacityWarningEvent() public;
    function test_AdminMintWithReason() public;
    function test_ReplenishPool() public;
    function test_PoolDepletedReverts() public;
}
```

### M6 E2E 报告

```
M6 APNTsSaleContract - E2E Test Report
========================================
  ✅ Deploy APNTsSaleContract       → 0x<addr>
  ✅ setPrice $0.025/aPNTs         → accepted (within $0.018-$0.030)
  ✅ setPrice $0.050/aPNTs         → REVERTED (above MAX_PRICE) ✓
  ✅ replenishPool (10000 aPNTs)   → poolBalance: 10,000
  ✅ buyAPNTs $10 USDC → 400 aPNTs → tx: 0x...
  ✅ adminMint 500 aPNTs reason="airdrop" → event logged correctly
  ✅ monthly $10k warning event    → CapacityWarning emitted

Unit Tests: 6/6 PASSED | Live Tests: 7/7 PASSED
```

---

## M7：销售事件缓存

### 子任务

**后端**

- [ ] **T7.1** `sale/entities/` → TypeORM entities：`GTokenSale`, `APNTsMint`, `SyncState`
- [ ] **T7.2** `sale/sale.service.ts`：
  - `syncGTokenEvents()` → viem `getLogs(GTokenPurchased)` → upsert DB（by txHash）
  - `syncAPNTsEvents()` → viem `getLogs(APNTsMinted)` → upsert DB
  - `getGTokenHistory(buyer?, offset, limit)` → DB query
  - `getAPNTsHistory(operator?, offset, limit)` → DB query
  - `getSaleStats()` → 各层累计收入/当前层索引/当前层收入进度（实时读链）
- [ ] **T7.3** `@nestjs/schedule`：定时任务（每5分钟）同步事件
- [ ] **T7.4** `sale/sale.controller.ts`：REST API

### M7 单元测试

```typescript
describe('SaleService', () => {
  it('should upsert by txHash (no duplicates on re-sync)');
  it('should filter by buyer address');
  it('should return correct current tier from chain');
  it('should handle sync from block 0 on first run');
  it('should resume from lastSyncedBlock on subsequent runs');
});
```

### M7 E2E 报告

```
M7 Sale Event Cache - E2E Test Report
=======================================
  ✅ Initial sync (from block 0)          → 3 GTokenPurchased events cached
  ✅ Incremental sync (from last block)   → 1 new event added
  ✅ No duplicates after re-sync          → count unchanged
  ✅ GET /sale/gtoken?buyer=0x...         → [3 records with amounts]
  ✅ GET /sale/stats                      → {currentTier: 1, tierRevenue: "$650"}
  ✅ GET /sale/current-tier               → {tier: 1, price: "$0.15", remaining: "$550"}

Total: 6/6 PASSED
```

---

## M8：销售页面

### 子任务

**前端**

- [ ] **T8.1** `/sale/page.tsx`：主销售页面
- [ ] **T8.2** GToken 购买区：
  - `TierProgress` 组件（currentTierRevenue / revenueTarget 进度条）
  - 支付 token 选择 + 金额输入 + `getQuote()` 实时报价
  - 个人剩余限额展示（`getRemainingPersonalLimit`）
  - 截断提示组件
  - Passkey 确认 → viem `writeContract`（buyGToken）
- [ ] **T8.3** aPNTs 购买区：同上，浮动价格 + 服务能力预警
- [ ] **T8.4** 销售历史：调用 `/api/v1/sale/gtoken` 分页展示
- [ ] **T8.5** `/admin/mint/page.tsx`：充池管理（GToken 池余额 + 充值 + aPNTs adminMint）
- [ ] **T8.6** `components/TierProgress.tsx`：收入驱动进度条

### M8 E2E 测试（Playwright）

```typescript
describe('M8: Sale Page', () => {
  it('displays current tier info (price, progress bar)');
  it('updates quote in real-time on amount input change');
  it('shows personal limit remaining');
  it('shows truncation notice when exceeding limit');
  it('completes purchase: enter amount → passkey → tx hash shown');
  it('sale history shows new purchase after confirmation');
  it('aPNTs capacity warning visible when near $10k/month');
});
```

### M8 E2E 报告

```
M8 Sale Page - E2E Test Report
================================
Network: Sepolia (11155111)
GTokenSale: 0x<addr> | APNTsSale: 0x<addr>

  ✅ Page load shows Tier 1: "$0.1500/GT" progress "54.2%"
  ✅ Input $10 USDC → quote: "66.67 GT"
  ✅ Personal limit $12 - already spent $8 → remaining: "$4.00"
  ✅ Input $10 → truncation notice: "Auto-adjusted to $4.00 (26.67 GT)"
  ✅ Buy 26.67 GT → Passkey prompt → tx: 0x... confirmed (9.3s)
  ✅ History updated: new row "26.67 GT | $4.00 USDC | 0x..."
  ✅ aPNTs price shown: "$0.025/aPNTs"
  ✅ Capacity at $9,200/$10,000 → yellow warning shown

Total: 8/8 PASSED | Purchase confirmed on-chain: block #XXXXXXX
```

---

## M9：全链路 E2E

### 覆盖场景

#### 场景一：新用户完整成为 Community Admin + SPO

```
1. 注册账户（Email + Passkey）
2. Smart Account 地址生成
3. 购买 GToken（/sale → 33 GT）
4. 注册 ROLE_COMMUNITY（/community/launch）
5. 部署 xPNTs（paymasterAOA=address(0)）
6. 注册 ROLE_PAYMASTER_SUPER（/operator/register SPO Tab）
7. configureOperator（xPNTs + treasury + exchangeRate）
8. 验证 getOperatorDetails（isConfigured=true，aPNTsBalance>0）
```

#### 场景二：V4 Paymaster 完整生命周期

```
1. 已有 ROLE_COMMUNITY
2. 部署 + 注册 V4 Paymaster
3. V4 地址写回 xPNTs.setSuperPaymasterAddress()
4. 充值 ETH 到 V4 Paymaster
5. End User 使用该 V4 完成 Gasless 交易
```

#### 场景三：Protocol Admin 紧急暂停 + 恢复

```
1. Protocol Admin 登录
2. 检查 SPO 列表（/admin/superpaymaster）
3. 紧急暂停某 SPO
4. 验证该 SPO isPaused=true，无法赞助交易
5. 恢复 SPO
6. 验证恢复后可赞助
```

#### 场景四：销售合约完整流程

```
1. 用户购买 GToken（Tier 1）
2. 检查个人限额（1% of $1200 = $12）
3. 输入 $20 → 截断为 $12 → 获得 80 GT
4. Tier 收入到 $1200 → 自动跃升 Tier 2
5. 用户购买 aPNTs → 获得对应数量
6. adminMint aPNTs（Protocol Admin）
```

### M9 E2E 报告模板

```
M9 Full E2E Integration Report
================================
Run Date: 2026-XX-XX HH:MM:SS
Network: Sepolia (11155111)
Test Accounts:
  Admin: 0xPRIVATE_KEY_SUPPLIER_ADDRESS
  User1: 0x... (GToken: 100 GT, aPNTs: 50)
  User2: 0x... (fresh account)

Scenario 1: New User → Community Admin → SPO
  ✅ Register (Email + Passkey)           → userId: xxx
  ✅ Smart Account created               → 0x...
  ✅ Buy 33 GT ($4.95 USDC)              → tx: 0x... block #...
  ✅ Launch community "TestDAO"          → tx1:0x tx2:0x tx3:0x
  ✅ Deploy xPNTs "TDAO"                → addr: 0x... (from event)
  ✅ Register SPO (50 GT stake)          → tx1~tx4 all confirmed
  ✅ configureOperator                  → isConfigured=true
  ✅ getOperatorDetails                 → {reputation:100, aPNTsBalance:"100"}
  Duration: 4m 32s | Gas total: ~0.045 ETH

Scenario 2: V4 Paymaster + Gasless TX
  ✅ Deploy V4 Paymaster                → 0x...
  ✅ setSuperPaymasterAddress           → linked ✓
  ✅ Deposit 0.1 ETH to V4             → deposit: 0.1 ETH
  ✅ End user gasless transfer 1 USDC  → tx: 0x... Gas: $0

Scenario 3: Admin Emergency Pause
  ✅ Pause SPO                          → isPaused: true
  ✅ SPO cannot sponsor                 → validatePaymasterUserOp reverted ✓
  ✅ Resume SPO                         → isPaused: false

Scenario 4: Sale Contract Full Flow
  ✅ Buy $12 → 80 GT (Tier 1)          → tx: 0x...
  ✅ Truncation: $20 input → $12 actual → truncated: true ✓
  ✅ Tier 1 exhausted at $1200         → TierAdvanced event emitted ✓
  ✅ Tier 2 active: $0.168/GT          → currentTier: 2 ✓
  ✅ Buy 400 aPNTs ($10 USDC)          → tx: 0x...
  ✅ AdminMint 100 aPNTs "airdrop"     → event logged correctly ✓

OVERALL: 22/22 TESTS PASSED
Total Duration: 18m 43s
All transactions confirmed on Sepolia testnet.
```

---

## M10：验收报告

交付物：

- [ ] **T10.1** 完整 E2E 报告（M9 输出，含所有链上 TX hash）
- [ ] **T10.2** API 文档（Swagger 截图 + 端点列表）
- [ ] **T10.3** 合约 ABI 文件（GTokenSaleContract + APNTsSaleContract）
- [ ] **T10.4** 部署地址清单（Sepolia）
- [ ] **T10.5** 已知问题列表（如 SDK 的 3 个 bug 及绕过方式）
- [ ] **T10.6** Phase 3 SDK 提炼建议（哪些函数值得提炼）

---

## 测试框架约定

### 后端单元测试

```bash
cd yetanotheraa/aastar
pnpm test                    # Jest，覆盖率报告
pnpm test:cov                # 输出 coverage/index.html
```

### 后端 E2E 测试

```bash
pnpm test:e2e                # Supertest + 真实 Sepolia RPC
# 输出：e2e-reports/M{N}-report.txt
```

### 合约测试（Foundry）

```bash
cd contracts/sale
forge test --fork-url $SEPOLIA_RPC_URL -vvv
forge coverage --report summary   # 覆盖率
```

### 前端 E2E（Playwright）

```bash
cd yetanotheraa/aastar-frontend
pnpm e2e                     # Playwright，Chrome headless
# 输出：playwright-report/index.html
```

### Commit 规则

```
❌ 不通过 E2E 不允许 commit
✅ 每个里程碑对应一个 commit，message 格式：
   feat(M{N}): <milestone name>

   E2E: {N}/{N} PASSED
   Report: docs/e2e-reports/M{N}-report.txt
```

---

*里程碑文档 v1.0 | 总预估工时：约 25 个工作日*
*关键约束：E2E 必须通过才能 commit，每个里程碑独立可部署*
