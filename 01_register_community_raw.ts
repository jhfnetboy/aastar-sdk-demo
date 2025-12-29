/**
 * 01_register_community_raw.ts - 无 SDK 的原始合约调用测试
 * 直接使用 viem 调用 Registry.registerRole 来注册社区
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, createWalletClient, http, type Address, type Hex, encodeAbiParameters, keccak256, stringToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { RegistryABI } from '@aastar/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;
const REGISTRY_ADDR = process.env.REGISTRY_ADDR as Address;

async function main() {
    console.log('🧪 原始合约调用测试 - 注册社区\n');

    const account = privateKeyToAccount(SUPPLIER_KEY);
    console.log(`使用账户: ${account.address}\n`);

    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL)
    });

    const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: http(RPC_URL)
    });

    // 1. 生成 roleData
    console.log('📦 Step 1: 生成 roleData');
    const communityName = `TestCommunity_${Date.now()}`;
    console.log(`   社区名称: ${communityName}`);

    const roleData = encodeAbiParameters(
        [{
            type: 'tuple',
            components: [
                { name: 'name', type: 'string' },
                { name: 'ensName', type: 'string' },
                { name: 'website', type: 'string' },
                { name: 'description', type: 'string' },
                { name: 'logoURI', type: 'string' },
                { name: 'stakeAmount', type: 'uint256' }
            ]
        }],
        [[
            communityName,
            '',
            '',
            '',
            '',
            0n
        ] as any]
    );

    console.log(`   RoleData 长度: ${roleData.length}`);
    console.log(`   RoleData (前100字符): ${roleData.substring(0, 100)}...\n`);

    // 2. 准备参数
    console.log('📋 Step 2: 准备调用参数');
    const COMMUNITY_ROLE_ID = keccak256(stringToBytes('COMMUNITY'));
    console.log(`   Role ID: ${COMMUNITY_ROLE_ID}`);
    console.log(`   User: ${account.address}`);
    console.log(`   Data: ${roleData.substring(0, 50)}...\n`);

    // 3. 检查角色配置
    console.log('🔍 Step 3: 检查 COMMUNITY 角色配置');

    try {
        const roleConfig = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'getRoleConfig',
            args: [COMMUNITY_ROLE_ID]
        }) as any;

        console.log(`   Entry Burn: ${roleConfig.entryBurn}`);
        console.log(`   Exit Burn: ${roleConfig.exitBurn}`);
        console.log(`   Lock Duration: ${roleConfig.lockDuration}`);
        console.log(`   Is Active: ${roleConfig.isActive}`);

        if (!roleConfig.isActive) {
            console.log(`\n   ❌ 错误: COMMUNITY 角色未激活！`);
            console.log(`   这就是问题所在。需要先配置并激活 COMMUNITY 角色。\n`);
            process.exit(1);
        }

        // 检查是否已有角色
        const hasRole = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'hasRole',
            args: [COMMUNITY_ROLE_ID, account.address]
        });

        if (hasRole) {
            console.log(`\n   ⚠️  警告: 账户已经拥有 COMMUNITY 角色！`);
            console.log(`   这可能会导致 RoleAlreadyGranted 错误。\n`);
        }

    } catch (error) {
        console.log(`   ❌ 检查角色配置失败:`, error);
    }

    // 4. 调用 registerRole
    console.log('\n📤 Step 4: 调用 registerRole');
    try {
        console.log('   正在发送交易...');
        
        const hash = await walletClient.writeContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'registerRole',
            args: [COMMUNITY_ROLE_ID, account.address, roleData]
        });

        console.log(`   ✅ 交易已发送: ${hash}`);
        console.log(`   等待确认...`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`   ✅ 交易已确认！`);
        console.log(`   Gas Used: ${receipt.gasUsed}`);
        console.log(`   Status: ${receipt.status}`);

        if (receipt.status === 'success') {
            console.log(`\n✅ 成功注册社区！`);
        } else {
            console.log(`\n❌ 交易失败！`);
        }

    } catch (error: any) {
        console.log(`\n❌ registerRole 调用失败:`);
        console.log(`   错误类型: ${error.name}`);
        console.log(`   错误信息: ${error.message}`);
        
        if (error.cause) {
            console.log(`\n   详细错误:`);
            console.log(error.cause);
        }

        // 尝试解析具体的合约错误
        if (error.message.includes('RoleNotConfigured')) {
            console.log(`\n   💡 提示: COMMUNITY 角色未配置。需要先调用 configureRole。`);
        } else if (error.message.includes('RoleAlreadyGranted')) {
            console.log(`\n   💡 提示: 该账户已经拥有 COMMUNITY 角色。`);
        } else if (error.message.includes('InsufficientStake')) {
            console.log(`\n   💡 提示: 质押不足。需要先质押 GToken。`);
        }
    }
}

main().catch(console.error);
