/**
 * 00_preflight_check.ts - 环境和配置预检查
 * 在运行 demo 之前验证所有必要的配置和余额
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http, parseAbi, type Address, type Hex, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { keccak256, stringToBytes } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;
const REGISTRY_ADDR = process.env.REGISTRY_ADDR as Address;
const GTOKEN_ADDR = process.env.GTOKEN_ADDR as Address;

async function main() {
    console.log('🔍 预检查开始...\n');

    // 1. 检查环境变量
    console.log('📋 Step 1: 检查环境变量');
    const requiredEnvVars = {
        'SEPOLIA_RPC_URL': RPC_URL,
        'PRIVATE_KEY_SUPPLIER': SUPPLIER_KEY,
        'REGISTRY_ADDR': REGISTRY_ADDR,
        'GTOKEN_ADDR': GTOKEN_ADDR,
        'STAKING_ADDR': process.env.STAKING_ADDR,
        'SUPER_PAYMASTER': process.env.SUPER_PAYMASTER,
        'XPNTS_FACTORY_ADDR': process.env.XPNTS_FACTORY_ADDR
    };

    let envCheckPassed = true;
    for (const [key, value] of Object.entries(requiredEnvVars)) {
        if (!value || value === 'undefined') {
            console.log(`   ❌ ${key}: 未配置`);
            envCheckPassed = false;
        } else {
            console.log(`   ✅ ${key}: ${value.substring(0, 20)}...`);
        }
    }

    if (!envCheckPassed) {
        console.log('\n❌ 环境变量检查失败！请配置 .env.sepolia');
        process.exit(1);
    }

    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL)
    });

    const supplierAccount = privateKeyToAccount(SUPPLIER_KEY);
    console.log(`\n   Supplier 地址: ${supplierAccount.address}`);

    // 2. 检查 RPC 连接
    console.log('\n📋 Step 2: 检查 RPC 连接');
    try {
        const blockNumber = await publicClient.getBlockNumber();
        console.log(`   ✅ RPC 连接正常，当前区块: ${blockNumber}`);
    } catch (error) {
        console.log(`   ❌ RPC 连接失败:`, error);
        process.exit(1);
    }

    // 3. 检查 Supplier 余额
    console.log('\n📋 Step 3: 检查 Supplier 余额');
    const ethBalance = await publicClient.getBalance({ address: supplierAccount.address });
    const ethBalanceFormatted = Number(ethBalance) / 1e18;
    console.log(`   ETH 余额: ${ethBalanceFormatted.toFixed(4)} ETH`);

    const gtokenBalance = await publicClient.readContract({
        address: GTOKEN_ADDR,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [supplierAccount.address]
    }) as bigint;
    const gtokenBalanceFormatted = Number(gtokenBalance) / 1e18;
    console.log(`   GToken 余额: ${gtokenBalanceFormatted.toFixed(2)} GToken`);

    // 检查是否足够
    const requiredETH = 0.5; // 需要至少 0.5 ETH
    const requiredGToken = 200; // 需要至少 200 GToken

    if (ethBalanceFormatted < requiredETH) {
        console.log(`   ⚠️  警告: ETH 余额不足！需要至少 ${requiredETH} ETH`);
    } else {
        console.log(`   ✅ ETH 余额充足`);
    }

    if (gtokenBalanceFormatted < requiredGToken) {
        console.log(`   ⚠️  警告: GToken 余额不足！需要至少 ${requiredGToken} GToken`);
    } else {
        console.log(`   ✅ GToken 余额充足`);
    }

    // 4. 检查 Registry 合约
    console.log('\n📋 Step 4: 检查 Registry 合约');
    try {
        const registryAbi = parseAbi([
            'function owner() view returns (address)',
            'function getRoleConfig(bytes32 roleId) view returns (tuple(uint256 entryBurn, uint256 exitBurn, uint256 lockDuration, bool isActive))',
            'function hasRole(bytes32 roleId, address user) view returns (bool)'
        ]);

        const owner = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: registryAbi,
            functionName: 'owner'
        });
        console.log(`   Registry Owner: ${owner}`);

        // 检查 COMMUNITY 角色配置
        const COMMUNITY_ROLE_ID = keccak256(stringToBytes('COMMUNITY'));
        console.log(`   COMMUNITY Role ID: ${COMMUNITY_ROLE_ID}`);

        const roleConfig = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: registryAbi,
            functionName: 'getRoleConfig',
            args: [COMMUNITY_ROLE_ID]
        }) as any;

        console.log(`   COMMUNITY 角色配置:`);
        console.log(`     - Entry Burn: ${roleConfig.entryBurn}`);
        console.log(`     - Exit Burn: ${roleConfig.exitBurn}`);
        console.log(`     - Lock Duration: ${roleConfig.lockDuration}`);
        console.log(`     - Is Active: ${roleConfig.isActive}`);

        if (!roleConfig.isActive) {
            console.log(`   ❌ COMMUNITY 角色未激活！这可能是问题所在。`);
        } else {
            console.log(`   ✅ COMMUNITY 角色已激活`);
        }

        // 检查 Supplier 是否已有 COMMUNITY 角色
        const hasRole = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: registryAbi,
            functionName: 'hasRole',
            args: [COMMUNITY_ROLE_ID, supplierAccount.address]
        });
        console.log(`   Supplier 是否已有 COMMUNITY 角色: ${hasRole}`);

    } catch (error) {
        console.log(`   ❌ Registry 合约检查失败:`, error);
    }

    // 5. 检查 GToken 合约
    console.log('\n📋 Step 5: 检查 GToken 合约');
    try {
        const name = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: erc20Abi,
            functionName: 'name'
        });
        const symbol = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: erc20Abi,
            functionName: 'symbol'
        });
        console.log(`   ✅ GToken: ${name} (${symbol})`);
    } catch (error) {
        console.log(`   ❌ GToken 合约检查失败:`, error);
    }

    console.log('\n✅ 预检查完成！\n');
}

main().catch(console.error);
