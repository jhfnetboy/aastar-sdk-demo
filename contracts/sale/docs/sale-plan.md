# GToken & aPNTs 销售方案设计

> Mycelium Protocol 冷启动销售设计 v1.1
> 日期：2026-03-13
> 参考来源：Custom-Sale-Contract / Solution.md / Design-Approach.md
> v1.1: 起始价格 $0.15 USD；v1.2: 去除 RMB 计价，统一 USD

---

## 目录

1. [协议叙事与销售哲学](#一协议叙事与销售哲学)
2. [两个价值坐标系](#二两个价值坐标系)
3. [GToken 定价模型（以收入为基准的阶梯）](#三gtoken-定价模型以收入为基准的阶梯)
4. [销售阶梯计算表](#四销售阶梯计算表)
5. [aPNTs 销售设计](#五apoints-销售设计)
6. [X402 协议集成](#六x402-协议集成)
7. [合约接口设计](#七合约接口设计)
8. [销售页面 UX 设计](#八销售页面-ux-设计)
9. [从 Custom-Sale-Contract 吸收的设计](#九从-custom-sale-contract-吸收的设计)
10. [待确认事项](#十待确认事项)

---

## 一、协议叙事与销售哲学

### 1.1 Mycelium Protocol 是什么

**协议目标**：多样性数字公共物品花园

提供 **Infra → Protocol → DApp** 三个层级的开源开放工具支持，持续进行问题研究，为三步走提供创新方向。

> 这是一场实验，探索是唯一目标，价值和成果自然会涌现。

### 1.2 冷启动的六个阶段

每个阶段代表协议价值的一次跃升，达成即触发 GToken 定价上浮 12%：

| 阶段 | 名称 | 筹款目标 | 核心目标 |
|---|---|---|---|
| Phase 1 | **声音建立** | 已完成 | 网站/文档/SDK/GitHub/Telegram，周知相关者 |
| Phase 2 | **用爱发电** | $1,200 | 1年基础运营费（100以内用户群，$50-100/月成本） |
| Phase 3 | **研究探索 CMUBRC** | $8,000 | 1年有组织的人文+科技课题研究，至少2篇论文 |
| Phase 4 | **Protocol 社区** | $33,600 | 12个月 Mycelium 社区运营（3个兼职+基础费用） |
| Phase 5 | **AAStar 基础设施** | $86,400 | 1.5年两人 Part-time，沿 Roadmap 持续交付 |
| Phase 6+ | **DApp/协议生态** | 开放追加 | 任何组织基于基础设施启动自己的协议 |

**第一个范例：jLab by AAStar Team**
- 启动 SuperPaymaster，为任何社区/DApp 提供 gasless 服务
- 销售 aPNTs，以协议服务和盈利能力背书

### 1.3 为什么 GToken 是"门票"不是"投资"

GToken 是协议参与权凭证（Utility Token）：
- 持有 → 参与协议治理（投票、提案）
- 质押 → 注册协议角色（Community/Operator/DVT 等）
- 价值来源 → 协议实际使用价值，不承诺回报

**每个筹款阶段的达成 = 协议价值的可验证增加 = 价格上浮 12%**

这是激励早期支持者的核心机制，而非投机手段。

---

## 二、两个价值坐标系

Mycelium Protocol 用两条曲线描述整体运行逻辑：

### 坐标系 A：问题→价值 × 行动

```
行动
(Actions)
    ↑
    │          ●─────────── Phase 5: AAStar 基础设施持续迭代
    │        ●              Phase 4: Mycelium 社区协作建立
    │      ●                Phase 3: CMUBRC 研究探索
    │    ●                  Phase 2: 用爱发电，公共物品基础维护
    │  ●                    Phase 1: 声音建立
    ●                       现实世界问题
    └────────────────────────────────→
                         问题/价值维度
                         (Problems / Value)
```

**逻辑**：每个真实问题驱动一次行动跃升，每次跃升对应一个协议里程碑和筹款目标。

### 坐标系 B：产出 × 成本

```
成本
(Cost USD)
    ↑
 86,400 │                              ●  Phase 5（AAStar Infra）
        │
 33,600 │                   ●           Phase 4（Mycelium Community）
        │
  8,000 │         ●                     Phase 3（Research）
        │
  1,200 │   ●                           Phase 2（Basics）
        └───────────────────────────────→
              产出维度
              (Output: 论文/协议/SDK/社区/DApp)
```

**逻辑**：成本随产出的累积非线性增长，但每单位产出的边际成本在 Protocol 层面是递减的（基础设施摊薄）。

**GToken 销售曲线与这两个坐标系同构：**
- 每个筹款目标 = 坐标系 A 中的一个行动节点
- 资金到位 = 坐标系 B 中的成本被覆盖
- 定价上浮 12% = 协议价值增加的链上体现

---

## 三、GToken 定价模型（以收入为基准的阶梯）

### 3.1 设计原则

**核心：价格由"本轮已收入多少 USD"决定，而非"卖出了多少 token"。**

理由：
- 筹款目标是以成本（USD）为单位的，而非 token 数量
- 同样 $1,200 收入，$1.00 卖 1200 GT，$1.12 只卖 1071 GT——用收入计量更能反映协议筹款节奏
- 避免价格操纵：无法通过"少量多次买入"跨阶梯而不达成收入目标

### 3.2 起始定价

```
起始价格 = $0.15 USD / GT

含义：$0.15 是整数美元定价，便于链上 6-decimal 精度计算
合约存储：150000（6 decimals，与 USDC 精度一致）
合约存储精度：150000（6 decimals，与 USDC 精度一致）
```

### 3.3 阶梯推进规则

```
当 currentTierRevenue（本轮已收入 USD） ≥ tier.revenueTarget（本轮收入目标）时：
    currentTierIndex ++
    currentTierRevenue = 0
    newPrice = currentPrice * 1.12 （+12%，可管理员配置）
```

### 3.4 个人限额规则

```
每个地址在每轮的最大购买额 = 本轮收入目标 × 1%

例：Tier 2 收入目标 $8,000 → 每人最多 $80

技术实现：
    mapping(address => mapping(uint256 => uint256)) tierSpent;
    // buyer → tierIndex → 已花 USD

同一地址可以跨多轮参与（tierSpent 按轮独立计算）
```

### 3.5 超出处理（自动截断）

当某笔购买跨越轮次边界时：
```
实际购买金额 = min(用户意图金额, 本轮剩余收入空间)
多余的 paymentToken 退回 msg.sender

前端销售页面明确标注：
"本笔交易可能因当前轮次额满而被截断，超出部分自动退回"
```

### 3.6 无白名单（简化模式）

> 设计决策：取消白名单，降低参与门槛，契合"公共物品"精神

无 whitelistVerifier 地址，任何人均可购买。

保留白名单合约接口（`whitelistRequired` 字段），管理员可在特定轮次手动开启，但默认关闭。

---

## 四、销售阶梯计算表

**起始价格：$0.15 USD/GT**
**每轮涨幅：+12%**
**每人限额：本轮收入目标的 1%**

| 轮次 | 对应协议阶段 | 收入目标 | GT 单价 | 本轮最多卖 GT | 每人上限 | 每人最多 GT |
|---|---|---|---|---|---|---|
| Tier 1 | 用爱发电 | $1,200 | $0.1500 | 8,000 GT | $12 | 80 GT |
| Tier 2 | 研究探索 CMUBRC | $8,000 | $0.1680 | 47,619 GT | $80 | 476 GT |
| Tier 3 | Mycelium 社区 | $33,600 | $0.1882 | 178,571 GT | $336 | 1,786 GT |
| Tier 4 | AAStar 基础设施 | $86,400 | $0.2107 | 409,985 GT | $864 | 4,100 GT |
| Tier 5+ | 生态扩张（追加） | 管理员设置 | +12%/轮自动 | - | 1% | - |

### 累计汇总（前4轮）

```
累计 GT 销售量：  644,176 GT（占总量 21M 的 3.1%）
累计收入（USD）： $129,200
GToken 价格轨迹：
  $0.15 → $0.168 → $0.188 → $0.211

池子预分配建议：
  前4轮需要 644,176 GT
  建议预分配 680,000 GT 到销售合约（含约 5% 缓冲）
  占总量 21M 的 3.24%
```

### 价格换算对照

| 轮次 | GT 价格 | 里程碑含义 |
|---|---|---|
| Tier 1 | $0.1500 | 社区存在，用爱发电 |
| Tier 2 | $0.1680 | 有组织研究开始 |
| Tier 3 | $0.1882 | 社区协作规模化 |
| Tier 4 | $0.2107 | 基础设施稳定运营 |

---

## 五、aPNTs 销售设计

### 5.1 aPNTs 是什么

aPNTs 是 AAStar 社区的 xPNTs 实例（部署于 Sepolia `0xDf669834F04988BcEE0E3B6013B6b867Bd38778d`）。

SuperPaymaster Operator 需要质押 aPNTs 作为 Gas 赞助的抵押品：
- 用户发起 gasless 交易 → SPO 用 aPNTs 垫付 Gas 费
- 用户后续通过 xPNTs（社区积分）偿还债务
- SPO 的 aPNTs 余额 = 当前可赞助额度

### 5.2 定价模型

```
基准价：$0.02 USD / aPNTs（= 0.14 RMB，约 1 毛 4 分）
浮动范围：$0.015 - $0.030（管理员手动调整）
无阶梯、无限额、无白名单（完全公开）
```

### 5.3 服务能力上限预测与警示

> **核心机制：不设硬性限购，但用服务能力透明度替代**

```
服务能力预测：
  当前 SuperPaymaster 月度赞助上限 ≈ $X,XXX USD 等值 Gas
  对应 aPNTs 消耗 ≈ $X,XXX / $0.02 = XXX,XXX aPNTs/月

当 aPNTs 总流通量（Outstanding） > 服务月能力 × 6 个月时：
  → 在销售页面显示 ⚠️ 警告横幅：
    "当前已售 aPNTs 代表约 N 个月的服务容量
     如大量用户同时使用 gasless 服务，可能产生排队等待
     请根据您的使用需求合理购买"
```

**前端展示数据（实时）：**

```
SuperPaymaster 服务仪表盘
├── 当前月度赞助容量：~$X,XXX / 月（基于 SPO aPNTs 余额）
├── 已售出 aPNTs 总量：X,XXX,XXX
├── 对应服务月数：N 个月
└── 服务使用率：本月已赞助 / 总容量（%）
```

### 5.4 管理员直接 Mint（保留权限）

所有 Mint 行为统一记录，公开可查：

```
Mint 类型：
  "sale"       - 通过销售合约购买
  "admin_mint" - 管理员直接发放（需填写原因）
  "airdrop"    - 社区空投
```

---

## 六、X402 协议集成

### 6.1 X402 核心思想

HTTP 402 Payment Required——服务方告知客户端"需要先支付，这是支付规格"，客户端链上支付后自动获得服务。

我们借鉴 X402 的精髓：**支付规格标准化 + 链上自动交付**，而非字面实现 HTTP 头部。

### 6.2 支付流程

```
用户（浏览器）              API 服务器（轻量）           链上合约
    │                           │                         │
    │  1. GET /api/sale/quote   │                         │
    │  ?token=USDC&amount=50    │                         │
    │  &product=gtoken          │                         │
    │──────────────────────────►│                         │
    │                           │  读取链上状态            │
    │                           │─────────────────────────►
    │                           │◄─────────────────────────
    │                           │  currentTier, price...   │
    │  2. 402 Payment Required  │                         │
    │  {                        │                         │
    │    x402: true,            │                         │
    │    scheme: "evm",         │                         │
    │    network: "sepolia",    │                         │
    │    payTo: saleContract,   │                         │
    │    payToken: USDC_ADDR,   │                         │
    │    payAmount: "50000000", │ // 50 USDC (6 decimals) │
    │    quote: {               │                         │
    │      gtAmount: "350e18",  │ // ~350 GT              │
    │      priceUSD: "142857",  │ // $0.142857 (6 dec)    │
    │      tier: 1,             │                         │
    │      buyerRemaining: "12e6"│                        │
    │    },                     │                         │
    │    calldata: "0x...",     │ // 预编码 buyGToken()   │
    │    expiresAt: 1741234567  │ // 30秒有效             │
    │  }                        │                         │
    │◄──────────────────────────│                         │
    │                           │                         │
    │  3. 用户 Passkey 确认      │                         │
    │     UserOp 构建 + 提交    │                         │
    │─────────────────────────────────────────────────────►
    │                           │  GTokenPurchased event  │
    │◄─────────────────────────────────────────────────────
    │                           │                         │
    │  4. GET /api/sale/verify  │                         │
    │  ?txHash=0x...            │                         │
    │──────────────────────────►│                         │
    │                           │  getLogs(txHash)        │
    │                           │─────────────────────────►
    │  5. 200 OK                │◄─────────────────────────
    │  { gtAmount, newBalance } │                         │
    │◄──────────────────────────│                         │
```

### 6.3 API 端点规范

```typescript
// GET /api/sale/quote
// 返回 X402 格式的支付规格
interface QuoteResponse {
  x402: true;
  scheme: 'evm';
  network: 'sepolia' | 'optimism';
  // 支付规格
  payTo: string;                    // GTokenSaleContract 地址
  payToken: string;                 // 支付代币地址
  payAmount: string;                // 需支付数量（token decimals string）
  // 报价信息
  quote: {
    gtokenAmount: string;           // 可得 GT（wei string）
    actualUSD: string;              // 实际收 USD（可能因截断少于报价）
    priceUSD: string;               // 成交价（6 decimals string）
    tier: number;
    tierRevenueRemaining: string;   // 本轮剩余收入空间
    buyerRemainingUSD: string;      // 本地址本轮剩余可购
    isTruncated: boolean;           // 是否被截断
  };
  // 预编码 calldata（前端可直接用）
  calldata: string;
  // 过期时间
  expiresAt: number;
}

// GET /api/sale/apnts/quote  （aPNTs 报价，更简单）
interface APNTsQuoteResponse {
  x402: true;
  payTo: string;
  payToken: string;
  payAmount: string;
  quote: {
    apntsAmount: string;
    priceUSD: string;
    serviceCapacityMonths: number;     // 当前总量对应服务月数
    serviceCapacityWarning: boolean;   // 是否触发警告
  };
  calldata: string;
  expiresAt: number;
}

// GET /api/sale/verify?txHash=0x...
interface VerifyResponse {
  success: boolean;
  product: 'gtoken' | 'apnts';
  amount?: string;
  recipient?: string;
  tier?: number;
  txHash: string;
  blockNumber?: number;
}

// GET /api/sale/tiers  （链上阶梯状态，可缓存）
interface TiersResponse {
  currentTierIndex: number;
  currentTierRevenue: string;        // 本轮已收 USD（6 dec）
  tiers: Array<{
    revenueTarget: string;
    priceUSD: string;
    perPersonMaxUSD: string;
    revenueCollected: string;
    progressPercent: number;
  }>;
  totalRevenue: string;
  poolBalance: string;               // 合约剩余 GT
}
```

---

## 七、合约接口设计

### 7.1 GTokenSaleContract.sol

```solidity
// SPDX-License-Identifier: MIT
// 继承 Custom-Sale-Contract 的安全模式，重新设计定价逻辑

pragma solidity ^0.8.20;

// ============ 核心数据结构 ============

struct Tier {
    uint256 revenueTarget;     // 本轮收入目标（USD, 6 decimals）
                               // Tier 1: 1_200_000000 = $1,200
    uint256 priceUSD;          // 本轮 GT 单价（USD, 6 decimals）
                               // Tier 1: 142857 = $0.142857
    uint256 perPersonMaxUSD;   // 本轮每人最高购买额（0 = 自动用 revenueTarget/100）
    bool whitelistRequired;    // 是否启用白名单（默认 false）
}

struct BuyPermit {             // EIP-712 白名单凭证（仅白名单轮使用）
    address buyer;
    uint256 tierIndex;
    uint256 maxUSD;            // 0 = 用合约默认
    uint256 deadline;
    uint256 nonce;
}

struct SaleRecord {
    address buyer;
    address recipient;
    address paymentToken;
    uint256 paymentAmount;     // 实际收取的 paymentToken 数量
    uint256 usdValue;          // 对应 USD 价值（6 decimals）
    uint256 gtokenAmount;      // 发出的 GT（wei）
    uint256 priceUSD;          // 成交价（6 decimals）
    uint256 tierIndex;
    uint256 timestamp;
}

// ============ 状态变量 ============

// 轮次管理
uint256 public currentTierIndex;
uint256 public currentTierRevenue;    // 本轮已收入 USD（6 dec）
uint256 public totalRevenue;          // 全局累计收入 USD（6 dec）
Tier[]  public tiers;

// 购买追踪（按轮次独立）
mapping(address => mapping(uint256 => uint256)) public tierSpent;
// buyer → tierIndex → 已花 USD（6 dec）

// 白名单（仅白名单轮次使用）
address public whitelistVerifier;
mapping(address => mapping(uint256 => uint256)) public permitNonces;
// buyer → tierIndex → nonce

// 支付配置
mapping(address => bool) public acceptedPaymentTokens;
mapping(address => address) public priceFeeds;  // token → Chainlink feed
address public treasury;
address public gToken;
uint256 public poolBalance;           // 合约持有的 GT 数量

// 历史记录
SaleRecord[] private _saleHistory;
mapping(address => uint256[]) private _buyerHistoryIndex;

// ============ 管理员函数（onlyOwner）============

// 追加阶梯（不能修改历史轮次）
function addTier(Tier calldata newTier) external onlyOwner;

// 修改当前轮次配置（仅允许修改 currentTierIndex 的轮次）
function updateCurrentTier(Tier calldata update) external onlyOwner;

// 批量初始化阶梯（一键设置）
function initTiers(
    uint256[] calldata revenueTargets,   // 各轮收入目标
    uint256 startPriceUSD,               // 起始价格（142857 = $0.142857）
    uint256 increaseRateBPS,             // 涨幅（1200 = 12%）
    bool[] calldata whitelistFlags       // 各轮是否需要白名单
) external onlyOwner;

// 白名单配置
function setWhitelistVerifier(address verifier) external onlyOwner;

// 支付配置
function setAcceptedToken(address token, bool accepted) external onlyOwner;
function setPriceFeed(address token, address feed) external onlyOwner;
function setTreasury(address _treasury) external onlyOwner;

// 合约控制
function pause() external onlyOwner;
function unpause() external onlyOwner;
function emergencyWithdraw(address to) external onlyOwner;  // 提回未售 GT

// ============ 购买函数 ============

function buyGToken(
    address paymentToken,     // USDC/USDT/WETH/WBTC；address(0) = ETH
    uint256 paymentAmount,    // 支付数量（paymentToken decimals）
    address recipient,        // GT 接收地址（可与 msg.sender 不同）
    BuyPermit calldata permit,   // 白名单凭证（非白名单轮传空）
    bytes calldata permitSig     // EIP-712 签名（非白名单轮传空）
) external payable nonReentrant whenNotPaused
  returns (uint256 gtokenAmount, uint256 actualUSD, bool truncated);

/*
  内部逻辑（伪代码）：

  tier = tiers[currentTierIndex]

  // 1. 白名单验证（如需）
  if (tier.whitelistRequired && whitelistVerifier != address(0)) {
      _verifyPermit(permit, permitSig);
  }

  // 2. 计算 USD 价值
  usdValue = _toUSD(paymentToken, paymentAmount)

  // 3. 每人限额检查
  perMax = tier.perPersonMaxUSD > 0 ? tier.perPersonMaxUSD
         : (permit.maxUSD > 0 ? permit.maxUSD : tier.revenueTarget / 100)
  alreadySpent = tierSpent[msg.sender][currentTierIndex]
  require(alreadySpent < perMax, "Personal limit reached")
  usdValue = min(usdValue, perMax - alreadySpent)

  // 4. 轮次剩余检查（自动截断）
  remaining = tier.revenueTarget - currentTierRevenue
  actualUSD = min(usdValue, remaining)
  truncated = (actualUSD < usdValue)

  // 5. 计算 GT 数量
  gtokenAmount = actualUSD * 1e18 / tier.priceUSD
  require(poolBalance >= gtokenAmount, "Pool insufficient")

  // 6. 收款：只收 actualUSD 对应的 paymentToken，多余退回
  actualPayment = _fromUSD(paymentToken, actualUSD)
  _collect(paymentToken, actualPayment, treasury)  // 直接入 treasury
  if (truncated) _refund(paymentToken, paymentAmount - actualPayment, msg.sender)

  // 7. 发放 GT
  gToken.transfer(recipient, gtokenAmount)
  poolBalance -= gtokenAmount

  // 8. 更新状态
  tierSpent[msg.sender][currentTierIndex] += actualUSD
  currentTierRevenue += actualUSD
  totalRevenue += actualUSD

  // 9. 推进轮次
  if (currentTierRevenue >= tier.revenueTarget) {
      emit TierAdvanced(currentTierIndex, tier.priceUSD, tiers[currentTierIndex+1].priceUSD)
      currentTierIndex++
      currentTierRevenue = 0
  }

  // 10. 记录历史
  _recordSale(...)
*/

// ============ 查询函数 ============

function getCurrentTier() external view returns (
    uint256 tierIndex,
    uint256 priceUSD,
    uint256 revenueTarget,
    uint256 revenueCollected,
    uint256 revenueRemaining,
    uint256 perPersonMaxUSD,
    bool whitelistRequired
);

function getQuote(
    address paymentToken,
    uint256 paymentAmount,
    address buyer             // 用于查询剩余限额
) external view returns (
    uint256 gtokenAmount,
    uint256 actualUSD,
    uint256 buyerRemainingUSD,
    bool isTruncated
);

function getAllTiers() external view returns (Tier[] memory);

function getSaleHistory(
    uint256 offset,
    uint256 limit
) external view returns (SaleRecord[] memory);

function getBuyerHistory(address buyer) external view returns (SaleRecord[] memory);

// ============ 事件 ============

event GTokenPurchased(
    address indexed buyer,
    address indexed recipient,
    address paymentToken,
    uint256 paymentAmount,
    uint256 usdValue,
    uint256 gtokenAmount,
    uint256 priceUSD,
    uint256 indexed tierIndex,
    bool truncated,
    uint256 timestamp
);

event TierAdvanced(
    uint256 previousTierIndex,
    uint256 newTierIndex,
    uint256 previousPriceUSD,
    uint256 newPriceUSD,
    uint256 cumulativeRevenue
);

event TierAdded(uint256 tierIndex, uint256 revenueTarget, uint256 priceUSD);
event PoolReplenished(uint256 amount, uint256 newPoolBalance);
```

### 7.2 APNTsSaleContract.sol

```solidity
// aPNTs 销售合约（xPNTs 实例）
// 无阶梯、无白名单、无限额、固定浮动价格

struct MintRecord {
    address operator;          // 操作人（admin 或 this contract）
    address recipient;
    uint256 amount;            // aPNTs 数量（wei）
    address paymentToken;      // address(0) = adminMint
    uint256 paymentAmount;     // 0 = adminMint
    uint256 usdValue;          // 0 = adminMint
    uint256 priceUSD;          // 成交价（6 dec）；0 = adminMint
    string reason;             // "sale" | "admin_mint" | "airdrop"
    uint256 timestamp;
}

// 状态变量
IxPNTsToken public aPNTs;
address public treasury;
uint256 public priceUSD;           // 当前价格（6 dec，默认 20000 = $0.02）
uint256 public poolBalance;        // communityOwner 预 mint 的池子
uint256 public constant MIN_PRICE = 15000;  // $0.015 下限
uint256 public constant MAX_PRICE = 30000;  // $0.030 上限

// 服务能力警告阈值（月）
uint256 public serviceCapacityWarningMonths = 6;
uint256 public monthlyServiceCapacityUSD;   // 管理员设置

mapping(address => bool) public acceptedPaymentTokens;
mapping(address => address) public priceFeeds;

MintRecord[] private _mintHistory;

// 管理员函数
function setPrice(uint256 newPriceUSD) external onlyOwner;
// require(newPriceUSD >= MIN_PRICE && newPriceUSD <= MAX_PRICE)

function replenishPool(uint256 amount) external;
// communityOwner 先调用 aPNTs.mint(address(this), amount)，再调用此函数

function adminMint(
    address recipient,
    uint256 amount,
    string calldata reason
) external onlyOwner;

function setMonthlyServiceCapacity(uint256 usdPerMonth) external onlyOwner;
function setCapacityWarningMonths(uint256 months) external onlyOwner;
function setAcceptedToken(address token, bool accepted) external onlyOwner;
function setTreasury(address _treasury) external onlyOwner;

// 购买函数
function buyAPNTs(
    address paymentToken,
    uint256 paymentAmount,
    address recipient
) external payable nonReentrant whenNotPaused
  returns (uint256 apntsAmount);

// 查询
function getCurrentPrice() external view returns (uint256 priceUSD);

function getServiceCapacityStatus() external view returns (
    uint256 totalSoldAPNTs,           // 总已售 aPNTs
    uint256 poolRemaining,            // 池子剩余
    uint256 estimatedServiceMonths,   // 对应服务月数
    bool warningTriggered             // 是否触发警告
);

function getMintHistory(
    uint256 offset,
    uint256 limit
) external view returns (MintRecord[] memory);

event APNTsIssued(
    address indexed operator,
    address indexed recipient,
    uint256 amount,
    address paymentToken,
    uint256 usdValue,
    uint256 priceUSD,
    string reason,
    uint256 timestamp
);

event PriceUpdated(uint256 oldPrice, uint256 newPrice, address updatedBy);
event PoolReplenished(uint256 amount, uint256 newBalance, address by);
```

### 7.3 Chainlink 价格换算（公用）

```solidity
// 公用内部函数：paymentToken 数量 → USD 价值（6 decimals）
function _toUSD(address token, uint256 amount) internal view returns (uint256 usdValue) {
    if (token == USDC || token == USDT) {
        // 1:1，统一到 6 decimals
        return amount; // USDC/USDT 本身就是 6 decimals
    }
    // ETH / WBTC：从 Chainlink 获取价格
    (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(priceFeeds[token]).latestRoundData();
    require(block.timestamp - updatedAt < 3600, "Price stale");
    require(price > 0, "Invalid price");
    // Chainlink ETH/USD 是 8 decimals：price * 1e6 / 1e8 = price / 100
    uint256 tokenDecimals = IERC20Metadata(token).decimals();
    return (amount * uint256(price)) / (10 ** (8 + tokenDecimals - 6));
}
```

---

## 八、销售页面 UX 设计

### 8.1 路由：`/sale`（公开，无需登录）

```
┌─────────────────────────────────────────────────────┐
│              Mycelium Protocol 公共物品花园           │
│            — 每一次购买都是协议价值的投票 —            │
└─────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  GToken 购买                                              │
│                                                          │
│  当前轮次：Tier 1 — 用爱发电                              │
│  目标：$1,200 支持1年基础运营                              │
│                                                          │
│  进度：████████░░░░░░░░ $X,XXX / $1,200                  │
│                                                          │
│  当前价格：$0.15 / GT                                      │
│  本轮每人限额：$12（约 84 GT）                            │
│  你的剩余额度：$X.XX                                      │
│                                                          │
│  支付代币：[USDC ▼]  金额：[______] USDC                 │
│  接收地址：[我的地址 ▼] 或填写其他地址                    │
│  预计获得：≈ XX.XX GT                                     │
│  ⚠️ 注意：如本轮额满，将自动截断，多余退回                │
│                                                          │
│             [购买 GToken]（Passkey 确认）                 │
│                                                          │
│  ──────────────────────────────────────────────          │
│  所有轮次进度：                                          │
│  Tier 1 ████████░░ $X/$1,200  $0.15/GT  ← 当前            │
│  Tier 2 ░░░░░░░░░░ $0/$8,000  $0.168/GT                   │
│  Tier 3 ░░░░░░░░░░ $0/$33,600 $0.188/GT                   │
│  Tier 4 ░░░░░░░░░░ $0/$86,400 $0.211/GT                   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  aPNTs 购买（AAStar 赞助积分）                            │
│                                                          │
│  aPNTs 用于 SuperPaymaster 的 Gas 赞助服务                │
│  当前价格：$0.02 / aPNTs                                   │
│                                                          │
│  ✅ 服务状态：当前月度赞助容量充足                        │
│  [或 ⚠️ 当前已售 aPNTs 代表 N 个月服务容量，可能排队]   │
│                                                          │
│  支付代币：[USDT ▼]  金额：[______] USDT                 │
│  接收地址：[我的地址 ▼]                                   │
│  预计获得：≈ X,XXX aPNTs                                  │
│                                                          │
│             [购买 aPNTs]（Passkey 确认）                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  全局销售历史（链上公开，实时）                           │
│  时间        买家          获得             价格   轮次   │
│  2026-03-13  0xAB...CD   84 GT           $0.143  T1     │
│  2026-03-13  0xEF...01   500 GT          $0.143  T1     │
│  ...                                                     │
│  [查看 aPNTs 历史]  [导出 CSV]                           │
└──────────────────────────────────────────────────────────┘
```

### 8.2 管理员销售控制面板（/protocol-admin/sale）

```
当前 GToken 销售池余额：XXX,XXX GT
当前 aPNTs 销售池余额：X,XXX,XXX aPNTs

[充值 GToken 到销售池]   → Owner transfer GToken 到合约
[补充 aPNTs 到销售池]    → communityOwner mint → replenishPool()

阶梯管理：
  [追加新阶梯]
  [一键初始化阶梯]（起始价 / 轮数 / 收入序列 / 涨幅）
  [修改当前轮配置]（仅限当前轮）

aPNTs 价格管理：
  当前价格：$0.02
  新价格：[_____]（限 $0.018 - $0.030）
  [更新价格]

adminMint：
  类型：[GToken / aPNTs]
  接收地址：[_______]
  数量：[_______]
  原因：[_______]
  [执行 Mint]（所有记录公开）
```

---

## 九、从 Custom-Sale-Contract 吸收的设计

参考 `contracts/sale/src/SaleContract.sol` 和 `contracts/sale/src/GovernanceToken.sol`：

### 吸收并保留的设计

| 设计点 | 来源 | 我们如何使用 |
|---|---|---|
| EIP-712 白名单凭证机制 | SaleContract.sol | 保留接口，默认关闭，管理员可按轮次开启 |
| WhitelistVerifier 模式 | SaleContract.sol | `whitelistVerifier` 地址，链下服务签发 |
| `hasBought` → `tierSpent` | SaleContract.sol | 升级为按轮次独立限额，同一地址可跨轮购买 |
| 资金直入 Treasury | SaleContract.sol | 保留：payment 直接 `transfer → treasury`，合约不持有资金 |
| 多币种支付框架 | SaleContract.sol | 保留并完善，加入 Chainlink 价格换算 |
| `nonReentrant` 保护 | SaleContract.sol | 保留 |
| `withdrawUnsoldTokens()` | SaleContract.sol | 改为 `emergencyWithdraw()`，管理员可提回未售 GT |
| GovernanceToken 的 ERC20Votes | GovernanceToken.sol | AAStar GToken 已是 ERC20Votes，与此对齐 |
| 初始分配模式（20%给销售合约） | GovernanceToken.sol | 借鉴：Owner 预转 GT 到销售合约形成"池" |

### 主要变更

| 变更项 | 原设计 | 新设计 | 原因 |
|---|---|---|---|
| 定价基准 | 售出 token 数量（3段线性） | 本轮收入 USD（无限阶梯） | 筹款目标以成本计量，不以 token 计量 |
| 阶梯数量 | 固定 3 段 | 无限层，管理员追加 | 对应协议各阶段目标 |
| 白名单 | 强制白名单（全程） | 默认关闭，按轮可选 | 简化参与，公共物品精神 |
| 单地址限制 | 全程一次购买 | 每轮独立限额（1%） | 允许长期支持者持续参与 |
| 截断处理 | 无（直接失败） | 自动截断 + 退余款 | 用户体验更友好 |
| 起始定价 | $1.00 | $0.15 | 整数定价，链上精度友好 |

### 未使用的设计（原因）

| 未使用项 | 原因 |
|---|---|
| `totalTokensForSale` 固定上限 | 改为无限阶梯，每轮有收入上限，总量由管理员充池决定 |
| 3段斜率数学模型 | 改为离散阶梯，更直观，更易链下计算 |
| EIP-712 nonce 全局计数 | 改为按 buyer+tierIndex 独立 nonce |

---

## 十、问题清单与确认结果

| # | 问题 | 状态 | 答案 | 影响 |
|---|---|---|---|---|
| Q1 | GToken 销售池分批还是一次 | ✅ 已确认 | **分批充值**，有冗余即可 | 管理员页面需"充值池"入口 |
| Q2 | 每轮涨幅固定还是独立 | ✅ 已确认 | **固定 12%** | `increaseRateBPS = 1200`，不可按轮独立配置 |
| Q3 | aPNTs 价格范围 | ✅ 已确认 | **$0.018 - $0.030** | 合约 `MIN_PRICE=18000, MAX_PRICE=30000` |
| Q4 | aPNTs communityOwner | ✅ 已确认 | **部署者 EOA 私钥**，后续 transfer 给 Safe 多签 | 管理员页面需"充值池"入口，操作者即 communityOwner |
| Q5 | aPNTs 月度服务容量 | ✅ 初始值 | **$10,000 USD/月**，后续更新 | `monthlyServiceCapacityUSD = 10000_000000` |
| Q6 | AirAccount 配置 | ⏳ 明天 | AASTAR_API_URL / KMS_API_KEY / BLS_SEED_NODES / BUNDLER_RPC_URL | 阻塞开发启动 |
| Q7 | Admin 操作走 UserOp 还是 EOA | ✅ 已确认 | **走 UserOp（AirAccount）** | Phase 0 先做 AirAccount，再做 Admin 面板 |
| Q8 | 截断提示时机 | ✅ 已确认 | **事前提示**，报价时显示"将被截断为 $X" | getQuote 返回 `isTruncated + actualUSD` |
| Q9 | 历史查询方案 | ✅ 已确认 | **Event 缓存到 DB**（SQLite），合约有 event，按合约地址查询 | 需要轻量后端 + SQLite，定期 getLogs 同步 |
| Q10 | 管理员操作是否需要 Timelock | ✅ 已确认 | 见下方详细说明 | 大部分实时生效，两个例外 |

### Q10 详细说明：Timelock 策略

| 操作 | 合约函数 | Timelock | 理由 |
|---|---|---|---|
| 修改角色参数 | `adminConfigureRole()` | **24h 延迟** | 影响所有新注册者的质押门槛，突变会误导准备中的用户 |
| 移交所有权 | `transferOwnership()` | **二次确认弹窗**（非链上 Timelock） | 不可逆，前端加两步确认即可，初期无需链上 Timelock |
| 设置协议费 | `setProtocolFee()` | **实时** | 影响新交易，不影响存量，实时可接受 |
| 暂停 Operator | `setOperatorPaused()` | **实时** | 紧急操作，必须即时 |
| 修改 GToken 阶梯 | `updateCurrentTier()` | **实时** | 已有价格范围约束，浮动有限 |
| 调整 aPNTs 价格 | `setPrice()` | **实时** | $0.018-$0.030 范围内浮动，用户可接受 |
| 充值销售池 | transfer GT / `replenishPool()` | **实时** | 只增不减，无风险 |
| 管理员 Mint | `adminMint()` | **实时** | 有事件记录，链上可查，公开透明 |

> 初期实现：`adminConfigureRole` 在前端加 "24小时后生效"的 UI 提示（不做链上 Timelock）；协议成熟后再升级为 OpenZeppelin TimelockController。

---

*文档版本 v1.2 - 2026-03-13*
*去除 RMB 计价，统一 USD；价格范围更新为 $0.018-$0.030；Q1-Q10 全部答复*
*基于 Custom-Sale-Contract submodule 分析 + Mycelium Protocol 冷启动叙事*
