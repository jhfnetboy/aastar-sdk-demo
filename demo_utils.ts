/**
 * SDK Utils 使用示例
 * 演示如何使用 KeyManager、FundingManager 和 StateValidator
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sepolia } from 'viem/chains';
import { KeyManager, FundingManager, StateValidator, RoleIds } from '../aastar-sdk/packages/sdk/src/index.js';
import type { Hex, Address } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

async function main() {
    console.log('🚀 SDK Utils Demo\n');

    // ========== 1. KeyManager 示例 ==========
    console.log('📦 Part 1: KeyManager - 密钥生成与管理');
    console.log('─'.repeat(80));

    // 生成单个密钥对
    const jasonKey = KeyManager.generateKeyPair('Jason');
    console.log(`Generated key for ${jasonKey.name}: ${jasonKey.address}`);

    // 批量生成密钥对
    const operatorKeys = KeyManager.generateMultiple(3, 'Operator');
    KeyManager.printKeys(operatorKeys, false);

    // 保存到文件
    const keysPath = path.join(__dirname, '.demo_keys.env');
    KeyManager.saveToEnvFile(keysPath, [jasonKey, ...operatorKeys], true);

    // 加载密钥
    const loadedKeys = KeyManager.loadFromEnvFile(keysPath);
    console.log(`\n✅ Loaded ${loadedKeys.length} keys from file\n`);

    // ========== 2. FundingManager 示例 ==========
    console.log('📦 Part 2: FundingManager - 资金管理');
    console.log('─'.repeat(80));

    const RPC_URL = process.env.SEPOLIA_RPC_URL!;
    const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;
    const GTOKEN_ADDR = process.env.GTOKEN_ADDR as Address;

    if (!RPC_URL || !SUPPLIER_KEY) {
        console.log('⚠️  Missing RPC_URL or SUPPLIER_KEY, skipping funding demo');
    } else {
        // 检查余额
        const balance = await FundingManager.getETHBalance({
            rpcUrl: RPC_URL,
            chain: sepolia,
            supplierKey: SUPPLIER_KEY,
            targetAddress: jasonKey.address
        });
        console.log(`Jason's ETH Balance: ${Number(balance) / 1e18} ETH`);

        // 智能充值（检查并充值）
        const fundingResults = await FundingManager.ensureFunding({
            rpcUrl: RPC_URL,
            chain: sepolia,
            supplierKey: SUPPLIER_KEY,
            targetAddress: jasonKey.address,
            minETH: '0.01',
            targetETH: '0.05',
            token: {
                address: GTOKEN_ADDR,
                minBalance: '10',
                targetAmount: '50'
            }
        });

        console.log(`\n✅ Funding completed: ${fundingResults.filter(r => r.success).length}/${fundingResults.length} successful\n`);
    }

    // ========== 3. StateValidator 示例 ==========
    console.log('📦 Part 3: StateValidator - 状态验证');
    console.log('─'.repeat(80));

    const REGISTRY_ADDR = process.env.REGISTRY_ADDR as Address;

    if (!RPC_URL || !REGISTRY_ADDR) {
        console.log('⚠️  Missing RPC_URL or REGISTRY_ADDR, skipping validation demo');
    } else {
        // 验证角色
        const roleResult = await StateValidator.validateRole({
            rpcUrl: RPC_URL,
            chain: sepolia,
            registryAddress: REGISTRY_ADDR,
            roleId: RoleIds.PAYMASTER_SUPER,
            userAddress: jasonKey.address
        });
        console.log(roleResult.message);

        // 验证 ETH 余额
        const ethResult = await StateValidator.validateETHBalance({
            rpcUrl: RPC_URL,
            chain: sepolia,
            address: jasonKey.address,
            minBalance: '0.01'
        });
        console.log(ethResult.message);

        // 批量验证
        const batchResults = await StateValidator.batchValidateRoles(
            { rpcUrl: RPC_URL, chain: sepolia },
            REGISTRY_ADDR,
            operatorKeys.map(k => ({
                roleId: RoleIds.PAYMASTER_SUPER,
                userAddress: k.address,
                label: k.name
            }))
        );

        StateValidator.printResults(batchResults);
    }

    console.log('\n🏁 Demo Complete!');
}

main().catch(console.error);
