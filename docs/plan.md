# AAStar 管理界面产品设计文档 v2.0

> 基于 @aastar/sdk v0.16.23、@aastar/airaccount、SuperPaymaster 合约体系深度分析
> 最后更新：2026-03-13（v2.1 - 定价模型修正 + 确认 Q1-Q10 + 三阶段开发计划）

---

## 目录

1. [系统全景](#一系统全景)
2. [角色体系](#二角色体系)
3. [账户注册与登录（Email + Passkey）](#三账户注册与登录email--passkey)
4. [Token 获取方案（销售合约）](#四token-获取方案销售合约)
5. [角色生命周期与业务流程](#五角色生命周期与业务流程)
6. [核心数据结构](#六核心数据结构)
7. [角色间交互关系](#七角色间交互关系)
8. [页面结构设计](#八页面结构设计)
9. [主要业务场景操作步骤](#九主要业务场景操作步骤)
10. [技术栈与合约地址](#十技术栈与合约地址)
11. [已确认设计决策（Q1-Q10）](#十一已确认设计决策q1-q10)
12. [三阶段开发计划](#十二三阶段开发计划)

---

## 一、系统全景

```
┌──────────────────────────────────────────────────────────────────────┐
│                        AAStar 管理界面                                │
│                                                                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │ Protocol  │  │Community  │  │Paymaster  │  │   End User      │  │
│  │  Admin    │  │  Admin    │  │ Operator  │  │   Portal        │  │
│  │  Portal   │  │  Portal   │  │  Portal   │  │                 │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────┬─────────┘  │
│        │               │              │                 │             │
│  ┌─────▼───────────────▼──────────────▼─────────────────▼─────────┐ │
│  │              Email + Passkey 登录（无 MetaMask）                  │ │
│  │         YAAAClient (browser) → api.aastar.io (官方服务)          │ │
│  └─────────────────────────────┬───────────────────────────────────┘ │
│                                 │                                     │
│  ┌──────────────────────────────▼──────────────────────────────────┐ │
│  │              AAStar 合约体系（Sepolia 测试网）                    │ │
│  │  Registry · GToken · GTokenStaking · SuperPaymaster             │ │
│  │  xPNTsFactory · aPNTs(xPNTs) · MySBT · PaymasterFactory        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  GToken 销售合约         │  │  aPNTs 销售合约                   │  │
│  │  (阶梯定价，预分配池)    │  │  (浮动定价，communityOwner mint)  │  │
│  └─────────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、角色体系

### 层级总览

```
Level 100 │ Protocol Admin    │ DEFAULT_ADMIN_ROLE  │ 合约 Owner
Level 80  │ KMS Admin         │ ROLE_KMS            │ 100 GT stake
Level 50  │ SP Operator       │ ROLE_PAYMASTER_SUPER │ 50 GT + ROLE_COMMUNITY
Level 50  │ V4 Operator       │ ROLE_PAYMASTER_AOA  │ 30 GT + ROLE_COMMUNITY
Level 50  │ DVT Operator      │ ROLE_DVT            │ 30 GT
Level 30  │ Community Admin   │ ROLE_COMMUNITY      │ 30 GT stake
Level 10  │ End User          │ ROLE_ENDUSER        │ 0.3 GT + MySBT
```

### 角色经济参数（链上实际配置）

| 角色 | minStake | entryBurn | exitFee% | minExitFee | lockDuration |
|---|---|---|---|---|---|
| ROLE_PAYMASTER_SUPER | 50 GT | 5 GT | 10% | 2 GT | 30天 |
| ROLE_PAYMASTER_AOA | 30 GT | 3 GT | 10% | 1 GT | 30天 |
| ROLE_COMMUNITY | 30 GT | 3 GT | 5% | 1 GT | 30天 |
| ROLE_DVT | 30 GT | 3 GT | 10% | 1 GT | 30天 |
| ROLE_KMS | 100 GT | 10 GT | 10% | 5 GT | 30天 |
| ROLE_ANODE | 20 GT | 2 GT | 10% | 1 GT | 30天 |
| ROLE_ENDUSER | 0.3 GT | 0.05 GT | 10% | 0.05 GT | 7天 |

---

## 三、账户注册与登录（Email + Passkey）

### 3.1 设计原则

- **无 MetaMask，无外部钱包**
- 用户通过 Email 注册，Passkey（WebAuthn / 生物识别）认证
- 底层是 ERC-4337 M4 智能账户（带 guardian + 日限额）
- 私钥托管于 `kms1.aastar.io`（STM32 硬件安全模块）
- Passkey 与 KMS 密钥绑定，链上签名全程无需用户接触私钥
- 后续登录：Passkey 生物识别即可，无需密码

### 3.2 账户注册流程

```
用户输入 Email + Username
         │
         ▼
POST api.aastar.io/auth/passkey/register/begin
← 获取 WebAuthn CreationOptions（来自 KMS）
         │
         ▼
浏览器调用 @simplewebauthn/browser.startRegistration()
← 用户完成 Touch ID / FaceID / 安全密钥注册
← 生成：credentialId + P-256 公钥
         │
         ▼
POST api.aastar.io/auth/passkey/register/complete
← KMS 验证 credential，派生 ECC 密钥对（~60-75秒 async）
← KMS 轮询 pollUntilReady() 等待地址派生
← 返回：{ user, token, passkey: { credentialId, publicKey } }
         │
         ▼
AccountManager.createAccount(userId)
← 调用 M4 Factory.getAddressWithDefaults()
   • signerAddress（KMS 派生 EOA）
   • salt（random）
   • guardian = zero（默认无监护人）
   • dailyLimit = 1000 ETH（默认）
← 预测 Smart Account 地址（懒部署）
         │
         ▼
注册完成，返回：
  • Smart Account Address（ERC-4337）
  • JWT Token
  • Passkey Credential ID
  → 首次发交易时 Smart Account 自动部署（initCode in UserOp）
```

### 3.3 登录流程

```
点击「Passkey 登录」（可选 Email 过滤）
         │
         ▼
POST api.aastar.io/auth/passkey/login/begin
← 获取 WebAuthn RequestOptions + Challenge
         │
         ▼
startAuthentication()
← 生物识别认证
         │
         ▼
POST api.aastar.io/auth/passkey/login/complete
← 验证 assertion，返回：{ user, token }
         │
         ▼
读取链上角色（Registry.getUserRoles）→ 跳转对应门户
```

### 3.4 交易签名流程

```
用户发起操作（如注册 ROLE_COMMUNITY）
         │
         ▼
构建 UserOperation（@aastar/sdk createCommunityClient）
         │
         ▼
POST api.aastar.io/auth/transaction/verify/begin
← 返回 userOpHash + WebAuthn Challenge
         │
         ▼
PasskeyManager.verifyTransaction()
← 用户 Passkey 签名（biometric）
← 返回：{ credential, userOpHash }
         │
         ▼
KmsManager.signHashWithWebAuthn(hash, challengeId, credential)
← KMS STM32 硬件签名
← 返回 ECDSA signature（ethers.Signature）
         │
         ▼
Bundler 提交 UserOp（Pimlico / aastar bundler）
← 链上执行
```

### 3.5 SDK 代码模式

```typescript
// 浏览器端
import { YAAAClient } from '@aastar/airaccount';

const yaaa = new YAAAClient({
  apiURL: 'https://api.aastar.io/v1',       // 官方服务
  tokenProvider: () => localStorage.getItem('aastar_token'),
  bls: { seedNodes: ['https://signer1.aastar.io'] }
});

// 注册
const { user, token, passkey } = await yaaa.passkey.register({
  email: 'user@example.com',
  username: 'alice'
});

// 登录
const { user, token } = await yaaa.passkey.authenticate({ email });

// 签名交易
const { credential, userOpHash } = await yaaa.passkey.verifyTransaction({
  to: contractAddress,
  value: '0'
});

// 添加新设备
const newPasskey = await yaaa.passkey.addDevice({ email });
```

---

## 四、Token 获取方案（销售合约）

### 4.1 Token 架构澄清（基于源码分析）

**GToken（治理代币）**

- 合约：`GToken.sol`（SuperPaymaster/contracts/src/tokens/）
- 总量上限：21,000,000 GT
- Mint 权限：**仅 Owner**（`onlyOwner` 修饰符，无 MINTER_ROLE）
- 结论：**销售合约无法直接 mint**，采用「预分配池」模式
  - Protocol Owner 提前将一批 GT 转给销售合约
  - 销售合约从池中分发（`transfer`，非 `mint`）

**aPNTs（社区积分代币）**

- 合约：`xPNTsToken.sol`（EIP-1167 Clone 实例）
- Sepolia 地址：`0xDf669834F04988BcEE0E3B6013B6b867Bd38778d`
- Mint 权限：**FACTORY 或 communityOwner**
- 结论：**communityOwner 可以 mint**
  - aPNTs 销售合约需由 communityOwner 调用 `mint()` 为销售合约预分配
  - 或：communityOwner 是 multisig，将销售合约设为 communityOwner（高风险）
  - **推荐方案**：communityOwner 定期预 mint → 转入销售合约池，管理员可随时补充

**MySBT**

- Mint 权限：**仅 Registry**（`onlyRegistry`）
- 用户注册角色时 Registry 自动 mint，无需销售合约介入

### 4.2 销售合约设计方案

#### GToken 销售合约（阶梯定价）

**定价模型**：以**销售收入**（USD）驱动阶梯跃迁（非销售数量），管理员通过 `initTiers()` 配置

**核心原则**：
- 当本阶梯累计收入 `currentTierRevenue >= tier.revenueTarget` 时，价格跃升到下一层
- 同一地址跨多轮购买自动累加；超出限额部分自动截断（不退款，截断后正常成交）
- 无需白名单（默认 `whitelistRequired = false`）
- 无限阶梯层数，管理员可随时追加

**初始 4 层配置（由合约 Owner 在部署后调用 initTiers() 设置）**：

| 层级 | 主题 | 收入目标 | 单价 | 可购 GT | 个人上限 | 个人最多 GT |
|---|---|---|---|---|---|---|
| Tier 1 | 用爱发电 | $1,200 | $0.1500 | 8,000 GT | $12 | 80 GT |
| Tier 2 | 研究探索 CMUBRC | $8,000 | $0.1680 | 47,619 GT | $80 | 476 GT |
| Tier 3 | Mycelium 社区 | $33,600 | $0.1882 | 178,571 GT | $336 | 1,786 GT |
| Tier 4 | AAStar 基础设施 | $86,400 | $0.2107 | 409,985 GT | $864 | 4,100 GT |
| **合计** | | **$129,200** | | **644,175 GT** | | |

> 注：个人上限 = 本层 revenueTarget 的 1%；涨幅 +12%/层；
> 644k GT ≈ 3.1% of 21M 总量（安全范围）

**合约接口（在 contracts/sale/ submodule 中新增 GTokenSaleContract.sol）**：

```solidity
// GTokenSaleContract.sol — 收入驱动阶梯定价，预分配池模式

struct Tier {
    uint256 revenueTarget;   // 本层累计收入目标（USD, 6 decimals, e.g. 1_200_000000 = $1,200）
    uint256 priceUSD;        // 本层单价（USD, 6 decimals, e.g. 150000 = $0.15）
    uint256 perPersonMaxUSD; // 个人上限（0 = 自动 1% of revenueTarget）
    bool whitelistRequired;  // 默认 false
}

// 状态变量
GToken public gToken;                // AAStar GToken 合约
address public treasury;             // 收款地址（DAO）
uint256 public poolBalance;          // 预分配池余额（合约持有 GT 量）
uint256 public currentTierIndex;     // 当前阶梯索引
uint256 public currentTierRevenue;   // 本层已累计收入（USD, 6 decimals）
Tier[] public tiers;                 // 阶梯配置数组
mapping(address => bool) public acceptedPaymentTokens;
// buyer → tierIndex → 本层已花费 USD（用于个人上限校验）
mapping(address => mapping(uint256 => uint256)) public tierSpent;

// 管理员函数（onlyOwner）
function initTiers(
    uint256[] calldata revenueTargets,  // 每层收入目标
    uint256 startPriceUSD,              // 起始单价（6 decimals）
    uint256 increaseRateBPS,            // 涨幅（BPS，1200 = 12%）
    bool[] calldata whitelistFlags      // 每层白名单开关（全 false 即可）
) external onlyOwner;

function addTier(Tier calldata tier) external onlyOwner;       // 追加一层
function setAcceptedToken(address token, bool accepted) external onlyOwner;
function setTreasury(address _treasury) external onlyOwner;
function replenishPool(uint256 amount) external onlyOwner;     // Owner 转 GToken 入合约池
function pause() external onlyOwner;
function unpause() external onlyOwner;
// 注意：无 mint 函数，Owner 直接 transfer GToken 到此合约充池，或调用 replenishPool

// 用户购买函数（支持 X402 支付模式）
struct BuyPermit {
    address buyer;
    uint256 maxUSD;        // 可购买上限（可选，0 = 无 permit 限制）
    uint256 deadline;
    uint8 v; bytes32 r; bytes32 s;
}

function buyGToken(
    address paymentToken,          // USDC/USDT/WETH/WBTC，address(0) 代表 ETH
    uint256 paymentAmount,         // 支付金额（token decimals）
    address recipient,             // GToken 接收地址（可与 msg.sender 不同）
    BuyPermit calldata permit,     // 可选的限额授权（无白名单时传空结构体）
    bytes calldata permitSig       // permit 签名（无白名单时传 ""）
) external payable nonReentrant whenNotPaused
  returns (uint256 gtokenAmount, uint256 actualUSD, bool truncated);
// truncated = true 表示因个人上限自动截断，actualUSD < 计划支付

// 查询函数
function getCurrentTier() external view returns (uint256 tierIndex, Tier memory tier, uint256 tierRevenueSoFar);
function getQuote(address paymentToken, uint256 paymentAmount)
    external view returns (uint256 gtokenAmount, uint256 actualUSD, bool wouldTruncate);
function getTiers() external view returns (Tier[] memory);
function getRemainingPersonalLimit(address buyer, uint256 tierIndex)
    external view returns (uint256 remainingUSD);

// 事件
event GTokenPurchased(
    address indexed buyer,
    address indexed recipient,
    address indexed paymentToken,
    uint256 paymentAmount,
    uint256 gtokenAmount,
    uint256 priceUSD,
    uint256 tierIndex,
    bool truncated,
    uint256 timestamp
);
event TierAdvanced(uint256 indexed newTierIndex, uint256 newPriceUSD);
event PoolReplenished(uint256 amount, uint256 newBalance);

// 历史记录（链上事件，配合 SQLite 缓存）
struct SaleRecord {
    address buyer;
    address recipient;
    address paymentToken;
    uint256 paymentAmount;
    uint256 gtokenAmount;
    uint256 priceUSD;
    uint256 tierIndex;
    bool truncated;
    uint256 timestamp;
    bytes32 txHash;
}
```

**价格喂价**（Chainlink）：
- USDC/USDT：1:1 USD，直接用（6位精度）
- ETH/USD：`AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306)` (Sepolia)
- WBTC/USD：Chainlink BTC/USD feed

---

#### aPNTs 销售合约（浮动定价）

**定价模型**：

- 基准价：$0.02 USD（管理员设置，`20000` in 6 decimals）
- 管理员可手动调整（价格范围：`MIN_PRICE = $0.018`，`MAX_PRICE = $0.030`）
- `monthlyServiceCapacityUSD`：默认 $10,000，超过时前端显示服务能力预警
- Mint 来源：communityOwner 预 mint 到合约池，管理员调用 `replenishPool()` 补充
- `adminMint()`：保留，直接绕过销售价格发放（需记录 reason）

```solidity
// APNTsSaleContract.sol

// 状态变量
IxPNTsToken public aPNTs;           // xPNTs 实例（aPNTs）
address public treasury;
uint256 public priceUSD;            // 当前价格（6 decimals，默认 20000 = $0.02）
uint256 public poolBalance;         // 预分配池余额
mapping(address => bool) public acceptedPaymentTokens;

// 管理员函数
function setPrice(uint256 newPriceUSD) external onlyOwner; // $0.018-$0.025 范围
function setAcceptedToken(address token, bool accepted) external onlyOwner;
function setTreasury(address _treasury) external onlyOwner;
function replenishPool(uint256 amount) external onlyOwner;  // 管理员 mint → 补充池
function pause() / unpause() external onlyOwner;

// 用户购买
function buyAPNTs(
    address paymentToken,
    uint256 paymentAmount,
    address recipient
) external payable nonReentrant whenNotPaused
  returns (uint256 apntsAmount);

// 管理员直接 Mint（保留，绕过销售）
function adminMint(
    address recipient,
    uint256 amount,
    string calldata reason    // 原因标签
) external onlyOwner;

// 查询
function getCurrentPrice() external view returns (uint256 priceUSD);
function getQuote(address paymentToken, uint256 paymentAmount)
    external view returns (uint256 apntsAmount);
function getMintHistory(uint256 offset, uint256 limit)
    external view returns (MintRecord[] memory);

// 所有 mint 行为统一记录（销售 + adminMint + airdrop）
struct MintRecord {
    address operator;        // 操作人
    address recipient;
    uint256 amount;
    address paymentToken;    // address(0) = admin mint
    uint256 paymentAmount;   // 0 = admin mint
    uint256 priceUSD;        // 0 = admin mint
    string reason;           // "sale" | "admin_mint" | "airdrop"
    uint256 timestamp;
    bytes32 txHash;
}
event APNTsMinted(
    address indexed operator, address indexed recipient,
    uint256 amount, address paymentToken,
    uint256 paymentAmount, string reason, uint256 timestamp
);
```

### 4.3 Mint 权限方案总结

| Token | Mint 权限 | 销售合约方式 | 管理员直接 Mint |
|---|---|---|---|
| **GToken** | onlyOwner | Owner 预转池 → 合约 transfer 分发 | Owner 直接 transfer |
| **aPNTs** | FACTORY 或 communityOwner | communityOwner 预 mint → 补充池 | communityOwner 直接 mint |
| **MySBT** | onlyRegistry | 不涉及 | Registry 在角色注册时自动 mint |

### 4.4 销售页面

**路由：`/sale`（公开，无需登录）**

```
销售页（/sale）
├── GToken 购买区
│   ├── 当前阶梯：Tier N，$X.XX/GT
│   ├── 进度条：已售 X GT / 本阶梯上限 Y GT
│   ├── 支付代币：USDC | USDT | WETH | WBTC | ETH
│   ├── 支付金额输入 → 实时显示可得 GT
│   ├── 接收地址（默认 = 当前账户，可自定义）
│   ├── [获取 GToken] 按钮 → Passkey 确认
│   └── 我的购买记录
│
├── aPNTs 购买区
│   ├── 当前价格：$0.02/aPNTs
│   ├── 支付代币：USDC | USDT | WETH | WBTC | ETH
│   ├── 支付金额输入 → 实时显示可得 aPNTs
│   ├── 接收地址
│   ├── [获取 aPNTs] 按钮 → Passkey 确认
│   └── 我的购买记录
│
└── 全局销售历史（链上 getLogs，公开可查）
    ├── GToken 销售记录（最近 100 条）
    └── aPNTs 销售/Mint 记录（最近 100 条，含 admin mint）
```

---

## 五、角色生命周期与业务流程

### 5.1 Protocol Admin 生命周期

```
[持有合约 Owner 权限]
         │
    ┌────┴───────────────────────────────┐
    ▼                                    ▼
[配置角色参数]                      [配置 SuperPaymaster]
adminConfigureRole(roleId,             setProtocolFee(BPS)
  minStake, entryBurn,                 setTreasury(address)
  exitFeePercent, minExitFee)          setOperatorPaused(addr, true) ← 紧急
         │
    ┌────┴───────────────────────────────┐
    ▼                                    ▼
[管理销售合约]                      [转移所有权 → DAO]
GToken: setTiers() / 充值池           transferOwnership(daoAddress)
aPNTs:  setPrice() / adminMint()      ⚠️ 不可逆，弹窗二次确认
```

**关键函数：**
- `adminConfigureRole(roleId, minStake, entryBurn, exitFeePercent, minExitFee)`
- `setProtocolFee(newFeeBPS)` / `setTreasury(address)`
- `setOperatorPaused(operatorAddress, isPaused)`
- `transferOwnership(daoAddress)`

---

### 5.2 Community Admin 生命周期

```
[注册/登录 Email + Passkey]
         │
         ▼
[检查 GToken 余额 ≥ 33 GT]
  不足 → 引导 /sale 购买
         │
         ▼
[填写社区信息]
  name, ensName, website, logoURI, sbtRules
         │
         ▼
[多步骤执行 launchCommunity()]
  Step 1/3: Approve GToken → TX
  Step 2/3: Register ROLE_COMMUNITY（stake 30 GT, burn 3 GT）→ TX
  Step 3/3: Configure community → TX
         │
         ▼
[社区创建成功] communityId = msg.sender 地址
         │
    ┌────┴──────────────────┐
    ▼                       ▼
[部署 xPNTs Token]      [配置 SBT 规则]
xPNTsFactory.deployxPNTsToken()  configureSBTRules()
  name, symbol                   minStake, maxSupply, mintPrice
  communityName, communityENS
  exchangeRate, paymasterAOA
         │
         ▼
[日常运营]
  getCommunityStats() → totalMembers, totalStaked, xpntsSupply, reputationAvg
         │
         ▼
[退出]
  previewExitFee() → { fee, netAmount }
  initiateExit() → [30天锁定] → withdrawStake()
```

**注意：**
- xPNTs 部署后 xPNTsFactory 自动设置 `SUPERPAYMASTER` 为 autoApprovedSpender
- communityOwner 可 mint xPNTs（用于 aPNTs 销售池补充）

---

### 5.3 SuperPaymaster Operator 生命周期

```
[已有 ROLE_COMMUNITY + 55 GT + aPNTs]
         │
         ▼
[PreflightCheck]
  ✅ hasRole(ROLE_COMMUNITY)
  ✅ GToken ≥ 55 GT
  ✅ aPNTs > 0（引导购买）
         │
         ▼
[多步骤注册]
  Step 1/4: Approve GToken → TX
  Step 2/4: registerAsSuperPaymasterOperator(stakeAmount=50GT) → TX
  Step 3/4: Approve aPNTs → TX
  Step 4/4: depositCollateral(aPNTs amount) → TX
         │
         ▼
[configureOperator]
  xPNTsToken: 社区 xPNTs 地址（Factory 验证归属）
  treasury: 收款地址
  exchangeRate: aPNTs:xPNTs 比率
         │
         ▼
[运营 Dashboard]
  getOperatorDetails() →
    aPNTsBalance     ← 可赞助额度
    reputation       ← 0-100（影响用户选择）
    isPaused         ← 是否被协议暂停
    totalSpent       ← 累计赞助 Gas
    totalTxSponsored ← 累计交易数
         │
    ┌────┴──────────────────────┐
    ▼                           ▼
[补充 aPNTs]               [添加 Gas 代币]
depositCollateral(amount)    addGasToken(token, price)
withdrawCollateral(amount)
         │
         ▼
[退出流程]
  previewExitFee() → { fee, netAmount }
  initiateExit() → TX（记录 unstakeRequestedAt）
  → [30天倒计时] →
  withdrawAllFunds()
    1. withdrawCollateral（提取 aPNTs）
    2. unlockStake（解锁 GT）
    3. withdrawStake（提取 GT）
    4. exitRole（注销）
```

**核心验证逻辑（来自合约源码）：**
- `configureOperator` 要求 ROLE_PAYMASTER_SUPER + ROLE_COMMUNITY 双重验证
- xPNTsToken 必须经 xPNTsFactory 验证归属（防伪造）
- `validatePaymasterUserOp` 检查：isConfigured + !isPaused + sbtHolder + !blocked + aPNTsBalance

---

### 5.4 PaymasterV4 Operator 生命周期

```
[已有 ROLE_COMMUNITY + 33 GT]
         │
         ▼
[多步骤部署]
  Step 1/2: Approve GToken → TX
  Step 2/2: deployAndRegisterPaymasterV4(stakeAmount=30GT) → TX
    → Factory 部署 PaymasterV4 合约
    → 注册 ROLE_PAYMASTER_AOA
    → 返回 { paymasterAddress, deployHash, registerHash }
         │
         ▼
[充值 ETH]
  deposit(ethAmount) → 发送 ETH 到 paymasterAddress
         │
         ▼
[运营 Dashboard]
  getDeposit() ← ETH 余额
  setTokenPrice(token, priceUSD)
  setServiceFeeRate(feeBPS)
  paused 状态监控
         │
         ▼
[退出流程同 SPO]
```

---

### 5.5 End User 生命周期

```
[首次访问]
         │
         ▼
[Email + Passkey 注册]
  → Smart Account 地址预分配
         │
         ▼
[获取 MySBT]（两种路径）
  A: 社区管理员 airdropMint(userAddress) ← 免费
  B: 用户满足社区 SBT 规则后主动 mint
         │
         ▼
[注册 ROLE_ENDUSER]（可选）
  质押 0.3 GT + 燃烧 0.05 GT，锁定 7天
         │
         ▼
[使用 gasless 交易]
  1. 选择 Paymaster（按 reputation 排序）
  2. 构建 UserOperation
  3. Passkey 确认签名（biometric）
  4. Bundler 提交，SPO 赞助 Gas
  5. 返回 TX Hash，Gas 费 $0
         │
         ▼
[查看账户状态]
  SBTData: firstCommunity, totalCommunities, memberships
  getGlobalReputation(address) → score
  getCreditLimit(address) → creditLimit
  TransferRecord[] → 历史交易
         │
         ▼
[加入更多社区]
  verifyCommunityMembership(communityId)
```

---

## 六、核心数据结构

### 6.1 角色配置

```typescript
interface RoleConfigDetailed {
  minStake: bigint;            // GT (wei)
  entryBurn: bigint;           // GT (wei)
  exitFeePercent: number;      // BPS
  minExitFee: bigint;          // GT (wei)
  roleLockDuration: bigint;    // seconds
  isActive: boolean;
  description: string;
  owner: Address;
  slashThreshold: number;
  slashBase: number;
  slashMax: number;
}
```

### 6.2 质押信息

```typescript
interface StakeInfo {
  amount: bigint;
  slashedAmount: bigint;
  stakedAt: bigint;
  unstakeRequestedAt: bigint;   // 0 = 未申请退出
}

interface ExitPreview {
  fee: bigint;                  // 退出手续费
  netAmount: bigint;            // 实际退还金额
}
```

### 6.3 Operator 配置（SuperPaymaster 链上结构）

```typescript
// OperatorConfig（SuperPaymaster.sol struct）
{
  aPNTsBalance: bigint;       // uint128，已存入的 aPNTs
  exchangeRate: bigint;       // uint96，xPNTs:aPNTs 兑换率
  xPNTsToken: Address;        // 关联社区 xPNTs
  treasury: Address;          // 收款地址
  isConfigured: boolean;
  isPaused: boolean;
  reputation: number;         // uint32，0-100
  totalSpent: bigint;
  totalTxSponsored: bigint;
  minTxInterval: number;      // uint48，速率限制
}
```

### 6.4 社区配置

```typescript
interface CommunityLaunchConfig {
  name: string;
  ensName?: string;
  website?: string;
  logoURI?: string;
  stakeAmount: bigint;        // 30 GT (wei)
  entryBurn?: bigint;         // 3 GT (wei)
  sbtRules?: {
    minStake: bigint;
    maxSupply: bigint;
    mintPrice: bigint;
  };
}

interface CommunityStats {
  totalMembers: number;
  totalStaked: bigint;
  xpntsSupply: bigint;
  reputationAvg: number;
}
```

### 6.5 xPNTs Token（社区积分）

```typescript
// xPNTsToken 关键状态（链上）
{
  FACTORY: Address;             // xPNTsFactory（immutable）
  communityOwner: Address;      // 社区管理员
  SUPERPAYMASTER_ADDRESS: Address; // auto-approved
  autoApprovedSpenders: Map<Address, boolean>;
  debts: Map<Address, bigint>;  // 用户欠款（gas赞助债务）
  exchangeRate: bigint;
  MAX_SINGLE_TX_LIMIT: bigint;  // 5000 ether，单笔限额
}
```

### 6.6 用户账户（AirAccount）

```typescript
interface AccountRecord {
  userId: string;               // 内部用户 ID
  address: string;              // Smart Account 地址（ERC-4337）
  signerAddress: string;        // KMS 派生 EOA
  salt: number;
  deployed: boolean;
  deploymentTxHash: string | null;
  validatorAddress: string;
  entryPointVersion: '0.6' | '0.7' | '0.8';
  factoryAddress: string;
  createdAt: string;
}

interface PasskeyInfo {
  credentialId: string;
  publicKey: string;            // P-256 hex
  counter: number;
  deviceType: string;           // 'platform' | 'cross-platform'
  createdAt: string;
}
```

### 6.7 销售记录

```typescript
interface GTokenSaleRecord {
  buyer: Address;
  recipient: Address;
  paymentToken: Address;
  paymentAmount: bigint;
  gtokenAmount: bigint;
  priceUSD: bigint;             // 6 decimals
  tierIndex: number;
  timestamp: number;
  txHash: string;
}

interface GTokenTier {
  revenueTarget: bigint;        // 本层收入目标（USD, 6 decimals，e.g. 1_200_000000n = $1,200）
  priceUSD: bigint;             // 本层单价（6 decimals，e.g. 150000n = $0.15）
  perPersonMaxUSD: bigint;      // 个人上限（0 = 自动 1% of revenueTarget）
  whitelistRequired: boolean;   // 默认 false
}

interface APNTsMintRecord {
  operator: Address;
  recipient: Address;
  amount: bigint;
  paymentToken?: Address;
  paymentAmount?: bigint;
  priceUSD?: bigint;
  reason: 'sale' | 'admin_mint' | 'airdrop';
  timestamp: number;
  txHash: string;
}
```

### 6.8 交易记录（AirAccount）

```typescript
interface TransferRecord {
  id: string;
  userId: string;
  from: string;
  to: string;
  amount: string;
  data?: string;
  userOpHash: string;
  transactionHash?: string;
  status: 'pending' | 'submitted' | 'completed' | 'failed';
  error?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  createdAt: string;
  completedAt?: string;
}
```

---

## 七、角色间交互关系

```
┌────────────────────────────────────────────────────────────────┐
│                   Protocol Admin（合约 Owner）                  │
│                                                                 │
│  adminConfigureRole() → 影响所有角色注册门槛                     │
│  setProtocolFee()     → 影响 SPO 赞助收益                       │
│  setOperatorPaused()  → 紧急停止特定 SPO                       │
│  管理销售合约          → 控制 GToken/aPNTs 流通                 │
└───────────────────────────┬────────────────────────────────────┘
                            │ adminConfigureRole
               ┌────────────▼─────────────┐
               │     Registry 合约         │
               │  角色/质押/权限/SBT管理   │
               └──┬────────────────┬───────┘
         注册      │                │ 注册
    ┌──────────────▼──┐       ┌─────▼──────────────┐
    │  Community Admin │       │  SPO / V4 Operator  │
    │                  │       │                     │
    │ launchCommunity()│       │ registerAsSPO()     │
    │ deployxPNTs()    │       │ deployV4()          │
    │ configureSBT()   │       │ depositCollateral() │
    └──────┬───────────┘       └──────────┬──────────┘
           │ 归属                          │ 赞助 Gas
           │ communityOwner               │ validatePaymasterUserOp
           │                              │ postOp → recordDebt(xPNTs)
    ┌──────▼──────────────────────────────▼──────────┐
    │                  End User                       │
    │                                                 │
    │  Email + Passkey → Smart Account（ERC-4337）    │
    │  MySBT（via Registry airdropMint/mintForRole）  │
    │  UserOp → SPO 赞助 Gas → xPNTs 记债务           │
    └─────────────────────────────────────────────────┘
                  ▲
                  │ 购买
    ┌─────────────┴──────────────┐
    │     销售合约（X402 模式）   │
    │                            │
    │  GTokenSaleContract        │
    │  • 无限阶梯，默认 +12%/阶   │
    │  • 预分配池（Owner 充值）   │
    │  • USDC/USDT/WETH/WBTC/ETH │
    │  • 接收地址可与付款方不同   │
    │                            │
    │  APNTsSaleContract         │
    │  • 浮动定价（$0.02 基准）   │
    │  • communityOwner 充池      │
    │  • 管理员 adminMint 保留    │
    │  • 所有 mint 记录可查       │
    └────────────────────────────┘
```

---

## 八、页面结构设计

### 路由总览

```
/                       → 检测角色，跳转对应门户（未连接→/login）
/login                  → Email + Passkey 登录/注册
/sale                   → Token 销售页（公开）
│
├── /protocol-admin     [DEFAULT_ADMIN]
│   ├── /overview       → 协议状态（所有角色配置 + 合约地址）
│   ├── /roles          → 角色参数配置（CRUD + 实时链上读取）
│   ├── /superpaymaster → SP 全局配置（fee/treasury/pause operator）
│   ├── /mint           → 管理员 Mint（GToken 充池/aPNTs adminMint）
│   └── /transfer-dao   → 移交 DAO（不可逆，需两次确认）
│
├── /community          [ROLE_COMMUNITY]
│   ├── /overview       → 社区状态（未创建→引导）
│   ├── /launch         → 创建社区向导（3步骤）
│   ├── /members        → 成员列表 + SBT 管理 + airdropMint
│   ├── /tokens         → xPNTs 管理（发行/余额/exchangeRate）
│   └── /sbt-rules      → SBT 规则配置
│
├── /operator           [ROLE_PAYMASTER_SUPER | ROLE_PAYMASTER_AOA]
│   ├── /overview       → 运营总览（aPNTs/reputation/统计）
│   ├── /register       → 注册向导（SPO Tab + V4 Tab）
│   ├── /collateral     → aPNTs 管理（充值/提取）[SPO only]
│   ├── /deposit        → ETH 充值 [V4 only]
│   ├── /gas-tokens     → Gas 代币配置
│   └── /exit           → 退出流程（含退出费预览 + 倒计时）
│
└── /user               [ROLE_ENDUSER / 无角色]
    ├── /overview       → 账户状态（SBT/社区/声誉/credit）
    ├── /get-sbt        → 获取 MySBT 引导
    ├── /gasless        → Gasless 交易测试
    └── /history        → UserOp 历史记录
```

### 公共组件规范

| 组件 | 功能 | 关键 SDK 调用 |
|---|---|---|
| `RoleGuard` | 角色检测，无权显示引导而非报错 | `Registry.getUserRoles(address)` |
| `MultiStepTx` | 多步骤 TX 进度条（N/N，含 Hash） | - |
| `PreflightCheck` | 操作前条件检查，缺失项显示具体引导 | `checkRequirements()` |
| `TokenBalance` | 实时余额显示（GT/aPNTs/ETH） | `ERC20Actions.balanceOf()` |
| `GasEstimate` | 写操作前预估 Gas | viem `estimateGas` |
| `ExitFeePreview` | 退出前预览净得金额 | `staking.previewExitFee()` |
| `TxHistory` | 交易历史列表 | `TransferRecord[]` |
| `SaleHistory` | 销售历史（链上 getLogs） | viem `getLogs` |

---

## 九、主要业务场景操作步骤

### 场景 A：新用户注册 → 购买 GToken → 成为 Community Admin

```
Step 1: 访问 /login
  → 输入 Email + Username
  → 浏览器 Passkey 注册（生物识别）
  → Smart Account 地址生成（懒部署）
  → 跳转 /user/overview

Step 2: 访问 /sale
  → 当前 GToken 价格：$X.XX（Tier N）
  → 选择 USDC，输入 $50
  → 显示可得 ~50 GT
  → 接收地址：自己
  → [购买 GToken] → Passkey 确认
  → TX 执行，余额更新

Step 3: 访问 /community（显示「注册社区」引导）
  → /community/launch 向导
  → 填写社区信息
  → Step 1/3: Approve GT → TX
  → Step 2/3: Register Community → TX
  → Step 3/3: Configure → TX
  → 成功！communityId 显示
```

---

### 场景 B：SPO 注册完整流程

```
Step 1: /operator/register → Tab: SuperPaymaster Operator
  PreflightCheck:
    ✅ ROLE_COMMUNITY
    ✅ GT ≥ 55
    ❌ aPNTs 不足 → [购买 aPNTs 引导 /sale]

Step 2: 配置（aPNTs 充足后）
  • 质押量：50 GT
  • aPNTs 抵押量：输入框

Step 3: 多步骤执行（进度条）
  [1/4] Approve GToken  → TX + wait
  [2/4] Register SPO    → TX + wait
  [3/4] Approve aPNTs  → TX + wait
  [4/4] Deposit        → TX + wait

Step 4: configureOperator
  • xPNTs Token（从 xPNTsFactory 查询当前账户部署的 token）
  • Treasury 地址
  • Exchange Rate（建议 1e18）
  → TX + wait

Step 5: 跳转 /operator/overview
  显示：aPNTs 余额、reputation=100、isPaused=false
```

---

### 场景 C：Protocol Admin 紧急暂停 Operator

```
Step 1: /protocol-admin/superpaymaster
  → 显示所有 active operators（链上 getLogs OperatorDeposited）

Step 2: 找到问题 Operator，点击「紧急暂停」
  → 弹窗确认：暂停后该 Operator 无法赞助任何交易
  → [确认暂停] → Passkey 签名

Step 3: setOperatorPaused(operatorAddress, true) → TX
  → 链上更新 isPaused = true
  → Operator Dashboard 实时显示暂停状态
```

---

### 场景 D：End User Gasless 交易

```
Step 1: /user/gasless
  → PreflightCheck: MySBT ✅（无 SBT → 引导 /user/get-sbt）

Step 2: 选择 Paymaster
  → 列表：按 reputation 排序
  → 显示：aPNTs 余额、赞助交易数、声誉分

Step 3: 填写交易
  • 目标合约
  • calldata
  • 预估 Gas 展示

Step 4: [发送] → Passkey 确认
  → UserOp 提交 Bundler
  → SPO validatePaymasterUserOp → 通过
  → 链上执行
  → postOp 记录 xPNTs 债务

Step 5: 结果
  • TX Hash（Etherscan 链接）
  • Gas：用户 $0 / 赞助：X aPNTs
```

---

### 场景 E：Operator 退出

```
Step 1: /operator/exit
  → previewExitFee() 显示：
    已质押：50 GT
    退出费：5 GT（10%）
    实际退还：45 GT
  → ⚠️ 30天锁定期警告

Step 2: [发起退出] → initiateExit() → TX
  → 记录 unstakeRequestedAt

Step 3: 等待页面
  → 倒计时：还剩 29天 23小时 59分
  → 当前 aPNTs 仍可继续赞助（直到全部退出）

Step 4: 锁定期满，[提取资金]
  → withdrawAllFunds()（批量 TX）
    [1/4] 提取 aPNTs 抵押
    [2/4] 解锁 GT 质押
    [3/4] 提取 GT
    [4/4] 注销角色
  → 完成，余额到账
```

---

## 十、技术栈与合约地址

### Sepolia 合约地址（@aastar/core v0.16.23）

```typescript
// 来源：aastar-sdk/packages/core/src/contract-addresses.ts
const SEPOLIA = {
  registry:         '0x7Ba70C5bFDb3A4d0cBd220534f3BE177fefc1788',
  gToken:           '0x9ceDeC089921652D050819ca5BE53765fc05aa9E',
  gTokenStaking:    '0x1118eAf2427a5B9e488e28D35338d22EaCBc37fC',
  superPaymaster:   '0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A',
  paymasterFactory: '0xfDE4671581F21C9e54Cafa95FA6Da98678750F4d',
  paymasterV4:      '0xD0c82dc12B7d65b03dF7972f67d13F1D33469a98',
  xPNTsFactory:     '0x6EafdA3477F3eec1F848505e1c06dFB5532395b6',
  entryPoint:       '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  aPNTs:            '0xDf669834F04988BcEE0E3B6013B6b867Bd38778d',
  mySBT:            '0x677423f5Dad98D19cAE8661c36F094289cb6171a',
  // Chainlink Price Feed
  ethUsdPriceFeed:  '0x694AA1769357215DE4FAC081bf1f309aDC325306',
};
```

### 技术栈

| 层 | 方案 | 理由 |
|---|---|---|
| 前端框架 | React 19 + Vite | 对齐 registry，支持角色动态路由 |
| 样式 | TailwindCSS 4 | 对齐 registry，快速开发 |
| 状态管理 | Zustand | 轻量，适合角色+账户全局状态 |
| 账户/登录 | @aastar/airaccount YAAAClient | Email + Passkey，无 MetaMask |
| 链交互 | viem + @aastar/sdk | 对齐 SDK 生态 |
| 合约调用 | @aastar/sdk (L2/L3) | createCommunityClient 等高层 API |
| 后端 | api.aastar.io（官方服务） | 无需自部署，用官方 KMS |
| 打包 | pnpm workspace | 对齐现有 monorepo |
| 网络 | Sepolia（初期），可扩展 OP Mainnet | SDK 已支持多链 |

### SDK 层次对照

| SDK 层 | 用于 | 示例 |
|---|---|---|
| L1（Actions） | 直接合约调用 | `registryActions.hasRole()` |
| L2（Client） | 封装常用操作 | `PaymasterOperatorClient.deployAndRegisterPaymasterV4()` |
| L3（Lifecycle） | 完整业务流程 | `createCommunityClient().launch()` |
| L4（Regression） | 测试/验证用 | `run_full_regression.sh` |

---

## 十一、已确认设计决策（Q1-Q10）

> 用户于 2026-03-13 逐条回答，以下为正式设计锁定内容。

| # | 问题 | 确认答案 |
|---|---|---|
| Q1 | GToken 销售池充值方式 | Protocol Admin 页面内有「充值池」入口，手动操作 |
| Q2 | aPNTs 销售池充值方式 | 与 Q1 一致，Community Admin 页面内有「aPNTs 充值」入口 |
| Q3 | Protocol Admin 是否也使用 AirAccount | 是，所有角色统一用 Email + Passkey（无 MetaMask） |
| Q4 | Admin 页面「mint 管理」范围 | 包含：GToken 充值池 + aPNTs adminMint + aPNTs 充池 |
| Q5 | 超出个人购买上限如何处理 | 自动截断（不失败），页面显示说明；同一地址可跨多层购买 |
| Q6 | AirAccount 服务配置来源 | 使用官方服务 api.aastar.io；配置（KMS_API_KEY 等）由同事提供 |
| Q7 | Admin 操作是否通过 UserOp（AirAccount）| 是，目标是全程 AirAccount；**但开发顺序**：Phase 1 临时 MetaMask，Phase 2 接入 AirAccount |
| Q8 | aPNTs 是否无购买上限 | 是，无上限；但 `monthlyServiceCapacityUSD`（$10k/月）超出时前端显示预警 |
| Q9 | 历史数据查询 + 存储方式 | 缓存到 SQLite（轻量 Express 后端），定期同步链上 getLogs |
| Q10 | 关键管理操作的 Timelock 策略 | `adminConfigureRole`: 24h UI 提前公告（链上暂不加 Timelock）；`transferOwnership`: 双确认弹窗；紧急操作（pause/price）: 实时生效 |

### 待获取配置（同事提供后进入 Phase 2）

| 配置项 | 用途 | Phase |
|---|---|---|
| `AASTAR_API_URL` | AirAccount 官方服务 URL | Phase 2 |
| `KMS_API_KEY` | kms1.aastar.io 认证 | Phase 2 |
| `BLS_SEED_NODES` | BLS 签名节点列表 | Phase 2 |
| `BUNDLER_RPC_URL` | ERC-4337 Bundler 端点 | Phase 2 |
| `DVT_NODE_ADDRESS` | DVT 验证节点地址（Sepolia） | Phase 2 |
| aPNTs communityOwner key | aPNTs 销售池充值授权 | Phase 3 |
| GToken Owner key | GToken 销售池充值 | Phase 3 |

---

## 十二、三阶段开发计划

### 总体策略

```
Phase 1 → SDK Admin Panel（MetaMask 临时钱包）
Phase 2 → AirAccount 集成（Email + Passkey 替换 MetaMask）
Phase 3 → 销售合约开发 + 页面集成
```

---

### Phase 1：SDK Admin Panel（基础管理面板）

**目标**：4 个角色 Portal 全部可用，核心合约交互跑通，使用 MetaMask 临时签名
**预计周期**：2 周

#### 1.1 项目初始化

- [ ] React 19 + Vite + TailwindCSS 4 项目初始化
- [ ] pnpm workspace 配置
- [ ] 安装依赖：`@aastar/sdk`、`@aastar/core`、`viem`、`zustand`、`react-router-dom`
- [ ] 临时使用 `window.ethereum`（MetaMask）连接钱包
- [ ] 全局 viem `publicClient`（Sepolia）初始化

#### 1.2 公共基础设施

- [ ] `RoleGuard` 组件（读取 Registry.getUserRoles，按角色路由）
- [ ] `MultiStepTx` 组件（N/N 步骤进度条 + TX Hash 显示）
- [ ] `PreflightCheck` 组件（前置条件检查 + 引导）
- [ ] `TokenBalance` 组件（GT/aPNTs/ETH 余额实时展示）
- [ ] `ExitFeePreview` 组件（退出费预览）
- [ ] 全局 Zustand store（account, roles, chainId）
- [ ] Sepolia 合约地址常量文件（来自 @aastar/core）

#### 1.3 Protocol Admin Portal（`/protocol-admin`）

- [ ] `/protocol-admin/overview` — 协议全览（所有角色参数 + 合约地址）
- [ ] `/protocol-admin/roles` — 角色参数配置（adminConfigureRole，24h UI 公告提示）
- [ ] `/protocol-admin/superpaymaster` — SP 全局配置（protocolFee/treasury/pause Operator）
- [ ] `/protocol-admin/mint` — 池管理
  - [ ] GToken 充值池（replenishPool，显示当前 poolBalance）
  - [ ] aPNTs adminMint（直接 mint，填 reason）
  - [ ] aPNTs 充池（communityOwner mint → replenishPool）
- [ ] `/protocol-admin/transfer-dao` — 移交 DAO（双确认弹窗，不可逆警告）

#### 1.4 Community Admin Portal（`/community`）

- [ ] `/community/overview` — 社区状态（未创建 → 引导 /community/launch）
- [ ] `/community/launch` — 创建社区向导（3步：Approve → Register → Configure）
- [ ] `/community/members` — 成员列表 + SBT airdropMint
- [ ] `/community/tokens` — xPNTs 管理（deploy / 余额 / exchangeRate）
- [ ] `/community/sbt-rules` — SBT 规则配置

#### 1.5 Paymaster Operator Portal（`/operator`）

- [ ] `/operator/overview` — 运营总览（aPNTs/reputation/统计）
- [ ] `/operator/register` — 注册向导
  - [ ] SPO Tab（4步：Approve GT → Register → Approve aPNTs → Deposit）
  - [ ] V4 Tab（2步：Approve GT → Deploy+Register，然后充 ETH）
- [ ] `/operator/collateral` — aPNTs 管理（存入/提取）[SPO]
- [ ] `/operator/deposit` — ETH 充值 [V4]
- [ ] `/operator/gas-tokens` — Gas 代币价格配置
- [ ] `/operator/exit` — 退出流程（30天倒计时 + 批量 withdrawAllFunds）

#### 1.6 End User Portal（`/user`）

- [ ] `/user/overview` — 账户状态（SBT/社区/声誉/credit）
- [ ] `/user/get-sbt` — 获取 MySBT 引导
- [ ] `/user/gasless` — Gasless 交易测试（选择 Paymaster → 构建 UserOp → 发送）
- [ ] `/user/history` — UserOp 历史记录

#### 1.7 登录页（Phase 1 临时）

- [ ] `/login` — MetaMask 连接按钮（临时，Phase 2 替换为 Passkey）
- [ ] 连接后读取链上角色，跳转对应 Portal

---

### Phase 2：AirAccount 集成

**目标**：将所有签名操作替换为 Email + Passkey（YAAAClient）
**前置条件**：同事提供 `AASTAR_API_URL` / `KMS_API_KEY` / `BLS_SEED_NODES` / `BUNDLER_RPC_URL`
**预计周期**：1.5 周

#### 2.1 AirAccount 核心集成

- [ ] 安装 `@aastar/airaccount`
- [ ] `YAAAClient` 初始化（apiURL + tokenProvider + bls.seedNodes）
- [ ] 替换 MetaMask connect → Email + Passkey 注册/登录流程（Section 3.2-3.3）
- [ ] 替换 MetaMask sign → `PasskeyManager.verifyTransaction()` + `KmsManager.signHashWithWebAuthn()`
- [ ] 账户状态（SmartAccount 地址 / signerAddress / deployed 状态）

#### 2.2 页面更新

- [ ] `/login` — 完整 Email + Passkey 界面（替换 MetaMask 按钮）
  - [ ] 注册：输入 Email + Username → startRegistration → pollUntilReady
  - [ ] 登录：Passkey 认证 → 读取角色 → 跳转
- [ ] 所有 TX 操作 → Passkey 确认弹窗（biometric 提示 + Challenge 显示）
- [ ] 账户信息显示：SmartAccount 地址 / SBT / 声誉分

#### 2.3 UserOp 流程集成

- [ ] `@aastar/sdk createCommunityClient` 传入 AirAccount signer
- [ ] Bundler 提交 UserOp（通过 `BUNDLER_RPC_URL`）
- [ ] TX 确认轮询 + 结果展示（Hash / Gas sponsorship 信息）

---

### Phase 3：销售合约开发 + 页面集成

**目标**：实现 GTokenSaleContract.sol + APNTsSaleContract.sol，并集成销售页面
**预计周期**：2.5 周

#### 3.1 GTokenSaleContract.sol（contracts/sale/src/）

- [ ] 实现收入驱动阶梯定价核心逻辑
  - [ ] `Tier` struct（revenueTarget / priceUSD / perPersonMaxUSD / whitelistRequired）
  - [ ] `initTiers()` 初始化 4 层配置（$0.15 起，+12%，revenueTarget 驱动）
  - [ ] `buyGToken()` 含自动截断逻辑（truncated = true 时退还多余 ETH/token）
  - [ ] `tierSpent` mapping（个人限额追踪，跨多层自动叠加）
  - [ ] `TierAdvanced` 事件（当 currentTierRevenue >= revenueTarget 时触发）
- [ ] Chainlink 价格喂价集成（ETH/USD feed on Sepolia）
- [ ] 支持 USDC / USDT / WETH / WBTC / ETH 支付
- [ ] `replenishPool()` — Owner 转 GToken 入合约
- [ ] Pause / Unpause（OpenZeppelin Pausable）
- [ ] X402 支持（BuyPermit EIP-712 结构）

#### 3.2 APNTsSaleContract.sol（contracts/sale/src/）

- [ ] 浮动定价逻辑（MIN_PRICE=$0.018，MAX_PRICE=$0.030，默认$0.02）
- [ ] `monthlyServiceCapacityUSD` = $10,000 容量预警（只读事件，非强制限流）
- [ ] `buyAPNTs()` — 预分配池模式
- [ ] `adminMint()` — 直接发放（记录 reason + 事件）
- [ ] `replenishPool()` — communityOwner 预 mint → 补充合约池
- [ ] 全量 MintRecord 事件（sale / admin_mint / airdrop 统一记录）

#### 3.3 合约测试（Foundry）

- [ ] GTokenSaleContract 单元测试
  - [ ] 收入驱动阶梯跃迁测试
  - [ ] 个人限额截断测试（多地址 / 跨轮次）
  - [ ] 多支付 token 测试（USDC / ETH）
  - [ ] 池耗尽边界测试
- [ ] APNTsSaleContract 单元测试
- [ ] 集成测试（Sepolia fork）

#### 3.4 销售页面（`/sale`）

- [ ] GToken 购买区
  - [ ] 当前层级显示（Tier N，$X.XX/GT，主题名）
  - [ ] 本层进度条（currentTierRevenue / revenueTarget）
  - [ ] 支付代币选择 + 金额输入 + 实时报价（getQuote）
  - [ ] 个人剩余限额显示（getRemainingPersonalLimit）
  - [ ] 截断提示（"您的购买已自动调整至限额"）
  - [ ] Passkey 确认 + TX 执行
  - [ ] 我的购买记录（SQLite 查询）
- [ ] aPNTs 购买区
  - [ ] 当前价格 + 服务能力预警（接近 $10k/月）
  - [ ] 支付 + 报价 + 确认流程
- [ ] 全局销售历史（SQLite 缓存，公开可查）

#### 3.5 SQLite 事件缓存后端

- [ ] 轻量 Express 后端（`server/` 目录）
- [ ] SQLite 表：`gtoken_sales`, `apnts_mints`, `sync_state`
- [ ] 定期同步任务（每 5 分钟 getLogs → 写入 DB）
- [ ] REST API：
  - `GET /api/sales/gtoken?buyer=&offset=&limit=`
  - `GET /api/sales/apnts?operator=&offset=&limit=`
  - `GET /api/sales/stats` — 总统计（各层已售量/收入/当前层信息）

#### 3.6 Protocol Admin 销售管理集成

- [ ] GToken 池管理页面增强（显示当前层/进度/预计何时跃迁）
- [ ] initTiers 配置界面（修改各层参数，含预览计算）
- [ ] 销售数据看板（总收入/各层状态/大买家排行）

---

### 全量任务清单（待开发）

| 优先级 | Phase | 模块 | 任务 |
|---|---|---|---|
| P0 | 1 | 基础 | 项目初始化 + RoleGuard + MultiStepTx |
| P0 | 1 | Protocol Admin | roles / superpaymaster / mint 管理 |
| P0 | 1 | Operator | SPO 注册（4步骤完整流程）|
| P0 | 1 | Community | launch 向导（3步骤）|
| P1 | 1 | User | gasless 交易测试 |
| P1 | 1 | 公共 | ExitFeePreview / 退出倒计时 |
| P0 | 2 | AirAccount | YAAAClient 集成 + 登录页改造 |
| P0 | 2 | AirAccount | Passkey 确认弹窗 + UserOp 提交 |
| P0 | 3 | 合约 | GTokenSaleContract.sol 实现 + 测试 |
| P0 | 3 | 合约 | APNTsSaleContract.sol 实现 + 测试 |
| P0 | 3 | 后端 | Express + SQLite 事件缓存 |
| P0 | 3 | 前端 | /sale 销售页面（GToken + aPNTs）|
| P1 | 3 | 前端 | 销售数据看板 + initTiers 配置界面 |

---

*文档版本 v2.1 - 定价模型修正（收入驱动阶梯）+ Q1-Q10 设计锁定 + 三阶段开发计划*
*合约地址来源：aastar-sdk v0.16.23 packages/core/src/contract-addresses.ts*
