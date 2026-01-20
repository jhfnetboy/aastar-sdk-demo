/**
 * 初始化 Supplier 账户 - Mint GToken
 * Supplier 是 GToken 部署者，拥有 mint 权限
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, createWalletClient, http, erc20Abi, type Hex, type Address, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;
const GTOKEN_ADDR = process.env.GTOKEN_ADDR as Address;

// GToken ABI - 包含 mint 函数
const GTOKEN_ABI = [
    ...erc20Abi,
    {
        type: 'function',
        name: 'mint',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: []
    }
] as const;

async function initializeSupplier() {
    console.log('🚀 初始化 Supplier 账户 - Mint GToken\n');
    
    const supplierAccount = privateKeyToAccount(SUPPLIER_KEY);
    console.log(`   💼 Supplier: ${supplierAccount.address}`);
    console.log(`   🪙 GToken 合约: ${GTOKEN_ADDR}\n`);
    
    const publicClient = createPublicClient({
        chain: sepolia,
        transport: http(RPC_URL)
    });
    
    const walletClient = createWalletClient({
        account: supplierAccount,
        chain: sepolia,
        transport: http(RPC_URL)
    });
    
    // 检查当前 GToken 余额
    const currentBalance = await publicClient.readContract({
        address: GTOKEN_ADDR,
        abi: GTOKEN_ABI,
        functionName: 'balanceOf',
        args: [supplierAccount.address]
    }) as bigint;
    
    console.log(`   📊 当前 GToken 余额: ${formatEther(currentBalance)} GToken`);
    
    // Mint 1,000,000 GToken
    const mintAmount = parseEther('1000000'); // 1M GToken
    console.log(`\n   🏭 Minting ${formatEther(mintAmount)} GToken...`);
    
    try {
        const hash = await walletClient.writeContract({
            address: GTOKEN_ADDR,
            abi: GTOKEN_ABI,
            functionName: 'mint',
            args: [supplierAccount.address, mintAmount]
        });
        
        console.log(`   📤 Transaction sent: ${hash}`);
        console.log(`   ⏳ Waiting for confirmation...`);
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(`   ✅ Transaction confirmed! Block: ${receipt.blockNumber}`);
        
        // 检查新余额
        const newBalance = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: GTOKEN_ABI,
            functionName: 'balanceOf',
            args: [supplierAccount.address]
        }) as bigint;
        
        console.log(`\n   📊 新 GToken 余额: ${formatEther(newBalance)} GToken`);
        console.log(`   ➕ Minted: ${formatEther(newBalance - currentBalance)} GToken`);
        console.log('\n✅ Supplier 初始化完成！');
        
    } catch (error: any) {
        console.error('\n❌ Mint 失败:', error.message);
        
        if (error.message?.includes('Ownable')) {
            console.error('\n⚠️  提示: Supplier 账户不是 GToken 的 owner，无法 mint');
            console.error('   请确认 PRIVATE_KEY_SUPPLIER 是 GToken 部署者的私钥');
        }
        
        throw error;
    }
}

initializeSupplier().catch(console.error);
