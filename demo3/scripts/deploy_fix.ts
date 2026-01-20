
import { createWalletClient, createPublicClient, http, parseAbi, hexToBytes, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '../env/.env.v3');
const demoEnvPath = path.resolve(process.cwd(), 'projects/aastar-sdk-demo/.env');
console.log('Loading Env from:', envPath);
dotenv.config({ path: envPath });
dotenv.config({ path: demoEnvPath }); // Demo override

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-vnwJUePSAAD7N';
// Using Supplier's Key (Alice from saved_accounts)
const PRIVATE_KEY = '[REDACTED_BOB]';

async function main() {
    console.log('🚀 Deploying Paymaster Fix (V4.2 Factory)...');

    const account = privateKeyToAccount(PRIVATE_KEY);
    const client = createWalletClient({
        account,
        chain: sepolia,
        transport: http(RPC_URL)
    });
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL)
    });

    console.log(`Address: ${account.address}`);

    // Load Bytecodes
    const p42Path = path.resolve(process.cwd(), '../SuperPaymaster/out/PaymasterV4_2.sol/PaymasterV4_2.json');
    const factoryPath = path.resolve(process.cwd(), '../SuperPaymaster/out/PaymasterFactory.sol/PaymasterFactory.json');

    const p42Json = JSON.parse(fs.readFileSync(p42Path, 'utf8'));
    const factoryJson = JSON.parse(fs.readFileSync(factoryPath, 'utf8'));

    const P42_BC = p42Json.bytecode.object;
    const FACTORY_BC = factoryJson.bytecode.object;

    // 1. Deploy Implementation (ALREADY DEPLOYED)
    console.log('Step 1: Deploying PaymasterV4_2 Implementation (SKIPPED - reusing existing)...');
    /*
    const hash1 = await client.deployContract({
        abi: p42Json.abi,
        bytecode: P42_BC,
        args: [
           process.env.ENTRY_POINT_V07 || '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // EntryPoint 0.7
           account.address, // owner (doesn't matter for impl)
           account.address, // treasure
           '0x694AA1769357215DE4FAC081bf1f309aDC325306', // ETH/USD Sepolia
           200n, // Rate
           10000000000000000n, // Cap
           process.env.XPNTs_FACTORY_ADDRESS || '0x52cC246cc4f4c49e2BAE98b59241b30947bA6013', // xPNTsFactory (from .env or hardcoded known)
           '0x0000000000000000000000000000000000000000', // SBT
           '0x0000000000000000000000000000000000000000', // GasToken
           process.env.REGISTRY_ADDRESS || '0xBD936920F40182f5C80F0Ee2Ffc0de6bc2Ae12c8' // Registry
        ]
    });
    console.log(`   Tx: ${hash1}`);
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    const implAddress = receipt1.contractAddress!;
    console.log(`   ✅ Impl Deployed at: ${implAddress}`);
    */
    const implAddress = '0xa169cd19c281dda3c0845e4e5e5fd17c65ec5ac4'; 

    // 2. Deploy Factory
    console.log('Step 2: Deploying New PaymasterFactory...');
    const hash2 = await client.deployContract({
        abi: factoryJson.abi,
        bytecode: FACTORY_BC,
        args: [] // Fix: Remove owner argument
    });
    console.log(`   Tx: ${hash2}`);
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    const factoryAddress = receipt2.contractAddress!;
    console.log(`   ✅ Factory Deployed at: ${factoryAddress}`);

    // 3. Add Implementation
    console.log('Step 3: Registering v4.2...');
    const { request } = await publicClient.simulateContract({
        account,
        address: factoryAddress,
        abi: factoryJson.abi,
        functionName: 'addImplementation',
        args: ['v4.2', implAddress]
    });
    const hash3 = await client.writeContract(request);
    console.log(`   Tx: ${hash3}`);
    await publicClient.waitForTransactionReceipt({ hash: hash3 });
    console.log('   ✅ Implementation Registered!');

    console.log('\n--- UPDATE .ENV CONFIG ---');
    console.log(`PAYMASTER_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch(console.error);
