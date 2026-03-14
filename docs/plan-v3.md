# AAStar 管理界面产品设计文档 v3.1

> 基于 YetAnotherAA 现有实现 + aastar-sdk/SuperPaymaster/registry 深度分析后的整合方案
> 最后更新：2026-03-14（v3.1 - 深度 SDK/合约分析，修正设计偏差）

---

## 目录

1. [三层架构总览](#一三层架构总览)
2. [深度分析发现的关键修正](#二深度分析发现的关键修正)
3. [YetAnotherAA 现有功能清单](#三yetanotheraa-现有功能清单)
4. [配置环境变量（全部确认）](#四配置环境变量全部确认)
5. [合约地址（规范来源）](#五合约地址规范来源)
6. [SDK 函数实际签名](#六sdk-函数实际签名)
7. [新增模块设计（精确版）](#七新增模块设计精确版)
8. [Next.js 前端页面设计（精确版）](#八nextjs-前端页面设计精确版)
9. [销售合约集成方案](#九销售合约集成方案)
10. [仍需用户确认的问题](#十仍需用户确认的问题)
11. [修订后的开发计划](#十一修订后的开发计划)

---

## 一、三层架构总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                 │
│                       (yetanotheraa/ submodule)                          │
│                                                                           │
│  ┌─────────────────────────┐     ┌──────────────────────────────────┐    │
│  │  aastar-frontend        │     │  aastar (NestJS Backend)          │    │
│  │  Next.js 16 + React 19  │     │  port 3000                        │    │
│  │  Tailwind CSS 4         │     │                                   │    │
│  │                         │     │  ── 已有模块（直接复用）──        │    │
│  │  ── 已有页面 ──         │     │  auth/     email + passkey + JWT  │    │
│  │  /auth/*   登录/注册    │     │  account/  ERC-4337 smart account │    │
│  │  /dashboard 账户总览    │     │  transfer/ gasless UserOp         │    │
│  │  /transfer  gasless转账 │     │  kms/      WebAuthn + BLS         │    │
│  │  /tokens   代币列表     │     │  paymaster/ 配置                  │    │
│  │  /nfts     NFT列表      │     │                                   │    │
│  │                         │     │  ── 新增模块 ──                   │    │
│  │  ── 新增页面 ──         │     │  registry/  角色注册/质押/退出    │    │
│  │  /role/*   角色总览     │     │  community/ 社区/xPNTs/SBT       │    │
│  │  /community/* 社区管理  │     │  operator/  SPO + V4 Operator     │    │
│  │  /operator/*  运营管理  │     │  admin/     协议配置(onlyOwner)   │    │
│  │  /admin/*  协议管理     │     │  sale/      销售历史缓存          │    │
│  │  /sale     Token销售    │     │                                   │    │
│  └─────────────────────────┘     └──────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────▼──────────────────────────┐
          │                    SDK Layer                         │
          │                                                      │
          │  @yaaa/sdk (local in yetanotheraa)                  │
          │  • YAAAClient / YAAAServerClient (account+transfer) │
          │  • KmsClient / PasskeyManager / BLS                 │
          │                                                      │
          │  @aastar/sdk v0.16.23 (pnpm add 安装，不改 submodule)│
          │  • createCommunityClient → launchCommunity          │
          │    issueXPNTs [注意：返回address(0)需解析事件]       │
          │  • PaymasterOperatorClient → registerAsSPO, V4     │
          │  • registryActions (L1) → 所有 Registry 直接调用    │
          │  • superPaymasterActions → 所有 SP 管理操作         │
          │  ⚠️ configureSBTRules() 未实现 → 直接 viem 调用     │
          │  ⚠️ getCommunityStats() 未实现 → 多合约聚合          │
          │                                                      │
          │  viem → 直接调用销售合约（绕过SDK，未来提炼）       │
          └─────────────────────────┬──────────────────────────┘
                                    │
          ┌─────────────────────────▼──────────────────────────┐
          │         Contract Layer（多网络支持）                 │
          │                                                      │
          │  Optimism (10)   Sepolia (11155111)   OP Sepolia    │
          │  [生产]           [开发/测试]          (11155420)    │
          │                                                      │
          │  已部署：Registry / GToken / Staking / SuperPaymaster│
          │         xPNTsFactory / aPNTs / MySBT / EntryPoint  │
          │         PaymasterFactory / ReputationSystem         │
          │                                                      │
          │  待部署：GTokenSaleContract / APNTsSaleContract     │
          └──────────────────────────────────────────────────────┘
```

---

## 二、深度分析发现的关键修正

> 对比 v3.0 计划，以下是经过源码深读后发现的设计偏差，**必须修正**。

### 2.1 ⚠️ SDK 有 3 个函数未实现

| 函数 | 状态 | 应对方案 |
|---|---|---|
| `CommunityClient.configureSBTRules()` | 抛出 Error（未实现）| 直接 viem 调用 `Registry.configureRole()` |
| `CommunityClient.getCommunityStats()` | 抛出 Error（未实现）| 聚合调用：`getRoleUserCount` + `getStakeInfo` + `getTokenAddress` |
| `CommunityClient.issueXPNTs()` | 返回 `address(0)`（Bug）| 解析 `xPNTsTokenDeployed` 事件获取真实地址 |

### 2.2 ⚠️ MySBT.airdropMint 权限是 DAO multisig，不是 communityOwner

v3.0 写的是"Community Admin 可以 airdropMint"，**错误**。

```solidity
function airdropMint(address user, bytes sbtData) → uint256 tokenId
// 权限：onlyDAOMultisig（不是 communityOwner，不是 Registry）
```

- 实际上 communityOwner 没有直接 airdropMint 权限
- Registry 在 `registerRole()` 时自动调用 `mintForRole()`（只有 Registry 能调）
- **结论**：SBT 发放路径只有：
  - A. 用户主动 `registerRoleSelf(ROLE_ENDUSER)` → Registry 自动 mintForRole
  - B. DAO multisig 调用 `airdropMint`（需要 DAO 钱包）
  - 无 communityOwner 直接 mint SBT 的路径

**需要用户确认**：DAO multisig 地址是什么？是否有 Safe 钱包？

### 2.3 ⚠️ xPNTsFactory.deployxPNTsToken 多一个参数

v3.0 没有提到 `paymasterAOA` 参数：

```solidity
function deployxPNTsToken(
    string name,
    string symbol,
    string communityName,
    string communityENS,
    uint256 exchangeRate,
    address paymasterAOA    // ← V4 Paymaster 地址！
) → address token
```

- 如果社区还没部署 V4 Paymaster，`paymasterAOA` 传什么？→ 需确认（可能传 address(0) 或跳过）
- xPNTs 部署后 Factory 会自动 approve: SuperPaymaster + Factory + MySBT

### 2.4 ⚠️ 合约地址：SuperPaymaster 仓库的地址是旧部署

`SuperPaymaster/deployments/config.sepolia.json` 里的地址与 `@aastar/core` 不一致，是老版本。

**规范地址来源**：`@aastar/core` 中的 `CANONICAL_ADDRESSES`（见第五节）。

### 2.5 ✅ Registry.registerRoleSelf 返回 SBT TokenId

```typescript
registerRoleSelf({ roleId, data }) → Promise<Hash>  // 返回 tx hash，SBT ID 在事件里
```

实际上返回的是 `uint256 sbtTokenId`（Solidity），但 SDK 封装后返回 tx Hash，tokenId 需从事件解析。

### 2.6 ✅ Paymaster roles 强制要求先有 ROLE_COMMUNITY

Registry 合约硬编码：`ROLE_PAYMASTER_SUPER` 和 `ROLE_PAYMASTER_AOA` 注册时必须已有 `ROLE_COMMUNITY`。前端 PreflightCheck 必须校验这一点。

### 2.7 ✅ ROLE_ENDUSER 支持多社区（幂等）

```
Registry.registerRole: IDEMPOTENT for ROLE_ENDUSER only
```

同一用户可多次注册 ENDUSER（加入不同社区），每次都会添加新的 SBT Membership。

### 2.8 ✅ 三个网络都已部署（Optimism 是生产网）

| 网络 | Chain ID | 用途 |
|---|---|---|
| Optimism | 10 | **生产**（GToken/aPNTs 真实资产）|
| Sepolia | 11155111 | 开发/测试 |
| OP Sepolia | 11155420 | 备用测试 |

开发阶段用 Sepolia，但设计需支持多网络切换。

### 2.9 ✅ registry 项目（兄弟目录）有参考实现

`/projects/registry/` 已经是用 `@aastar/sdk` + `@aastar/operator` + React + Vite 做的角色管理界面，可以参考它的页面逻辑和合约调用方式。

---

## 三、YetAnotherAA 现有功能清单

### 已完成 ✅（直接复用，不重写）

| 模块 | 实现内容 | 关键文件 |
|---|---|---|
| 用户注册 | Email + Password（bcrypt），JWT 7天有效 | `auth/` |
| Passkey 认证 | KMS WebAuthn 注册/登录 (`/auth/login/kms/*`) | `kms/` |
| Smart Account | ERC-4337 M4账户创建（EntryPoint v0.7） | `account/` |
| Gasless 转账 | UserOp 构建 → Bundler → EntryPoint + Passkey 签名 | `transfer/` |
| BLS 聚合 | gossip 网络 + 动态节点 | `bls/` |
| Gas 估算 | `POST /transfer/estimate` | `transfer/` |
| 代币/NFT 展示 | ERC20 + ERC721 列表 | `token/`, `nft/` |
| 通讯录 | 地址保存管理 | `address-book/` |
| API 文档 | Swagger at `/api-docs` | `main.ts` |
| 数据库 | JSON（开发）/ PostgreSQL（生产），TypeORM | `database/` |

### 已有 API 端点（完整）

```
POST /api/v1/auth/register           - 注册（email+password）
POST /api/v1/auth/login              - 登录
POST /api/v1/auth/login/kms/begin    - KMS Passkey 登录第一步
POST /api/v1/auth/login/kms/complete - KMS Passkey 登录第二步
POST /api/v1/auth/wallet/link        - 绑定 KMS 钱包
GET  /api/v1/auth/profile            - 获取用户信息（JWT）
POST /api/v1/account/create          - 创建 Smart Account
GET  /api/v1/account                 - 获取账户
GET  /api/v1/account/balance         - 获取余额
POST /api/v1/transfer/execute        - 执行 gasless 转账
POST /api/v1/transfer/estimate       - 预估 Gas
GET  /api/v1/transfer/status/:id     - 查询转账状态
GET  /api/v1/transfer/history        - 转账历史
```

---

## 四、配置环境变量（全部确认）

### aastar/.env

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=<生成32位随机字符串>
JWT_EXPIRES_IN=7d
USER_ENCRYPTION_KEY=<生成32位随机字符串>

# 数据库（开发用json，生产切换postgres）
DB_TYPE=json

# 区块链（Sepolia 开发环境）
CHAIN_ID=11155111
ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
BUNDLER_RPC_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=pim_gcVkLnianG5Fj4AvFYhAEh

# EntryPoint v0.7
ENTRY_POINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
DEFAULT_ENTRYPOINT_VERSION=0.7

# BLS
BLS_SEED_NODES=https://v1.aastar.io

# KMS
KMS_ENABLED=true
KMS_ENDPOINT=https://kms1.aastar.io
KMS_API_KEY=kms_b3994135cfd148ec9c5be29ef0690679
```

### aastar-frontend/.env.local

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_KMS_URL=https://kms1.aastar.io
NEXT_PUBLIC_KMS_API_KEY=kms_b3994135cfd148ec9c5be29ef0690679
NEXT_PUBLIC_BLS_SEED_NODE=https://v1.aastar.io
NEXT_PUBLIC_CHAIN_ID=11155111
```

### 状态

| 配置项 | 状态 |
|---|---|
| KMS_API_KEY | ✅ 已确认 |
| BUNDLER_RPC_URL | ✅ 已确认（Pimlico Sepolia） |
| BLS_SEED_NODES | ✅ 已确认（v1.aastar.io） |
| AASTAR_API_URL | ✅ 明确：即 YetAnotherAA 后端自身 URL，无需外部申请 |
| DVT_NODE_ADDRESS | ⏭️ 跳过（Phase 1 不实现 DVT 角色）|
| DAO multisig 地址 | ❓ 待确认（airdropMint 需要）|

---

## 五、合约地址（规范来源）

**唯一规范来源：`@aastar/core` 的 `CANONICAL_ADDRESSES`**
（SuperPaymaster 仓库的 deployments/config.sepolia.json 是旧版，不使用）

### Sepolia（开发测试，Chain ID: 11155111）

```typescript
{
  registry:          '0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788',
  gToken:            '0x9ceDeC089921652D050819ca5BE53765fc05aa9E',
  staking:           '0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC',
  sbt:               '0x677423f5Dad98D19cAE8661c36F094289cb6171a',
  reputationSystem:  '0x4b256541Ff4021f8D8229908C2BEd9c15Fd8afCC',
  superPaymaster:    '0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A',
  paymasterFactory:  '0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d',
  paymasterV4:       '0xD0c82dc12B7d65b03dF7972f67d13F1D33469a98',
  paymasterV4Impl:   '0x0EBEDa248D53678D493f62719b3ce34DDb3CAcFf',
  xPNTsFactory:      '0x6EafdA3477F3eec1F848505e1c06dFB5532395b6',
  entryPoint:        '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  aPNTs:             '0xDf669834F04988BcEE0E3B6013B6b867Bd38778d',
  priceFeed:         '0x694AA1769357215DE4FAC081bf1f309aDC325306',  // ETH/USD Chainlink
  simpleAccountFactory: '0x91E60482a2B343004dF29EB205C4F6916E864700',
  // 待部署
  gTokenSale:        'TBD',
  aPNTsSale:         'TBD',
}
```

### Optimism Mainnet（生产，Chain ID: 10）

```typescript
{
  registry:         '0x997686219F31405503D32728B1f094F115EF24e7',
  gToken:           '0x8d6Fe002dDacCcFBD377F684EC1825f2E1ab7ef6',
  staking:          '0x7A1216C2d814D2389698C64eD23AA1aA9Eb6343E',
  sbt:              '0x28eBFc5fc03B1d7648254AbF1C7B39DbFdef1a94',
  superPaymaster:   '0xA2c9A6e95f19f5D2a364CBCbB5f0b32B1B4d140E',
  paymasterFactory: '0x58A7F6E44a57028A255794119F8b37124c9a7eB8',
  paymasterV4:      '0x67a70a578E142b950987081e7016906ae4F56Df4',
  xPNTsFactory:     '0x864971a26384d9DCC7115f0bBC428e2623F28b6e',
  entryPoint:       '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  aPNTs:            '0x0B41C78081B5A141eb4C3C7E7FD8E58A7Bde553B',
}
```

---

## 六、SDK 函数实际签名

> 直接来自源码，用于开发时直接调用。

### 6.1 CommunityClient（@aastar/community）

```typescript
class CommunityClient {
  // ✅ 实现
  async checkLaunchRequirements(
    address?: Address,
    requiredAmount?: bigint
  ): Promise<RoleRequirement>

  // ✅ 实现（3步骤：Approve → Register → Configure）
  async launchCommunity(config: {
    name: string;
    ensName?: string;
    website?: string;
    description?: string;
    logoURI?: string;
    stakeAmount: bigint;   // e.g. 30n * 10n**18n
    entryBurn?: bigint;    // e.g. 3n * 10n**18n
    sbtRules?: SBTRuleConfig;
  }): Promise<{ communityId: Address; txHash: Hash }>

  // ✅ 实现（但返回 address(0)！必须监听事件）
  async issueXPNTs(params: {
    symbol: string;
    initialSupply: bigint;
    exchangeRate: bigint;  // 1e18 = 1:1 with aPNTs
  }): Promise<{ xpntsAddress: Address; txHash: Hash }>
  // ⚠️ xpntsAddress 为 address(0)，真实地址从 xPNTsTokenDeployed 事件解析

  // ❌ 未实现（抛出 Error）→ 改用 registryActions.configureRole()
  async configureSBTRules(rules: SBTRuleConfig): Promise<Hash>

  // ❌ 未实现（抛出 Error）→ 改用多合约聚合查询
  async getCommunityStats(communityId: Address): Promise<CommunityStats>
}
```

**xPNTsFactory 直接调用（deployxPNTsToken 真实参数）：**

```typescript
// 当 issueXPNTs 不满足需求时，直接 viem 调用
await viem.writeContract({
  address: XPNTS_FACTORY_ADDRESS,
  abi: xPNTsFactoryABI,
  functionName: 'deployxPNTsToken',
  args: [
    name,          // e.g. "AAStar Community Points"
    symbol,        // e.g. "aPNTs"
    communityName, // e.g. "AAStar"
    communityENS,  // e.g. "aastar.eth"
    exchangeRate,  // e.g. 1n * 10n**18n（1:1）
    paymasterAOA,  // V4 Paymaster 地址（无时传 address(0)）
  ]
});
// 从 xPNTsTokenDeployed(community, tokenAddress, name, symbol) 事件获取真实地址
```

### 6.2 PaymasterOperatorClient（@aastar/operator）

```typescript
class PaymasterOperatorClient {
  // ✅ 5步骤：检查 → Approve(2x) → registerRoleSelf → 可选存入aPNTs
  async registerAsSuperPaymasterOperator(params?: {
    stakeAmount?: bigint;   // 默认 50 GT
    depositAmount?: bigint; // 可选初始 aPNTs 存入
  }): Promise<Hash>

  // ✅ 带幂等检查：检查 → 查询现有 Paymaster → 部署 → 注册 ROLE_PAYMASTER_AOA
  async deployAndRegisterPaymasterV4(params?: {
    stakeAmount?: bigint;   // 默认 30 GT
    salt?: bigint;          // 确定性部署盐值
    priceFeed?: Address;    // ETH/USD 喂价，默认 Sepolia 地址
  }): Promise<{
    paymasterAddress: Address;
    deployHash: Hash;
    registerHash: Hash;
  }>

  // ✅ approve aPNTs → superPaymaster.deposit(amount)
  async depositCollateral(amount: bigint): Promise<Hash>

  // ✅ superPaymaster.withdrawTo(to, amount)
  async withdrawCollateral(to: Address, amount: bigint): Promise<Hash>

  // ✅ 需要 ROLE_PAYMASTER_SUPER + ROLE_COMMUNITY 双重验证
  async configureOperator(
    xPNTsToken?: Address,    // 必须是 xPNTsFactory 部署的，否则拒绝
    treasury?: Address,
    exchangeRate?: bigint    // 1e18 = 1:1
  ): Promise<Hash>

  // ✅ superPaymaster.unlockStake()
  async initiateExit(): Promise<Hash>

  // ✅ superPaymaster.withdrawStake(to)
  async withdrawStake(to: Address): Promise<Hash>

  // ✅ 返回完整 OperatorConfig
  async getOperatorDetails(operator?: Address): Promise<{
    aPNTsBalance: bigint;
    exchangeRate: bigint;
    isConfigured: boolean;
    isPaused: boolean;
    xPNTsToken: Address;
    reputation: number;       // 0-100
    minTxInterval: number;
    treasury: Address;
    totalSpent: bigint;
    totalTxSponsored: bigint;
  }>
}
```

### 6.3 registryActions（@aastar/core L1）

```typescript
// 所有函数均通过 viem client 扩展调用
const registry = client.extend(registryActions(registryAddress));

// 角色常量（链上计算）
await registry.ROLE_COMMUNITY()       // keccak256("COMMUNITY")
await registry.ROLE_PAYMASTER_SUPER() // keccak256("PAYMASTER_SUPER")
await registry.ROLE_PAYMASTER_AOA()   // keccak256("PAYMASTER_AOA")
await registry.ROLE_ENDUSER()         // keccak256("ENDUSER")

// 查询
await registry.hasRole({ roleId, user })          // → boolean
await registry.getRoleConfig({ roleId })           // → RoleConfig
await registry.getUserRoles({ user })              // → Hex[]（角色列表）
await registry.getCreditLimit({ user })            // → bigint
await registry.globalReputation({ user })          // → bigint

// 写操作（需要签名）
await registry.registerRoleSelf({ roleId, data: '0x' })
// ⚠️ ROLE_ENDUSER 幂等（可多次注册，加入不同社区）
// ⚠️ PAYMASTER_SUPER/AOA 需先有 ROLE_COMMUNITY

await registry.exitRole({ roleId })

// Admin 操作（onlyOwner/onlyRoleOwner）
await registry.adminConfigureRole({
  roleId,
  minStake: 30n * 10n**18n,
  entryBurn: 3n * 10n**18n,
  exitFeePercent: 500n,   // BPS，500=5%
  minExitFee: 1n * 10n**18n
})
```

### 6.4 superPaymasterActions（@aastar/core L1）

```typescript
const sp = client.extend(superPaymasterActions(superPaymasterAddress));

// Operator 配置（需要 ROLE_PAYMASTER_SUPER + ROLE_COMMUNITY）
await sp.configureOperator({ xPNTsToken, opTreasury, exchangeRate })
await sp.setOperatorPaused({ operator, paused: true })     // Admin: 紧急暂停
await sp.setProtocolFee({ newFeeBPS: 200n })               // Admin
await sp.setTreasury({ treasury })                          // Admin

// 存取
await sp.deposit({ amount })
await sp.withdrawTo({ to, amount })
await sp.unlockStake()
await sp.withdrawStake({ to })

// 查询
await sp.operators({ operator })   // → OperatorConfig
await sp.cachedPrice()              // → { price, updatedAt, roundId, decimals }
```

### 6.5 SBT 权限（关键修正）

```typescript
// MySBT 的 mint 路径：
// 1. Registry.registerRole() 内部自动调用 MySBT.mintForRole(user, roleId, data)
//    → 只有 Registry 地址可以调用 mintForRole（onlyRegistry）
// 2. DAO multisig 调用 MySBT.airdropMint(user, data)
//    → 只有 daoMultisig 地址可以调用（onlyDAOMultisig）
// ❌ communityOwner 无法直接 mint SBT
// ❌ 任何 EOA 直接调用 mintForRole 会 revert

// 所以"社区 Admin 给成员发 SBT"的唯一路径：
// A. 引导成员自己调用 registerRoleSelf(ROLE_ENDUSER) → Registry 自动 mint SBT
// B. DAO multisig 调用 airdropMint（需要 DAO 签名，前端需 Safe wallet 集成）
```

---

## 七、新增模块设计（精确版）

### 7.1 registry.module（NestJS）

```typescript
// GET /api/v1/registry/roles/:address
// 返回用户角色列表和每个角色的质押详情
async getUserRolesWithStake(address: string): Promise<{
  roles: Array<{
    roleId: string;
    roleName: string;   // COMMUNITY | PAYMASTER_SUPER | PAYMASTER_AOA | ENDUSER
    stakeAmount: string;
    stakedAt: number;
    unstakeRequestedAt: number;  // 0 = 未发起退出
    exitFee: string;
    isLocked: boolean;
    unlockAt: number;
  }>
}>

// POST /api/v1/registry/register
async registerRole(dto: {
  roleId: string;           // e.g. "ROLE_COMMUNITY"
  passkeyAssertion: PasskeyAssertion;
}): Promise<{ txHash: string; sbtTokenId?: string }>

// GET /api/v1/registry/exit-preview/:roleId
async getExitPreview(roleId: string, address: string): Promise<{
  staked: string;
  exitFee: string;
  netAmount: string;
  canExitAt: number;    // unix timestamp（0 = 可立即退出）
}>

// POST /api/v1/registry/initiate-exit
async initiateExit(dto: { roleId: string; passkeyAssertion }): Promise<{ txHash }>

// POST /api/v1/registry/withdraw-stake
async withdrawStake(dto: { roleId: string; passkeyAssertion }): Promise<{ txHash }>
```

### 7.2 community.module（NestJS）

```typescript
// POST /api/v1/community/launch
async launchCommunity(dto: {
  name: string; ensName?: string; website?: string; logoURI?: string;
  passkeyAssertion: PasskeyAssertion;
}): Promise<{ communityId: string; txHash: string }>

// POST /api/v1/community/deploy-xpnts
async deployXPNTs(dto: {
  name: string; symbol: string;
  communityName: string; communityENS?: string;
  exchangeRate: string;
  paymasterAOA?: string;    // V4 Paymaster（没有传"0x0...0"）
  passkeyAssertion: PasskeyAssertion;
}): Promise<{ xpntsAddress: string; txHash: string }>
// 内部：调用 issueXPNTs，如 address(0) 则解析 xPNTsTokenDeployed 事件

// POST /api/v1/community/configure-sbt
async configureSBTRules(dto: {
  minStake: string; maxSupply: string; mintPrice: string;
  passkeyAssertion;
}): Promise<{ txHash }> // 直接 viem 调用 registry.configureRole()

// GET /api/v1/community/stats
async getCommunityStats(communityId: string): Promise<{
  totalMembers: number;        // getRoleUserCount(ROLE_ENDUSER)
  totalStaked: string;         // 聚合 GTokenStaking
  xpntsAddress: string;        // xPNTsFactory.getTokenAddress(communityId)
  xpntsSupply: string;         // xPNTsToken.totalSupply()
  reputationAvg: number;
}>

// GET /api/v1/community/members?offset=&limit=
async getMembers(): Promise<{ members: Array<{ address, sbtId, joinedAt, isActive }> }>
```

### 7.3 operator.module（NestJS）

```typescript
// POST /api/v1/operator/register-spo
async registerSPO(dto: {
  stakeAmount?: string;    // 默认 "50000000000000000000"（50 GT）
  depositAmount?: string;  // 可选 aPNTs 初始存入
  passkeyAssertion;
}): Promise<{ txHash }>   // 内部调用 PaymasterOperatorClient.registerAsSuperPaymasterOperator()

// POST /api/v1/operator/register-v4
async registerV4(dto: {
  stakeAmount?: string;    // 默认 "30000000000000000000"（30 GT）
  passkeyAssertion;
}): Promise<{ paymasterAddress, deployHash, registerHash }>

// POST /api/v1/operator/configure
async configure(dto: {
  xPNTsToken: string;      // 必须是 xPNTsFactory 认证地址
  treasury: string;
  exchangeRate: string;    // 建议 "1000000000000000000"（1e18）
  passkeyAssertion;
}): Promise<{ txHash }>

// GET /api/v1/operator/details
async getDetails(address?: string): Promise<OperatorConfig>

// POST /api/v1/operator/deposit-collateral
// POST /api/v1/operator/withdraw-collateral
// POST /api/v1/operator/exit
```

### 7.4 admin.module（NestJS）

```typescript
// 以下所有操作均需 onlyOwner（Protocol Admin）

// GET /api/v1/admin/protocol-status → 协议全状态
// POST /api/v1/admin/configure-role → adminConfigureRole
// POST /api/v1/admin/set-protocol-fee → setProtocolFee
// POST /api/v1/admin/pause-operator → setOperatorPaused（紧急）
// POST /api/v1/admin/replenish-gtoken-pool → 将 GToken transfer 到销售合约
// POST /api/v1/admin/admin-mint-apnts → aPNTs adminMint（待销售合约部署）
// POST /api/v1/admin/replenish-apnts-pool → communityOwner mint aPNTs 补池
```

### 7.5 sale.module（NestJS + TypeORM）

```typescript
// 定时任务：每5分钟从链上 getLogs 同步到 SQLite/PostgreSQL
@Cron('0 */5 * * * *')
async syncSaleEvents() {
  // GTokenPurchased events → gtoken_sales 表
  // APNTsMinted events → apnts_mints 表
}

// GET /api/v1/sale/gtoken?buyer=&offset=&limit=   → GToken 购买历史
// GET /api/v1/sale/apnts?operator=&offset=&limit= → aPNTs Mint 历史
// GET /api/v1/sale/stats                           → 各层进度/总收入/当前层
// GET /api/v1/sale/current-tier                    → 当前层信息（实时读链）
```

---

## 八、Next.js 前端页面设计（精确版）

### 8.1 `/role` - 角色中心

```
角色检测页（用户登录后首先跳转）
├── 读取链上角色（GET /api/v1/registry/roles/:address）
├── 展示当前角色卡片
│   ├── Protocol Admin → 进入 /admin（仅检测到 owner 地址时显示）
│   ├── Community Admin → 进入 /community
│   ├── SPO / V4 Operator → 进入 /operator
│   └── End User / 无角色 → 进入 /user（显示可注册的角色引导）
└── 各角色所需 GT 余额（PreflightCheck）
```

### 8.2 `/community` - 社区管理

```
community/
├── page.tsx           → 总览
│   ├── 已有社区：显示社区卡片（communityId / xPNTs地址 / 成员数）
│   └── 未创建：引导 → /community/launch
├── launch/page.tsx    → 创建社区向导
│   ├── PreflightCheck（GToken ≥ 33）
│   ├── Step 1: 填写社区信息（name/ensName/website/logo）
│   ├── Step 2: [Approve GToken] → MultiStepTx（1/3）
│   ├── Step 3: [Register ROLE_COMMUNITY] → MultiStepTx（2/3）
│   └── Step 4: [Configure] → MultiStepTx（3/3）→ 完成跳转总览
├── tokens/page.tsx    → xPNTs 管理
│   ├── 已部署：显示地址/符号/totalSupply/exchangeRate
│   ├── 未部署：引导部署向导
│   │   ├── 填写：name/symbol/communityENS/exchangeRate/paymasterAOA
│   │   ├── [部署 xPNTs] → TX → 解析 xPNTsTokenDeployed 事件获取地址
│   │   └── 成功后显示合约地址
│   └── 运营：mint aPNTs 到销售合约池（communityOwner.mint → replenishPool）
├── members/page.tsx   → 成员管理
│   ├── 成员列表（from /api/v1/community/members）
│   ├── 每个成员：地址/SBT ID/加入时间/状态
│   └── ⚠️ airdropMint 按钮（仅在有 DAO multisig 时显示，需 Safe 集成）
└── sbt-rules/page.tsx → SBT 规则配置
    ├── 当前规则展示（minStake/maxSupply/mintPrice）
    └── [修改规则] → 直接 viem 调用 registry.configureRole()
```

### 8.3 `/operator` - 运营管理

```
operator/
├── page.tsx           → 运营总览
│   ├── SPO/V4 状态展示（getOperatorDetails）
│   ├── aPNTs 余额 / reputation / isPaused
│   └── 未注册：引导 → /operator/register
├── register/page.tsx  → 注册向导
│   ├── Tab 1: SPO（SuperPaymaster Operator）
│   │   ├── PreflightCheck: ✅ ROLE_COMMUNITY / ✅ GT ≥ 55
│   │   ├── 输入：质押量（50 GT）/ 初始 aPNTs 存入量
│   │   ├── MultiStepTx（1/4）Approve GToken
│   │   ├── MultiStepTx（2/4）Register ROLE_PAYMASTER_SUPER
│   │   ├── MultiStepTx（3/4）Approve aPNTs
│   │   └── MultiStepTx（4/4）Deposit aPNTs
│   └── Tab 2: V4 Paymaster Operator
│       ├── PreflightCheck: ✅ ROLE_COMMUNITY / ✅ GT ≥ 33
│       ├── MultiStepTx（1/2）Approve GToken
│       └── MultiStepTx（2/2）Deploy + Register（返回 paymasterAddress）
├── configure/page.tsx → configureOperator
│   ├── xPNTs Token（从 xPNTsFactory.getTokenAddress 查询）
│   ├── Treasury 地址（默认=自己）
│   ├── Exchange Rate（默认 1e18，即 1:1）
│   └── [提交配置] → Passkey 确认 → TX
├── collateral/page.tsx → aPNTs 存取（SPO）
│   ├── 当前 aPNTs 抵押余额
│   ├── [存入 aPNTs]：输入量 → approve → deposit
│   └── [提取 aPNTs]：输入量 → withdrawTo
└── exit/page.tsx       → 退出流程
    ├── ExitFeePreview（staked / fee / netAmount）
    ├── ⚠️ 30天锁定警告
    ├── [发起退出] → initiateExit() → TX
    ├── 倒计时展示（CountdownTimer）
    └── [到期提取] → 批量 TX（withdrawCollateral + unlockStake + withdrawStake + exitRole）
```

### 8.4 `/admin` - 协议管理（Protocol Admin）

```
admin/
├── page.tsx               → 协议全状态总览
│   ├── 所有角色配置（minStake/entryBurn/exitFee）
│   ├── SuperPaymaster 全局配置（protocolFee/treasury）
│   └── 活跃 Operator 列表（getLogs OperatorConfigured）
├── roles/page.tsx         → 角色参数配置
│   ├── 各角色当前参数展示
│   ├── [修改参数] → adminConfigureRole → TX
│   └── ⚠️ UI 提示：修改将在 24h 后对外公告（非链上 Timelock）
├── superpaymaster/page.tsx → SP 全局配置
│   ├── 设置协议费率（setProtocolFee）
│   ├── 设置协议国库地址（setTreasury）
│   └── Operator 列表 + [紧急暂停] 按钮
├── mint/page.tsx          → 池管理（待销售合约部署后启用）
│   ├── GToken 池当前余额 / [充值池]（transfer GToken 到销售合约）
│   ├── aPNTs 池当前余额 / [aPNTs adminMint]（直接 mint，填 reason）
│   └── aPNTs 池 / [communityOwner 充池]（mint → replenishPool）
└── transfer-dao/page.tsx  → 移交 DAO
    ├── 当前 Owner 地址
    ├── 目标 DAO/multisig 地址输入
    ├── ⚠️ 不可逆操作双重确认弹窗
    └── [确认移交] → transferOwnership → TX
```

### 8.5 `/sale` - Token 销售

```
sale/
└── page.tsx
    ├── GToken 购买区
    │   ├── 当前层：Tier N「主题名」$X.XX/GT
    │   ├── TierProgress（currentTierRevenue / revenueTarget）
    │   ├── 个人剩余限额（getRemainingPersonalLimit）
    │   ├── 支付：USDC | USDT | WETH | WBTC | ETH
    │   ├── 金额输入 → getQuote → 可得 GT 实时预估
    │   ├── 截断提示（如超限额，显示调整后的实际购买量）
    │   ├── 接收地址（默认=自己，可修改）
    │   └── [购买 GToken] → Passkey → viem writeContract
    ├── aPNTs 购买区
    │   ├── 当前价格 $X.XX / 服务能力预警（$10k/月）
    │   └── [购买 aPNTs] → Passkey → viem writeContract
    └── 全局销售历史（GET /api/v1/sale/stats + /sale/gtoken）
```

### 8.6 公共组件

```typescript
// components/MultiStepTx.tsx
interface MultiStepTxProps {
  steps: Array<{ label: string; action: () => Promise<Hash> }>;
  onComplete: (hashes: Hash[]) => void;
}
// 展示：[1/4] Approve GToken ✅ 0x... | [2/4] Register... 🔄

// components/PreflightCheck.tsx
interface PreflightCheckProps {
  checks: Array<{
    label: string;
    pass: boolean;
    action?: { label: string; href: string };  // 引导链接
  }>;
}

// components/TierProgress.tsx
// 展示收入驱动阶梯进度条（currentTierRevenue / revenueTarget）

// components/CountdownTimer.tsx
// 30天锁定期倒计时（unstakeRequestedAt + lockDuration - now）
```

---

## 九、销售合约集成方案

> 详细设计见 `contracts/sale/docs/sale-plan.md v1.2`，本节只记录集成关键点。

### GTokenSaleContract 核心接口（待实现）

```solidity
struct Tier {
    uint256 revenueTarget;    // 本层收入目标（USD, 6 decimals）
    uint256 priceUSD;         // 本层单价（USD, 6 decimals，150000=$0.15）
    uint256 perPersonMaxUSD;  // 个人上限（0=自动1% of revenueTarget）
    bool whitelistRequired;   // 默认 false
}

function initTiers(uint256[] revenueTargets, uint256 startPriceUSD,
    uint256 increaseRateBPS, bool[] whitelistFlags) external onlyOwner;
function buyGToken(address paymentToken, uint256 paymentAmount, address recipient,
    BuyPermit permit, bytes permitSig) external payable
    returns (uint256 gtokenAmount, uint256 actualUSD, bool truncated);
function getQuote(address paymentToken, uint256 paymentAmount)
    external view returns (uint256 gtokenAmount, uint256 actualUSD, bool wouldTruncate);
function getRemainingPersonalLimit(address buyer, uint256 tierIndex)
    external view returns (uint256 remainingUSD);
```

### 初始 4 层配置

| 层 | 主题 | 收入目标 | 单价 | 个人上限 |
|---|---|---|---|---|
| 1 | 用爱发电 | $1,200 | $0.1500 | $12 |
| 2 | 研究探索 CMUBRC | $8,000 | $0.1680 | $80 |
| 3 | Mycelium 社区 | $33,600 | $0.1882 | $336 |
| 4 | AAStar 基础设施 | $86,400 | $0.2107 | $864 |

---

## 十、仍需用户确认的问题

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| **Q1** | DAO multisig 地址是什么？是否有 Safe 钱包？ | `airdropMint` 功能是否实现；admin portal 是否需要 Safe 集成 | 如无 DAO multisig，airdropMint 功能跳过，仅支持用户自主注册 |
| **Q2** | deployxPNTsToken 的 paymasterAOA：社区未部署 V4 时传什么？ | xPNTs 部署页面的参数设计 | 建议传 `address(0)` 或默认 AAStar 的 V4 地址 |
| **Q3** | 开发目标网络：仅 Sepolia，还是同时支持 OP Sepolia？ | 是否需要网络切换 UI | 建议 Phase 1 固定 Sepolia，Phase 2 加网络切换 |
| **Q4** | GTokenStaking 合约地址已确认（@aastar/core），但质押锁定期是否是链上配置的 30 天？需不需要读链？ | 退出流程的倒计时计算 | 建议读链 `getRoleConfig().roleLockDuration` 动态获取 |
| **Q5** | 销售合约由谁部署？你（Protocol Admin）还是需要我（开发者）部署？ | Phase 2 开发时间节点 | 建议 Phase 2 开发完合约后一起部署 |

---

## 十一、修订后的开发计划

### Phase 0：环境配置（2天）✅ 可立即开始

- [ ] 进入 yetanotheraa 目录：`pnpm install`
- [ ] 写入 `.env` 文件（按第四节配置）
- [ ] `pnpm dev`（后端 + 前端同时启动）
- [ ] 验证：注册账户 → Passkey 登录 → 查余额 → Gasless 转账
- [ ] 在 aastar/ 中：`pnpm add @aastar/sdk @aastar/core viem`
- [ ] 在 aastar-frontend/ 中：`pnpm add @aastar/core viem`
- [ ] 验证 `@aastar/core` 的合约地址常量可以正常 import

### Phase 1：角色管理模块（1.5-2周）

**后端 NestJS 新增模块（按优先级）：**
1. `registry.module`（角色查询 + 注册 + 退出）— P0
2. `operator.module`（SPO + V4 注册/配置/退出）— P0
3. `community.module`（launchCommunity + deployXPNTs）— P0
4. `admin.module`（configureRole + pauseOperator）— P1

**前端 Next.js 新增页面（按优先级）：**
1. `/role` — 角色检测入口 — P0
2. `/operator/register` — SPO + V4 注册向导 — P0
3. `/community/launch` — 社区创建向导 — P0
4. `/operator/configure` + `/operator/collateral` — P0
5. `/community/tokens` — xPNTs 部署（注意解析事件获取地址）— P1
6. `/admin/*` — 协议管理 — P1
7. `/operator/exit` — 退出流程 — P1
8. `/community/members` + `/community/sbt-rules` — P2

### Phase 2：销售合约（2-2.5周）

1. `GTokenSaleContract.sol` 实现（收入驱动 + 个人截断）
2. `APNTsSaleContract.sol` 实现（浮动定价 + adminMint）
3. Foundry 测试（Sepolia fork）
4. 部署到 Sepolia，更新合约地址
5. NestJS `sale.module`（事件缓存 + 定时同步）
6. Next.js `/sale` 页面（购买流程 + 进度展示）
7. `/admin/mint` 充池管理页面

### Phase 3（未来）：SDK 提炼

将 Registry/Community/Operator/Sale 逻辑封装进 `@aastar/sdk` 并提 PR。

---

*文档版本 v3.1 - 深度源码分析后的精确集成方案*
*参考来源：*
- *aastar-sdk packages/core/src/addresses.ts（合约地址）*
- *aastar-sdk packages/community/src/index.ts（CommunityClient）*
- *aastar-sdk packages/operator/src/PaymasterOperatorClient.ts（Operator）*
- *aastar-sdk packages/core/src/actions/registry.ts（Registry Actions）*
- *SuperPaymaster/contracts/src/core/Registry.sol（合约逻辑）*
- *SuperPaymaster/contracts/src/tokens/xPNTsFactory.sol（deployxPNTsToken 参数）*
- *SuperPaymaster/contracts/src/tokens/MySBT.sol（airdropMint 权限）*
- *yetanotheraa（已有实现参考）*
