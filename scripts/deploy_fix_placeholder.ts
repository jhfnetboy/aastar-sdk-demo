import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '../env/.env.v3');
dotenv.config({ path: envPath });
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-vnwJUePSAAD7N';

async function main() {
    if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not found");
    const account = privateKeyToAccount(PRIVATE_KEY);
    console.log(`Demo setup for account: ${account.address}`);
}

main().catch(console.error);
