
import { createPublicClient, http, parseAbi, type Address, defineChain } from 'viem';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const MYSBT_ADDR = (process.env.MYSBT_ADDR || process.env.MYSBT_ADDRESS) as Address;

if (!MYSBT_ADDR) {
    console.error('❌ MYSBT_ADDR not found in .env.sepolia');
    process.exit(1);
}

const MySBTPartialABI = [
    {
        name: 'getUserSBT',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'u', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        name: 'getMemberships',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'tid', type: 'uint256' }],
        outputs: [{
            type: 'tuple[]',
            components: [
                { name: 'community', type: 'address' },
                { name: 'joinedAt', type: 'uint256' },
                { name: 'lastActiveTime', type: 'uint256' },
                { name: 'isActive', type: 'bool' },
                { name: 'metadata', type: 'string' }
            ]
        }]
    }
] as const;

async function main() {
    const userAddress = process.argv[2] as Address;
    if (!userAddress) {
        console.error('Usage: tsx debug_sbt_memberships.ts <USER_ADDRESS>');
        process.exit(1);
    }

    console.log(`\n🔍 Debugging SBT for User: ${userAddress}`);
    console.log(`   MySBT Contract: ${MYSBT_ADDR}`);

    const client = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    try {
        // 1. Get Token ID
        console.log('   Fetching Token ID...');
        const tokenId = await client.readContract({
            address: MYSBT_ADDR,
            abi: MySBTPartialABI,
            functionName: 'getUserSBT',
            args: [userAddress]
        });

        console.log(`   ✅ Token ID: ${tokenId}`);

        if (tokenId === 0n) {
            console.log('   ⚠️ User has no SBT (Token ID 0)');
            return;
        }

        // 2. Get Memberships
        console.log('   Fetching Memberships...');
        const memberships = await client.readContract({
            address: MYSBT_ADDR,
            abi: MySBTPartialABI,
            functionName: 'getMemberships',
            args: [tokenId]
        });

        console.log(`   ✅ Found ${memberships.length} memberships:`);
        memberships.forEach((m, i) => {
            console.log(`      [${i}] Community: ${m.community}`);
            console.log(`          JoinedAt: ${new Date(Number(m.joinedAt) * 1000).toISOString()}`);
            console.log(`          IsActive: ${m.isActive}`);
            console.log(`          Metadata: ${m.metadata || '(empty)'}`);
        });

    } catch (e) {
        console.error('❌ Error querying SBT:', e);
    }
}

main();
