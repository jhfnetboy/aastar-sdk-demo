
import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const REGISTRY_ADDR = process.env.REGISTRY_ADDR as `0x${string}`;
const RPC = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';

const abi = parseAbi([
    'function roleDataFactory() view returns (address)',
    'function getRoleDataFactory() view returns (address)',
    'function ROLE_DATA_FACTORY() view returns (address)'
]);

async function main() {
    const client = createPublicClient({ 
        chain: sepolia, 
        transport: http(RPC) 
    });

    console.log('Registry:', REGISTRY_ADDR);
    
    // Try different function names
    const funcs = ['roleDataFactory', 'getRoleDataFactory', 'ROLE_DATA_FACTORY'];
    
    for (const f of funcs) {
        try {
            const res = await client.readContract({
                address: REGISTRY_ADDR,
                abi,
                functionName: f as any
            });
            console.log(`FOUND ${f}:`, res);
            process.exit(0);
        } catch (e) {
            console.log(`Failed ${f}:`, (e as Error).message.split('\n')[0]);
        }
    }
}

main();
