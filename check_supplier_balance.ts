/**
 * 检查 Supplier 账户余额
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http, erc20Abi, type Hex, type Address, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;
const GTOKEN_ADDR = process.env.GTOKEN_ADDR as Address;

async function checkSupplierBalance() {
    const supplierAccount = privateKeyToAccount(SUPPLIER_KEY);
    console.log('💼 Supplier 账户信息:\n');
    console.log(`   地址: ${supplierAccount.address}`);
    
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL)
    });
    
    // 检查 ETH 余额
    const ethBalance = await publicClient.getBalance({ address: supplierAccount.address });
    console.log(`   ETH 余额: ${formatEther(ethBalance)} ETH`);
    
    // 检查 GToken 余额
    const gtokenBalance = await publicClient.readContract({
        address: GTOKEN_ADDR,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [supplierAccount.address]
    }) as bigint;
    console.log(`   GToken 余额: ${formatEther(gtokenBalance)} GToken`);
    
    console.log('\n✅ 余额检查完成');
}

checkSupplierBalance().catch(console.error);
