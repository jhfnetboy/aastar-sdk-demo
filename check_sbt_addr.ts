
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const REGISTRY_ADDR = process.env.REGISTRY_ADDR as Address;
const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';

async function main() {
    console.log('Checking Registry for SBT Address...');
    console.log('Registry:', REGISTRY_ADDR);

    const client = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL)
    });

    try {
        // Try 'MYSBT'
        const abi = parseAbi(['function MYSBT() view returns (address)']);
        const sbt = await client.readContract({
            address: REGISTRY_ADDR,
            abi,
            functionName: 'MYSBT'
        });
        console.log('Result (MYSBT):', sbt);
    } catch (e) {
        console.log('Failed MYSBT:', e.message.slice(0, 100));
    }
}

main();
