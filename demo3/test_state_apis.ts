/**
 * 测试新实现的状态查询 API
 * 验证 getCommunityInfo, getOperatorStatus, getAccountBalances
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { http, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { 
    createCommunityClient,
    createOperatorClient,
    StateValidator
} from '../aastar-sdk/packages/sdk/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const GTOKEN_ADDR = process.env.GTOKEN_ADDR as Address;
const APNTS_ADDR = process.env.APNTS_ADDR as Address;

// 测试地址（从 saved_accounts.json 读取）
const TEST_ADDRESSES = {
    alice: '0xB6D31d6Af6B171BA5ACb6D45416a6aC39149F7BD' as Address,
    bob: '0x29443CC7D6a96F3D953182E4d3F5AFA35e61CC9c' as Address,
    charlie: '0xa74fFbe39149dcbd9f1b0fc00ecbD563c91404AB' as Address
};

async function testGetCommunityInfo() {
    console.log('\n🧪 测试 1: getCommunityInfo()');
    console.log('='.repeat(60));

    const client = createCommunityClient({
        chain: sepolia,
        transport: http(RPC_URL),
        addresses: {
            registry: process.env.REGISTRY_ADDR as Address,
            xPNTsFactory: process.env.XPNTS_FACTORY_ADDR as Address
        }
    });

    for (const [name, address] of Object.entries(TEST_ADDRESSES)) {
        console.log(`\n📍 检查 ${name} (${address}):`);
        const info = await client.getCommunityInfo(address);
        
        console.log(`   角色状态: ${info.hasRole ? '✅ 已注册' : '❌ 未注册'}`);
        if (info.tokenAddress) {
            console.log(`   Token 地址: ${info.tokenAddress}`);
        }
        if (info.communityData) {
            console.log(`   社区名称: ${info.communityData.name}`);
        }
    }
}

async function testGetOperatorStatus() {
    console.log('\n🧪 测试 2: getOperatorStatus()');
    console.log('='.repeat(60));

    const client = createOperatorClient({
        chain: sepolia,
        transport: http(RPC_URL),
        addresses: {
            registry: process.env.REGISTRY_ADDR as Address,
            gTokenStaking: process.env.STAKING_ADDR as Address,
            gToken: GTOKEN_ADDR,
            superPaymaster: process.env.SUPERPAYMASTER_ADDR as Address
        }
    });

    for (const [name, address] of Object.entries(TEST_ADDRESSES)) {
        console.log(`\n📍 检查 ${name} (${address}):`);
        const status = await client.getOperatorStatus(address);
        
        console.log(`   运营商类型: ${status.type || '未注册'}`);
        
        if (status.superPaymaster) {
            console.log(`   SuperPaymaster 状态:`);
            console.log(`      - 已配置: ${status.superPaymaster.isConfigured ? '✅' : '❌'}`);
            console.log(`      - 余额: ${status.superPaymaster.balance} wei`);
            console.log(`      - 汇率: ${status.superPaymaster.exchangeRate}`);
            if (status.superPaymaster.treasury) {
                console.log(`      - Treasury: ${status.superPaymaster.treasury}`);
            }
        }
    }
}

async function testGetAccountBalances() {
    console.log('\n🧪 测试 3: getAccountBalances()');
    console.log('='.repeat(60));

    const addresses = Object.values(TEST_ADDRESSES);
    
    const balances = await StateValidator.getAccountBalances({
        rpcUrl: RPC_URL,
        chain: sepolia,
        addresses,
        gTokenAddress: GTOKEN_ADDR,
        aPNTsAddress: APNTS_ADDR
    });

    console.log('\n📊 账户余额汇总:');
    console.log('-'.repeat(80));
    console.log('账户'.padEnd(45) + 'ETH'.padEnd(12) + 'GToken'.padEnd(12) + 'aPNTs');
    console.log('-'.repeat(80));

    balances.forEach((bal, idx) => {
        const name = Object.keys(TEST_ADDRESSES)[idx];
        const ethStr = (Number(bal.eth) / 1e18).toFixed(4);
        const gTokenStr = (Number(bal.gToken) / 1e18).toFixed(2);
        const aPNTsStr = (Number(bal.aPNTs) / 1e18).toFixed(2);
        
        console.log(
            `${name} (${bal.address.slice(0, 10)}...)`.padEnd(45) +
            ethStr.padEnd(12) +
            gTokenStr.padEnd(12) +
            aPNTsStr
        );
    });
    console.log('-'.repeat(80));
}

async function main() {
    console.log('🚀 开始测试状态查询 API');
    console.log('📡 RPC: ' + RPC_URL);
    console.log('🔗 链: Sepolia');
    
    try {
        await testGetCommunityInfo();
        await testGetOperatorStatus();
        await testGetAccountBalances();
        
        console.log('\n✅ 所有测试完成！');
    } catch (error) {
        console.error('\n❌ 测试失败:', error);
        process.exit(1);
    }
}

main();
