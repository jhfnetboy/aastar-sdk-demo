# AAStar SDK Demo - 独立演示项目

## 📦 安装说明

由于本项目依赖 `@aastar/sdk`，您需要先安装 SDK：

### 方式 1: 本地开发（推荐）

如果您在 monorepo 环境中：

```bash
# 1. 在 SDK 项目根目录安装依赖
cd ../aastar-sdk
pnpm install
pnpm build

# 2. 在 demo 项目中链接 SDK
cd ../aastar-sdk-demo
pnpm link ../aastar-sdk/packages/sdk

# 3. 安装其他依赖
pnpm install
```

### 方式 2: 从 npm 安装

```bash
# 安装已发布的 SDK
pnpm add @aastar/sdk

# 安装其他依赖
pnpm install
```

## 🚀 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env.sepolia
```

编辑 `.env.sepolia`：

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
PRIVATE_KEY_SUPPLIER=0x...
# 其他配置已预填
```

### 2. 启动演示

```bash
pnpm demo
```

浏览器访问：`http://localhost:3000`

## 📖 文档

- [README.md](./README.md) - 项目介绍
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - 详细设置指南
- [DEMO_README.md](./DEMO_README.md) - 演示功能说明
- [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) - 项目总结

## 🎯 功能特性

- ✅ 完整的 6 步工作流演示
- ✅ 实时交易日志
- ✅ Gas 对比分析
- ✅ 现代化 Web 界面

## 📁 项目结构

```
aastar-sdk-demo/
├── demo_server.ts          # Express 服务器
├── demo_public/
│   └── index.html          # Web 界面
├── demo_utils.ts           # SDK Utils 示例
├── 01_dao_launch_refactored.ts  # 重构脚本示例
└── docs/                   # 文档目录
```

## ⚠️ 注意事项

- 本项目仅用于 Sepolia 测试网演示
- 不要使用主网私钥
- 确保 Supplier 账户有足够余额（0.5 ETH + 200 GToken）

---

**Made with ❤️ by AAStar Team**
