import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import path from 'path';

// Try loading from .env or ../env/.env.v3
const envPath = path.resolve(process.cwd(), '../env/.env.v3');
dotenv.config({ path: envPath });
dotenv.config();

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-vnwJUePSAAD7N';
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const FACTORY_ADDRESS = '0xF3B3E26970A85e7c5F8d9efD8bF5873118d43e9e'; // Original Factory
const IMPL_ADDRESS = '0xa169cd19c281dda3c0845e4e5e5fd17c65ec5ac4'; // V4.2 Impl

async function main() {
    if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not found in environment");
    console.log('🚀 Registering V4.2 on Original Factory...');
    
    const account = privateKeyToAccount(PRIVATE_KEY);
    const client = createWalletClient({
        account,
        chain: sepolia,
        transport: http(RPC_URL)
    });
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    console.log(`Using Owner: ${account.address}`);
    console.log(`Factory: ${FACTORY_ADDRESS}`);
    console.log(`Impl: ${IMPL_ADDRESS}`);

    const abi = parseAbi([
        'function addImplementation(string version, address implementation) external'
    ]);

    const { request } = await publicClient.simulateContract({
        account,
        address: FACTORY_ADDRESS,
        abi,
        functionName: 'addImplementation',
        args: ['v4.2', IMPL_ADDRESS]
    });

    const hash = await client.writeContract(request);
    console.log(`   Tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ Implementation Registered Successfully!');
}

main().catch(console.error);
