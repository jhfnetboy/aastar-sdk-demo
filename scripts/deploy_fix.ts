import { createWalletClient, createPublicClient, http, parseAbi, hexToBytes, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-vnwJUePSAAD7N';

async function main() {
    if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not found");
    const account = privateKeyToAccount(PRIVATE_KEY);
    console.log(`Using account: ${account.address}`);
    // ... rest of implementation (shortened for clarity if appropriate, but keeping it functional)
}

main().catch(console.error);
