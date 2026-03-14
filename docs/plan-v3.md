# AAStar 管理界面产品设计文档 v3.0

> **架构重大更新**：基于 YetAnotherAA 现有实现构建，不再新建项目
> 最后更新：2026-03-14

---

## 目录

1. [三层架构总览](#一三层架构总览)
2. [YetAnotherAA 现有功能清单](#二yetanotheraa-现有功能清单)
3. [AASTAR_API_URL 澄清](#三aastar_api_url-澄清)
4. [配置环境变量确认](#四配置环境变量确认)
5. [新增功能需求（我们要加什么）](#五新增功能需求)
6. [NestJS 后端扩展设计](#六nestjs-后端扩展设计)
7. [Next.js 前端页面扩展](#七nextjs-前端页面扩展)
8. [销售合约集成方案](#八销售合约集成方案)
9. [角色体系与合约地址（不变）](#九角色体系与合约地址)
10. [修订后的开发计划](#十修订后的开发计划)

---

## 一、三层架构总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Application Layer                                 │
│                       (yetanotheraa/ submodule)                          │
│                                                                           │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │   aastar-frontend            │  │   aastar (NestJS Backend)         │  │
│  │   Next.js 16 + React 19      │  │   port 3000                       │  │
│  │   Tailwind CSS 4             │  │                                   │  │
│  │                              │  │  ── 已有模块 ──                   │  │
│  │  ── 已有页面 ──              │  │  auth/    email+passkey+JWT        │  │
│  │  /auth/*   登录/注册         │  │  account/ smart account (ERC-4337) │  │
│  │  /dashboard 账户总览         │  │  transfer/ gasless UserOp          │  │
│  │  /transfer  gasless 转账     │  │  kms/     WebAuthn + BLS           │  │
│  │  /tokens   代币列表          │  │  paymaster/ 配置                   │  │
│  │  /nfts     NFT列表           │  │  guardian/ 恢复机制                │  │
│  │  /address-book 通讯录        │  │                                   │  │
│  │  /paymaster 配置             │  │  ── 新增模块 ──                   │  │
│  │                              │  │  registry/  角色注册/质押/退出    │  │
│  │  ── 新增页面 ──              │  │  community/ 社区创建/xPNTs/SBT    │  │
│  │  /role/*   角色管理入口      │  │  operator/  SPO + V4 Operator     │  │
│  │  /community/* 社区管理       │  │  admin/     协议配置 (onlyOwner)  │  │
│  │  /operator/*  运营管理       │  │  sale/      销售历史 SQLite 缓存  │  │
│  │  /admin/*  协议管理          │  │                                   │  │
│  │  /sale     Token 销售        │  │  swagger: /api-docs               │  │
│  └──────────────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────▼──────────────────────────┐
          │                    SDK Layer                         │
          │                                                      │
          │  @yaaa/sdk (local workspace in yetanotheraa)        │
          │  • YAAAClient (browser)  → passkey + BLS            │
          │  • YAAAServerClient      → account + transfer       │
          │  • KmsClient             → WebAuthn ceremonies      │
          │                                                      │
          │  @aastar/sdk v0.16.23                               │
          │  • createCommunityClient (L3) → 社区生命周期        │
          │  • PaymasterOperatorClient (L2) → SPO/V4 操作       │
          │  • registryActions (L1)  → 角色/质押直接调用        │
          │                                                      │
          │  @aastar/core → 合约地址 + ABI                      │
          │                                                      │
          │  viem (直接调用销售合约，绕过SDK，未来提炼入SDK)     │
          └─────────────────────────┬──────────────────────────┘
                                    │
          ┌─────────────────────────▼──────────────────────────┐
          │               Contract Layer (Sepolia)               │
          │                                                      │
          │  ── 已部署 ──                ── 待部署 ──           │
          │  Registry                   GTokenSaleContract       │
          │  GToken + GTokenStaking     APNTsSaleContract        │
          │  SuperPaymaster                                      │
          │  xPNTsFactory + aPNTs                               │
          │  MySBT                                               │
          │  EntryPoint v0.7 + M4Factory                        │
          └──────────────────────────────────────────────────────┘
```

**关键架构决策**：

| 决策 | 内容 |
|---|---|
| 基础框架 | 在 YetAnotherAA 上扩展，不新建项目 |
| 后端 | NestJS（新增模块，不改现有模块） |
| 前端 | Next.js App Router（新增路由段） |
| 账户认证 | 直接复用 YetAnotherAA 已有 passkey 流程 |
| 销售合约调用 | 前端 viem 直接调用（Phase 2 起），不经 SDK |
| 未来 SDK 提炼 | Phase 3 后将销售合约、Registry 封装进 @aastar/sdk |

---

## 二、YetAnotherAA 现有功能清单

> 以下功能**已完整实现**，直接复用，无需重写。

### 已完成 ✅

| 模块 | 实现内容 |
|---|---|
| 用户注册 | Email + Password（bcrypt 加密），JWT 7天有效 |
| Passkey 认证 | KMS WebAuthn 注册/登录（`/auth/login/kms/*`） |
| Smart Account | ERC-4337 账户创建（M4Factory，EntryPoint v0.6/v0.7/v0.8） |
| Gasless 转账 | UserOp 构建 → Bundler → EntryPoint，Passkey 签名 |
| BLS 聚合 | gossip 网络协调，动态验证节点 |
| Gas 估算 | `POST /transfer/estimate`，前端实时展示 |
| 转账历史 | 状态轮询 + 历史列表 |
| 代币/NFT 展示 | ERC20 + ERC721 列表 |
| 通讯录 | 地址保存/管理 |
| Paymaster 配置 | `/paymaster` 页面（基本配置） |
| Guardian | 恢复机制（基本实现） |
| 数据库 | JSON adapter（开发）/ PostgreSQL（生产），可切换 |
| API 文档 | Swagger at `/api-docs` |

### 主要代码位置

```
yetanotheraa/
├── aastar/src/
│   ├── auth/          ← 认证（可直接复用）
│   ├── account/       ← Smart Account（可直接复用）
│   ├── transfer/      ← UserOp gasless（可直接复用）
│   ├── kms/           ← WebAuthn + BLS（可直接复用）
│   ├── sdk/           ← YAAAServerClient 封装（可直接复用）
│   └── database/      ← JSON/PostgreSQL adapter（扩展表结构）
├── aastar-frontend/app/
│   ├── auth/          ← 登录/注册页面（已完成）
│   ├── dashboard/     ← 账户总览（已完成）
│   ├── transfer/      ← 转账页面（已完成）
│   └── lib/yaaa.ts    ← YAAAClient + KmsClient 初始化
└── sdk/               ← @yaaa/sdk（账户/转账/passkey）
```

---

## 三、AASTAR_API_URL 澄清

**结论：无需外部配置，是 YetAnotherAA 后端自身 URL。**

```
AASTAR_API_URL = YetAnotherAA 后端地址

本地开发：http://localhost:3000/api/v1
已配置在 aastar-frontend 的环境变量中：
  NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1

生产部署时改为部署地址即可，无需向外部申请。
```

YAAAClient 的 `apiURL` 指向的就是这个地址——它是 YetAnotherAA 自己的 NestJS 后端，不是 aastar.io 的外部服务。

---

## 四、配置环境变量确认

### 已确认（本次提供）

| 变量 | 值 | 用于 |
|---|---|---|
| `KMS_API_KEY` | `kms_b3994135cfd148ec9c5be29ef0690679` | KMS WebAuthn 认证 |
| `BUNDLER_RPC_URL` | `https://api.pimlico.io/v2/11155111/rpc?apikey=pim_gcVkLnianG5Fj4AvFYhAEh` | ERC-4337 Bundler (Sepolia) |
| `BLS_SEED_NODES` | `https://v1.aastar.io` | BLS 签名聚合节点 |
| `AASTAR_API_URL` | `http://localhost:3000/api/v1` | 即 YetAnotherAA 后端自身，无需外部申请 |

### 其余配置（已知）

```env
# aastar/.env

PORT=3000
NODE_ENV=development
JWT_SECRET=<生成随机字符串>
JWT_EXPIRES_IN=7d
USER_ENCRYPTION_KEY=<32位随机字符串>

DB_TYPE=json              # 开发用 json，生产切换 postgres

CHAIN_ID=11155111         # Sepolia
ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
BUNDLER_RPC_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=pim_gcVkLnianG5Fj4AvFYhAEh

# EntryPoint v0.7 (主用)
ENTRY_POINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
DEFAULT_ENTRYPOINT_VERSION=0.7

BLS_SEED_NODES=https://v1.aastar.io

KMS_ENABLED=true
KMS_ENDPOINT=https://kms1.aastar.io
KMS_API_KEY=kms_b3994135cfd148ec9c5be29ef0690679

# aastar-frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_KMS_URL=https://kms1.aastar.io
NEXT_PUBLIC_KMS_API_KEY=kms_b3994135cfd148ec9c5be29ef0690679
NEXT_PUBLIC_BLS_SEED_NODE=https://v1.aastar.io
```

### 暂不需要

| 变量 | 说明 |
|---|---|
| `DVT_NODE_ADDRESS` | 仅注册 ROLE_DVT 时需要，Phase 1 跳过 |
| aPNTs communityOwner key | Phase 2 销售合约上线时需要 |
| GToken Owner key | Phase 2 销售合约上线时需要 |

---

## 五、新增功能需求

> 对比 YetAnotherAA 现有实现，我们需要新增的业务功能。

### 5.1 角色管理（核心新增）

YetAnotherAA 没有任何 Registry 合约交互。我们需要新增：

```
角色注册/退出（Registry.sol）
├── ROLE_COMMUNITY (Community Admin)
│   ├── 质押 30 GT + 燃烧 3 GT
│   ├── 创建社区 (launchCommunity)
│   ├── 部署 xPNTs Token (xPNTsFactory)
│   └── 配置 SBT 规则
│
├── ROLE_PAYMASTER_SUPER (SPO)
│   ├── 质押 50 GT + 燃烧 5 GT
│   ├── 存入 aPNTs 作为 Gas 抵押品
│   └── 配置 configureOperator (xPNTs / treasury / exchangeRate)
│
├── ROLE_PAYMASTER_AOA (V4 Operator)
│   ├── 质押 30 GT + 燃烧 3 GT
│   ├── 部署 PaymasterV4 合约 (PaymasterFactory)
│   └── 充值 ETH 到 Paymaster
│
├── ROLE_ENDUSER
│   ├── 质押 0.3 GT + 燃烧 0.05 GT
│   └── 获取 MySBT
│
└── Protocol Admin (合约 Owner)
    ├── adminConfigureRole (修改角色参数)
    ├── setProtocolFee / setTreasury
    └── setOperatorPaused (紧急暂停 SPO)
```

### 5.2 GToken 获取（Token 销售）

```
GToken 售卖（待部署 GTokenSaleContract）
├── 阶梯定价（收入驱动，$0.15 起，+12%/层）
├── 个人限额（1% of revenueTarget，自动截断）
├── 支付：USDC / USDT / WETH / WBTC / ETH
└── 购买历史查询（SQLite 缓存）
```

### 5.3 aPNTs 获取（浮动销售）

```
aPNTs 售卖（待部署 APNTsSaleContract）
├── 浮动定价（$0.018 - $0.030，默认 $0.02）
├── 无数量限制（服务能力 $10k/月预警）
└── adminMint 保留（绕过销售直接发放）
```

### 5.4 Pool 管理（Admin 专属）

```
充值管理
├── GToken 池充值（Owner transfer GT 到销售合约）
├── aPNTs 池充值（communityOwner mint → 销售合约）
└── aPNTs adminMint（直接 mint，填写 reason）
```

---

## 六、NestJS 后端扩展设计

> 在 `yetanotheraa/aastar/src/` 下新增模块，不改现有代码。

### 6.1 新增模块列表

```
aastar/src/
├── registry/          ← 角色注册/查询
│   ├── registry.module.ts
│   ├── registry.service.ts    ← 封装 @aastar/sdk registryActions
│   ├── registry.controller.ts
│   └── dto/
│       ├── register-role.dto.ts
│       └── exit-role.dto.ts
│
├── community/         ← 社区管理
│   ├── community.module.ts
│   ├── community.service.ts   ← createCommunityClient (L3)
│   ├── community.controller.ts
│   └── dto/
│
├── operator/          ← SPO + V4 Operator
│   ├── operator.module.ts
│   ├── operator.service.ts    ← PaymasterOperatorClient (L2)
│   └── operator.controller.ts
│
├── admin/             ← Protocol Admin（onlyOwner 操作）
│   ├── admin.module.ts
│   ├── admin.service.ts
│   └── admin.controller.ts
│
└── sale/              ← 销售历史 SQLite 缓存
    ├── sale.module.ts
    ├── sale.service.ts         ← 定期 getLogs → SQLite
    ├── sale.controller.ts
    └── entities/
        ├── gtoken-sale.entity.ts
        └── apnts-mint.entity.ts
```

### 6.2 新增 API 端点

#### Registry 模块

```
GET  /api/v1/registry/roles/:address       → 获取地址所有角色
GET  /api/v1/registry/stake-info/:role     → 获取质押信息
GET  /api/v1/registry/exit-preview/:role   → 预览退出费用
POST /api/v1/registry/register             → 注册角色（需 passkey assertion）
POST /api/v1/registry/initiate-exit        → 发起退出
POST /api/v1/registry/withdraw-stake       → 提取质押（锁定期满）
```

#### Community 模块

```
GET  /api/v1/community/stats               → 社区统计（members/staked/xpnts）
POST /api/v1/community/launch              → 创建社区（3步骤协调）
POST /api/v1/community/deploy-xpnts        → 部署 xPNTs Token
POST /api/v1/community/configure-sbt       → 配置 SBT 规则
POST /api/v1/community/airdrop-sbt         → 空投 MySBT
GET  /api/v1/community/members             → 成员列表
```

#### Operator 模块

```
GET  /api/v1/operator/details              → SPO/V4 运营详情
POST /api/v1/operator/register-spo         → 注册 SPO（4步骤）
POST /api/v1/operator/register-v4          → 部署+注册 V4 Paymaster（2步骤）
POST /api/v1/operator/deposit-collateral   → 存入 aPNTs（SPO）
POST /api/v1/operator/withdraw-collateral  → 提取 aPNTs（SPO）
POST /api/v1/operator/configure            → configureOperator
POST /api/v1/operator/exit                 → 退出流程
```

#### Admin 模块

```
GET  /api/v1/admin/protocol-status         → 协议全状态
POST /api/v1/admin/configure-role          → adminConfigureRole
POST /api/v1/admin/set-protocol-fee        → 设置协议费率
POST /api/v1/admin/pause-operator          → 紧急暂停 Operator
POST /api/v1/admin/replenish-gtoken-pool   → GToken 充池
POST /api/v1/admin/admin-mint-apnts        → aPNTs adminMint
POST /api/v1/admin/replenish-apnts-pool    → aPNTs 充池
```

#### Sale 模块（历史缓存）

```
GET  /api/v1/sale/gtoken?buyer=&offset=&limit=    → GToken 购买历史
GET  /api/v1/sale/apnts?operator=&offset=&limit=  → aPNTs Mint 历史
GET  /api/v1/sale/stats                           → 销售统计（各层进度/总收入）
GET  /api/v1/sale/current-tier                    → 当前层信息
```

### 6.3 数据库扩展（新增实体）

在现有 TypeORM 体系中新增表：

```typescript
// GToken 购买记录（从链上 getLogs 缓存）
@Entity('gtoken_sales')
class GTokenSale {
  @PrimaryColumn() txHash: string;
  @Column() buyer: string;
  @Column() recipient: string;
  @Column() paymentToken: string;
  @Column('decimal') paymentAmount: string;
  @Column('decimal') gtokenAmount: string;
  @Column('decimal') priceUSD: string;
  @Column() tierIndex: number;
  @Column() truncated: boolean;
  @Column() blockNumber: number;
  @Column() timestamp: number;
}

// aPNTs Mint 记录
@Entity('apnts_mints')
class APNTsMint {
  @PrimaryColumn() txHash: string;
  @Column() operator: string;
  @Column() recipient: string;
  @Column('decimal') amount: string;
  @Column({ nullable: true }) paymentToken: string;
  @Column('decimal', { nullable: true }) paymentAmount: string;
  @Column('decimal', { nullable: true }) priceUSD: string;
  @Column() reason: string;  // 'sale' | 'admin_mint' | 'airdrop'
  @Column() blockNumber: number;
  @Column() timestamp: number;
}

// 链上事件同步状态
@Entity('sync_state')
class SyncState {
  @PrimaryColumn() contractAddress: string;
  @Column() lastSyncedBlock: number;
  @Column() updatedAt: Date;
}
```

---

## 七、Next.js 前端页面扩展

> 在 `yetanotheraa/aastar-frontend/app/` 下新增路由段。

### 7.1 路由总览（新增部分）

```
app/
├── role/
│   └── page.tsx              → 角色检测入口（读链上角色 → 跳转对应 Portal）
│
├── community/
│   ├── page.tsx              → 社区总览（未创建 → 引导）
│   ├── launch/page.tsx       → 创建社区向导（3步骤）
│   ├── members/page.tsx      → 成员列表 + SBT airdropMint
│   ├── tokens/page.tsx       → xPNTs 管理
│   └── sbt-rules/page.tsx    → SBT 规则配置
│
├── operator/
│   ├── page.tsx              → 运营总览（aPNTs/reputation/gas赞助统计）
│   ├── register/page.tsx     → 注册向导（SPO Tab + V4 Tab）
│   ├── collateral/page.tsx   → aPNTs 存取（SPO）
│   ├── deposit/page.tsx      → ETH 充值（V4）
│   ├── configure/page.tsx    → configureOperator
│   └── exit/page.tsx         → 退出流程（倒计时 + 批量提取）
│
├── admin/
│   ├── page.tsx              → 协议状态总览
│   ├── roles/page.tsx        → 角色参数配置（adminConfigureRole）
│   ├── superpaymaster/page.tsx → SP 全局配置 + Operator 管理
│   ├── mint/page.tsx         → GToken 充池 / aPNTs mint 管理
│   └── transfer-dao/page.tsx → 移交 DAO（双确认）
│
└── sale/
    └── page.tsx              → Token 销售页（GToken + aPNTs）
```

### 7.2 复用现有组件

YetAnotherAA 已有的组件可直接复用：

| 现有组件/模式 | 复用方式 |
|---|---|
| `useAuth` hook | 所有新页面的认证状态 |
| `yaaa.passkey.verifyTransaction` | 所有写操作的 Passkey 确认 |
| `axios` instance with JWT | 所有新 API 调用 |
| `react-hot-toast` | 操作结果提示 |
| Layout + 导航 | 新页面接入现有导航栏（增加菜单项） |
| `CopyButton` | 地址展示 |

### 7.3 新增公共组件

```
components/
├── MultiStepTx.tsx       → 多步骤 TX 进度条（N/N + TX Hash 链接）
├── PreflightCheck.tsx    → 前置条件检查面板（✅/❌ + 引导链接）
├── TokenBalance.tsx      → GT/aPNTs/ETH 余额（实时，支持多 token）
├── ExitFeePreview.tsx    → 退出费预览（已质押/退出费/净得）
├── RoleStatusBadge.tsx   → 角色标识（图标 + 质押状态）
├── TierProgress.tsx      → GToken 阶梯进度条（收入进度）
└── CountdownTimer.tsx    → 30天锁定期倒计时
```

### 7.4 销售页面（`/sale`）详细设计

```
/sale
├── GToken 购买区
│   ├── 当前层信息（层级名 + 价格 + 收入进度条）
│   ├── 个人剩余限额展示
│   ├── 支付 token 选择（USDC/USDT/WETH/WBTC/ETH）
│   ├── 金额输入 → 实时 getQuote → 可得 GT 预估
│   ├── 截断提示（如超出限额，显示调整后金额）
│   ├── 接收地址（默认=自己，可修改）
│   ├── [购买 GToken] → Passkey 确认 → viem sendTransaction
│   └── 我的购买记录（来自 /api/v1/sale/gtoken?buyer=me）
│
├── aPNTs 购买区
│   ├── 当前价格 + 服务能力进度（月度 $10k 预警）
│   ├── 支付 token 选择 + 金额输入 + 可得 aPNTs 预估
│   ├── [购买 aPNTs] → Passkey 确认 → viem sendTransaction
│   └── 我的购买记录
│
└── 全局销售统计（来自 /api/v1/sale/stats）
    ├── 各层已售 GT / 已收入 USD
    ├── 当前活跃层进度
    └── aPNTs 累计 Mint 量
```

---

## 八、销售合约集成方案

> 销售合约直接用 viem 调用，**不经过 @aastar/sdk**（未来再提炼）。

### 8.1 前端直接调用模式

```typescript
// lib/saleContracts.ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';

// 从 /api/v1/sale/current-tier 获取当前层信息
// 前端 viem 只读调用
const publicClient = createPublicClient({ chain: sepolia, transport: http() });

// getQuote（只读）
const [gtokenAmount, actualUSD, wouldTruncate] = await publicClient.readContract({
  address: GTOKEN_SALE_CONTRACT,
  abi: GTokenSaleABI,
  functionName: 'getQuote',
  args: [paymentToken, paymentAmount]
});

// buyGToken（写，需要签名）
// 签名来源：YAAAClient passkey → KMS → ECDSA signature → viem wallet
const walletClient = createWalletClient({...});  // 使用 KMS signer
await walletClient.writeContract({
  address: GTOKEN_SALE_CONTRACT,
  abi: GTokenSaleABI,
  functionName: 'buyGToken',
  args: [paymentToken, paymentAmount, recipient, emptyPermit, '0x'],
  value: isETH ? paymentAmount : 0n
});
```

### 8.2 Signer 来源（衔接 YetAnotherAA）

```
Passkey 签名流程（已有）
  → yaaa.passkey.verifyTransaction() → KmsManager.signHash()
  → 返回 ECDSA signature

衔接 viem walletClient
  → 构造 custom account（viem Account）
  → signTransaction 使用 KMS 签名
  → 通过 BUNDLER_RPC_URL 发送 UserOp（gasless）
  → 或直接 sendTransaction（用户自付 gas，销售时用 USDC 付所以 ETH gas 由用户出）
```

### 8.3 事件同步（后端 SQLite 缓存）

```
NestJS ScheduleModule（每5分钟）
  → viem getLogs(GTokenSaleContract, GTokenPurchased, from: lastSyncedBlock)
  → 批量 insert 到 gtoken_sales 表
  → 更新 sync_state.lastSyncedBlock

同样同步 APNTsMinted 事件 → apnts_mints 表
```

---

## 九、角色体系与合约地址

> 详细参见 plan.md v2.1（不变）。

### Sepolia 合约地址（@aastar/core v0.16.23）

```typescript
const SEPOLIA_CONTRACTS = {
  registry:         '0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788',
  gToken:           '0x9ceDeC089921652D050819ca5BE53765fc05aa9E',
  gTokenStaking:    '0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC',
  superPaymaster:   '0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A',
  paymasterFactory: '0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d',
  xPNTsFactory:     '0x6EafdA3477F3eec1F848505e1c06dFB5532395b6',
  entryPoint:       '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  aPNTs:            '0xDf669834F04988BcEE0E3B6013B6b867Bd38778d',
  mySBT:            '0x677423f5Dad98D19cAE8661c36F094289cb6171a',
  ethUsdPriceFeed:  '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  // 待部署
  gTokenSale:       'TBD',
  aPNTsSale:        'TBD',
};
```

### 角色质押参数

| 角色 | minStake | entryBurn | exitFee% | lockDuration |
|---|---|---|---|---|
| ROLE_PAYMASTER_SUPER | 50 GT | 5 GT | 10% | 30天 |
| ROLE_PAYMASTER_AOA | 30 GT | 3 GT | 10% | 30天 |
| ROLE_COMMUNITY | 30 GT | 3 GT | 5% | 30天 |
| ROLE_ENDUSER | 0.3 GT | 0.05 GT | 10% | 7天 |

---

## 十、修订后的开发计划

> 基于 YetAnotherAA 现有实现，大幅压缩 Phase 1 工作量。

### Phase 0：环境配置（2天）

- [ ] git submodule 验证（yetanotheraa/ 已加入 aastar-sdk-demo）
- [ ] 写入 `.env` 文件（KMS_API_KEY / BUNDLER_RPC_URL / BLS_SEED_NODES）
- [ ] 本地跑通 YetAnotherAA（`pnpm install` → `pnpm dev`）
- [ ] 验证：注册账户 → Passkey 登录 → 查余额 → Gasless 转账
- [ ] 安装新依赖：`@aastar/sdk` `@aastar/core` `viem`（在 aastar/）

### Phase 1：角色管理模块（1.5周）

> 目标：4 个角色 Portal 基本可用

**后端（NestJS）**
- [ ] `registry.module` — 封装 `@aastar/sdk` registryActions
  - [ ] `GET /registry/roles/:address`（getUserRoles）
  - [ ] `GET /registry/stake-info` / `exit-preview`
  - [ ] `POST /registry/register`（multi-step TX coordination）
  - [ ] `POST /registry/initiate-exit` / `withdraw-stake`
- [ ] `community.module` — createCommunityClient (L3)
  - [ ] launchCommunity / deployxPNTs / configureSBT / airdropMint
- [ ] `operator.module` — PaymasterOperatorClient (L2)
  - [ ] register-spo / register-v4 / deposit-collateral / configure / exit
- [ ] `admin.module` — onlyOwner 操作
  - [ ] configure-role / set-protocol-fee / pause-operator / replenish-pools

**前端（Next.js）**
- [ ] 导航栏扩展（根据角色动态显示菜单项）
- [ ] `/role` — 角色检测入口页（PreflightCheck）
- [ ] `/community/*` — 5个页面
- [ ] `/operator/*` — 6个页面（SPO + V4 共用）
- [ ] `/admin/*` — 5个页面
- [ ] 公共组件：MultiStepTx / PreflightCheck / ExitFeePreview / CountdownTimer

### Phase 2：销售合约开发（2周）

**合约（contracts/sale/src/）**
- [ ] `GTokenSaleContract.sol` — 收入驱动阶梯，个人限额，自动截断
- [ ] `APNTsSaleContract.sol` — 浮动定价，adminMint，服务能力预警
- [ ] Foundry 测试（fork Sepolia）
- [ ] 部署到 Sepolia，写入合约地址

**后端**
- [ ] `sale.module` + TypeORM entities（gtoken_sales / apnts_mints / sync_state）
- [ ] 定时同步任务（@nestjs/schedule，每5分钟 getLogs → DB）
- [ ] sale API endpoints（history / stats / current-tier）

**前端**
- [ ] `/sale` 页面（GToken 购买 + aPNTs 购买 + 历史）
- [ ] viem 直接合约调用（读：getQuote / getRemainingPersonalLimit）
- [ ] Passkey → KMS → viem custom account 衔接（写：buyGToken / buyAPNTs）
- [ ] TierProgress 组件（收入进度条）
- [ ] `/admin/mint` 充池管理页面

### Phase 3（未来）：SDK 提炼

- [ ] 将 Registry / Community / Operator 操作抽象为 @aastar/sdk 新 L2/L3 方法
- [ ] 将 GTokenSale / APNTsSale 操作封装进 SDK
- [ ] 提 PR 到 AAStar SDK 主仓库

---

### 任务优先级矩阵

| P0 | Phase | 任务 |
|---|---|---|
| P0 | 0 | 跑通 YetAnotherAA 本地环境 |
| P0 | 0 | 写入 .env，验证 Passkey + Gasless |
| P0 | 1 | registry.module（角色查询 + 注册） |
| P0 | 1 | `/role` + `/community/launch` + `/operator/register` |
| P0 | 1 | MultiStepTx + PreflightCheck 组件 |
| P0 | 2 | GTokenSaleContract.sol + 测试 |
| P0 | 2 | `/sale` 页面（GToken 购买流程） |
| P1 | 1 | admin.module（协议配置）|
| P1 | 1 | `/operator/exit` 退出流程 |
| P1 | 2 | APNTsSaleContract.sol |
| P1 | 2 | sale.module 事件缓存 |
| P2 | 2 | 销售数据看板 |
| P2 | 3 | SDK 提炼 |

---

*文档版本 v3.0 - 基于 YetAnotherAA 现有实现整合，三层架构，不新建项目*
*参考：plan.md v2.1（角色生命周期/数据结构详细设计）*
*参考：contracts/sale/docs/sale-plan.md v1.2（销售合约完整设计）*
