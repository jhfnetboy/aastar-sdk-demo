# AAStar SDK Interactive Demo

一个完整的交互式演示项目，展示 AAStar SDK 的完整工作流程：从账户创建到 Gasless 交易。

## 🎯 功能特性

- **6 步完整工作流**: 生成账户 → 充值 → 启动社区 → 设置运营商 → 用户入驻 → 基准测试
- **实时交易日志**: 查看所有链上交易的详细信息
- **Gas 对比分析**: 对比 EOA、Standard AA、Paymaster V4、SuperPaymaster V3 的 Gas 消耗
- **现代化 UI**: 深色主题 + 玻璃态设计

## 📦 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.sepolia`：

```bash
cp .env.example .env.sepolia
```

然后编辑 `.env.sepolia`，填入您的配置：

```env
# RPC URL (获取免费 Infura Key: https://infura.io)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# Supplier 账户私钥 (需要有 0.5 ETH + 200 GToken)
PRIVATE_KEY_SUPPLIER=0x...

# 合约地址（已预填 AAStar 官方地址，可直接使用）
REGISTRY_ADDR=0xf265d21c2cE6B2fA5d6eD1A2d7b032F03516BE19
...
```

> 💡 **获取测试 ETH**: 
> - [Sepolia Faucet](https://sepoliafaucet.com/)
> - [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)

### 3. 启动演示

```bash
pnpm demo
```

然后在浏览器中打开：`http://localhost:3000`

## 🎮 使用指南

### 工作流步骤

1. **Generate Accounts** - 生成 3 个测试账户（Alice, Bob, Charlie）
   - 显示地址和私钥
   - 可用于后续创建 AA Account

2. **Fund Accounts** - 批量充值
   - 使用 Supplier 账户充值
   - 每个账户获得 0.05 ETH + 50 GToken
   - 显示最终余额

3. **Launch Community** - 启动社区
   - Alice 创建 DemoDAO
   - 部署社区 Token
   - 获得社区地址

4. **Setup Operator** - 设置运营商
   - Bob 注册为 SuperPaymaster 运营商
   - 质押 50 GToken

5. **Onboard User** - 用户入驻
   - Charlie 加入社区
   - 获得 SBT ID

6. **Benchmark Transactions** - 基准测试
   - 对比不同方案的 Gas 消耗
   - 查看详细数据表格

## 📁 项目结构

```
aastar-sdk-demo/
├── demo_server.ts          # Express 服务器 (7 个 API 端点)
├── demo_public/
│   └── index.html          # 交互式 Web 界面
├── demo_utils.ts           # SDK Utils 使用示例
├── 01_dao_launch_refactored.ts  # 重构脚本示例
├── package.json            # 项目配置
├── .env.example            # 环境变量模板
├── .env.sepolia            # 您的配置 (不提交到 Git)
├── SETUP_GUIDE.md          # 详细设置指南
└── README.md               # 本文件
```

## 🔧 API 端点

演示服务器提供以下 HTTP API：

- `POST /api/generate-accounts` - 生成测试账户
- `POST /api/fund-accounts` - 批量充值
- `POST /api/launch-community` - 启动社区
- `POST /api/setup-operator` - 设置运营商
- `POST /api/onboard-user` - 用户入驻
- `POST /api/benchmark` - 执行基准测试
- `GET /api/state` - 获取当前状态

## 📊 SDK 使用示例

### 使用 KeyManager 生成账户

```typescript
import { KeyManager } from '@aastar/sdk';

const keys = KeyManager.generateKeyPairs(['Alice', 'Bob', 'Charlie']);
KeyManager.saveToEnvFile('.demo_keys.env', keys);
```

### 使用 FundingManager 充值

```typescript
import { FundingManager } from '@aastar/sdk';

await FundingManager.ensureFunding({
    rpcUrl: RPC_URL,
    chain: sepolia,
    supplierKey: SUPPLIER_KEY,
    targetAddress: alice.address,
    minETH: '0.01',
    targetETH: '0.05'
});
```

### 使用 CommunityClient 启动社区

```typescript
import { createCommunityClient } from '@aastar/sdk';

const client = createCommunityClient({ chain, transport, account, addresses });
await client.launch({
    name: 'MyDAO',
    tokenName: 'My Token',
    tokenSymbol: 'MYT'
});
```

## 🎓 学习资源

- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - 详细的环境设置指南
- [DEMO_README.md](./DEMO_README.md) - 演示功能说明
- [AAStar SDK 文档](https://github.com/AAStarCommunity/aastar-sdk)

## ⚠️ 注意事项

- **仅用于测试**: 本项目仅用于 Sepolia 测试网演示
- **私钥安全**: 不要使用主网私钥，不要提交 `.env.sepolia` 到 Git
- **Supplier 余额**: 确保 Supplier 账户有足够的 ETH 和 GToken

## 🐛 故障排除

### Q: "Cannot find package '@aastar/sdk'"

**A**: 确保在 monorepo 根目录运行了 `pnpm install`

### Q: "Insufficient funds for gas"

**A**: 检查 Supplier 账户余额：
```bash
cast balance $SUPPLIER_ADDRESS --rpc-url $SEPOLIA_RPC_URL
```

### Q: Funding 一直 loading

**A**: 
1. 查看服务器 Console 日志
2. 确认 RPC URL 正常工作
3. 确认 Supplier 账户有足够余额

## 📝 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ by AAStar Team**
