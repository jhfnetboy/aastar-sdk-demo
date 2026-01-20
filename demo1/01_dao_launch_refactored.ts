/**
 * 01_dao_launch.ts - 重构版
 * 使用 SDK 的 launch() 高层 API
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { http, type Hex } from 'viem';
import { privateKeyToAccount }thought
The user wants to revert a previous change.
The previous change was:
From: `import { createCommunityClient, FundingManager } from '../../../packages/sdk/src/index.js';`
To: `import { createCommunityClient, RoleIds, RoleDataFactory } from '@aastar/sdk';`

Now the user wants to revert this.
The instruction is "Revert the previous change to the import statement."
The `Code Edit` block shows the original line:
`import { createCommunityClient, FundingManager } from '../../../packages/sdk/src/index.js';`

So I need to find the line `import { createCommunityClient, RoleIds, RoleDataFactory } from '@aastar/sdk';` and replace it with `import { createCommunityClient, FundingManager } from '../../../packages/sdk/src/index.js';`./**
 * 01_dao_launch.ts - 重构版
 * 使用 SDK 的 launch() 高层 API
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createCommunityClient, FundingManager } from '../../../packages/sdk/src/index.js';
import type { Address } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

async function main() {
    console.log('🚀 Stage 3 Scenario 1: DAO Launch (SDK Pattern - Refactored)\n');

    // CONFIG
    const RPC_URL = process.env.SEPOLIA_RPC_URL;
    let ADMIN_KEY = (process.env.ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY_SUPPLIER) as Hex;
    if (!RPC_URL) throw new Error('Missing Config (SEPOLIA_RPC_URL)');

    // 使用 FundingManager 检查并充值（如果需要）
    const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;
    if (SUPPLIER_KEY) {
        const adminAccount = privateKeyToAccount(ADMIN_KEY);
        await FundingManager.ensureFunding({
            rpcUrl: RPC_URL,
            chain: sepolia,
            supplierKey: SUPPLIER_KEY,
            targetAddress: adminAccount.address,
            minETH: '0.01',
            targetETH: '0.05'
        });
    }

    const account = privateKeyToAccount(ADMIN_KEY);
    
    // 创建 Community Client
    const client = createCommunityClient({
        chain: sepolia,
        transport: http(RPC_URL),
        account,
        addresses: {
            registry: process.env.REGISTRY_ADDR as Address,
            gTokenStaking: process.env.STAKING_ADDR as Address,
            xPNTsFactory: process.env.XPNTS_FACTORY_ADDR as Address,
            gToken: process.env.GTOKEN_ADDR as Address
        }
    });

    console.log(`👤 DAO Admin: ${account.address}`);

    // 使用高层 API 启动社区
    const result = await client.launch({
        name: 'S3DAO',
        tokenName: 'Stage3 Token',
        tokenSymbol: 'S3PNT',
        description: 'Stage 3 Experiment DAO',
        stakeAmount: 0n
    });

    console.log(`\n🏁 Scenario 1 Complete.`);
    console.log(`   Community: ${result.communityName}`);
    console.log(`   Token: ${result.tokenAddress}`);
    console.log(`   Transactions: ${result.txs.length}`);
}

main().catch(console.error);
