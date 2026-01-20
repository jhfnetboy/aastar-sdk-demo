# AAStar SDK Interactive Demo

一个交互式演示页面，整合了所有 SDK 功能，让开发者可以完整体验从账户创建到 Gasless 交易的全流程。

## 功能特性

### 🎯 6 步完整工作流

1. **生成账户** - 使用 `KeyManager` 生成测试账户
2. **批量充值** - 使用 `FundingManager` 充值 ETH 和 GToken
3. **启动社区** - 使用 `CommunityClient.launch()` 一键创建 DAO
4. **设置运营商** - 使用 `OperatorClient.onboardOperator()` 注册运营商
5. **用户入驻** - 使用 `EndUserClient.joinAndActivate()` 加入社区
6. **基准测试** - 对比 EOA、Standard AA、Paymaster V4、SuperPaymaster V3 的 Gas 消耗

### 📊 实时数据展示

- **交易日志**: 实时显示所有链上交易
- **基准测试表**: 对比不同方案的 Gas 消耗和开销
- **状态追踪**: 每个步骤的完成状态和结果

## 快速开始

### 1. 安装依赖

```bash
cd scripts/experiment/stage3
pnpm install
```

### 2. 配置环境变量

确保 `.env.sepolia` 文件包含以下配置：

```env
SEPOLIA_RPC_URL=your_rpc_url
PRIVATE_KEY_SUPPLIER=your_supplier_key
REGISTRY_ADDR=0x...
STAKING_ADDR=0x...
SUPER_PAYMASTER=0x...
GTOKEN_ADDR=0x...
XPNTS_FACTORY_ADDR=0x...
```

### 3. 启动演示服务器

```bash
pnpm demo
```

### 4. 打开浏览器

访问 `http://localhost:3000`

## 架构设计

### 后端 (demo_server.ts)

统一的 Express 服务器，提供 7 个 HTTP API：

- `POST /api/generate-accounts` - 生成账户
- `POST /api/fund-accounts` - 批量充值
- `POST /api/launch-community` - 启动社区
- `POST /api/setup-operator` - 设置运营商
- `POST /api/onboard-user` - 用户入驻
- `POST /api/benchmark` - 执行基准测试
- `GET /api/state` - 获取当前状态

### 前端 (index.html)

- **现代化 UI**: 深色主题 + 玻璃态设计
- **响应式布局**: 左侧工作流 + 右侧结果面板
- **实时更新**: 自动刷新交易日志和基准测试结果

## 技术栈

- **后端**: Express + TypeScript
- **SDK**: AAStar SDK (KeyManager, FundingManager, Clients)
- **前端**: 原生 HTML/CSS/JavaScript
- **区块链**: Viem + Sepolia Testnet

## 代码对比

### 传统方式 (~200 行)

```typescript
// 手动处理每个步骤
const balance = await client.getBalance(...);
if (balance < threshold) {
    const tx = await wallet.sendTransaction(...);
    await client.waitForTransactionReceipt({ hash: tx });
}
const roleData = encodeAbiParameters(...);
const regTx = await client.writeContract(...);
// ... 更多重复代码
```

### 使用 SDK (~20 行)

```typescript
// 一键完成
await FundingManager.ensureFunding({ ... });
await communityClient.launch({ name: 'MyDAO' });
await operatorClient.onboardOperator({ ... });
```

**代码减少**: 90%

## 演示截图

![Demo Interface](../../../.gemini/antigravity/brain/737f16f2-2db7-409e-8387-7a1b51b9e819/sdk_demo_interface_1766932082783.png)

## 开发者指南

### 添加新步骤

1. 在 `demo_server.ts` 添加新的 API 端点
2. 在 `index.html` 添加新的步骤卡片
3. 更新 `runStep()` 函数处理新步骤

### 自定义样式

修改 `index.html` 中的 `<style>` 部分，所有颜色变量都已定义。

## 注意事项

⚠️ **安全提示**:
- 本演示仅用于开发和测试
- 不要在生产环境使用测试私钥
- 确保 `.env.sepolia` 文件不被提交到 Git

## 许可证

MIT
