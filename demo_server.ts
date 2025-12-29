/**
 * demo_server.ts - 统一的演示后端
 * 整合所有 00-05 脚本功能，提供 HTTP API
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { http, parseEther, createPublicClient, createWalletClient, erc20Abi, type Hex, type Address, type Hash } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { RegistryABI } from '@aastar/core';
import { 
    KeyManager, 
    FundingManager, 
    StateValidator,
    createCommunityClient,
    createOperatorClient,
    createEndUserClient,
    RoleIds,
    RoleDataFactory,
    SimpleAccountFactoryABI
} from '../aastar-sdk/packages/sdk/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'demo_public')));

// BigInt JSON 序列化支持
(BigInt.prototype as any).toJSON = function() { return this.toString() };

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;

// 统一配置中心 - 严格对应 .env.sepolia
const CONFIG = {
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    privateKeySupplier: process.env.PRIVATE_KEY_SUPPLIER,
    addresses: {
        registry: process.env.REGISTRY_ADDR as Address,
        gTokenStaking: process.env.STAKING_ADDR as Address,
        superPaymaster: process.env.SUPER_PAYMASTER as Address,
        gToken: process.env.GTOKEN_ADDR as Address,
        xPNTsFactory: process.env.XPNTS_FACTORY_ADDR as Address,
        paymasterFactory: process.env.PAYMASTER_FACTORY_ADDR as Address,
        mySBT: process.env.MYSBT_ADDR as Address,
        simpleAccountFactory: process.env.SIMPLE_ACCOUNT_FACTORY as Address
    }
};

if (!CONFIG.rpcUrl || !CONFIG.privateKeySupplier) {
    console.error('Missing critical environment variables!');
    process.exit(1);
}

// 存储演示状态
const demoState = {
    accounts: [] as Array<{ 
        name: string; 
        address: Address; 
        privateKey: Hex; 
        type?: 'EOA' | 'AA';
        ownerAddress?: Address;
    }>,
    communityAddress: null as Address | null,
    tokenAddress: null as Address | null,
    transactions: [] as Array<{ type: string; hash: Hex; timestamp: number }>
};

const ACCOUNTS_FILE = path.join(__dirname, 'saved_accounts.json');

// 加载保存的账户
if (fs.existsSync(ACCOUNTS_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        if (saved && saved.length > 0) {
            console.log(`📦 Loaded ${saved.length} saved accounts from disk`);
            demoState.accounts = saved;
        }
    } catch (e) {
        console.error('⚠️ Failed to load saved accounts:', e);
    }
}

// 1. 生成测试账户 (或使用保存的)
app.post('/api/generate-accounts', async (req, res) => {
    try {
        console.log('\n👥 Generating/Loading accounts...');
        
        // 如果已经有账户且不强制重新生成，则直接返回
        if (demoState.accounts.length > 0 && !req.body.force) {
            console.log('   Using existing accounts');
            // Log full keys for debugging
            demoState.accounts.forEach(a => {
                console.log(`   Loaded ${a.name}: ${a.address}`);
                // console.log(`   Private Key: ${a.privateKey}`); // Creating security risk if logged in production
            });
            
            return res.json({ 
                success: true, 
                message: 'Using existing accounts', 
                accounts: demoState.accounts.map(a => ({ 
                    name: a.name, 
                    address: a.address,
                    privateKey: a.privateKey // Return full key to client
                }))
            });
        }

        const count = 3;
        const names = ['Alice', 'Bob', 'Charlie'];
        const accounts = [];

        for (let i = 0; i < count; i++) {
            const privateKey = generatePrivateKey();
            const account = privateKeyToAccount(privateKey);
            accounts.push({
                name: names[i],
                address: account.address,
                privateKey: privateKey
            });
            console.log(`   Generated ${names[i]}: ${account.address}`);
            console.log(`   Private Key: ${privateKey}`); // Log full key as requested by user
        }

        demoState.accounts = accounts;
        
        // 保存到文件
        try {
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
            console.log('   💾 Accounts saved to disk');
        } catch (e) {
            console.error('   ⚠️ Failed to save accounts:', e);
        }

        res.json({ 
            success: true, 
            accounts: demoState.accounts.map(a => ({ 
                name: a.name, 
                address: a.address,
                privateKey: a.privateKey,
                type: a.type || 'EOA'
            })) 
        });
    } catch (e) {
        // ...
    }
});

// =====================
// 工具函数
// =====================
function saveAccounts(accounts: typeof demoState.accounts) {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    } catch (e) {
        console.error('⚠️ Failed to save accounts to disk:', e);
    }
}

app.post('/api/add-account', async (req, res) => {
    try {
        const { type } = req.body;
        console.log(`➕ Adding new ${type || 'EOA'} account...`);
        
        const newPrivateKey = generatePrivateKey();
        const ownerAccount = privateKeyToAccount(newPrivateKey);
        
        let address = ownerAccount.address;
        let ownerAddress = ownerAccount.address;
        const finalType = type === 'AA' ? 'AA' : 'EOA';

        if (finalType === 'AA') {
            const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
            const FACTORY_ADDR = (process.env.SIMPLE_ACCOUNT_FACTORY || '0x8B516A71c134a4b5196775e63b944f88Cc637F2b') as Address;
            
            // 计算 AA 地址 (salt 为 0n)
            address = await publicClient.readContract({
                address: FACTORY_ADDR,
                abi: SimpleAccountFactoryABI,
                functionName: 'getAddress',
                args: [ownerAccount.address, 0n]
            }) as Address;
            
            console.log(`   🔸 Computed AA Address: ${address}`);
        }
        
        const newAccountData = {
            name: `User ${demoState.accounts.length + 1}`,
            privateKey: newPrivateKey,
            address: address,
            ownerAddress: ownerAddress,
            type: finalType
        };
        
        demoState.accounts.push(newAccountData as any);
        saveAccounts(demoState.accounts);
        
        console.log(`   ✅ Created ${newAccountData.name} (${finalType}): ${address}`);
        
        res.json({ success: true, account: newAccountData });
    } catch (error) {
        console.error('❌ Error adding account:', error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 查询账户余额
app.post('/api/get-balances', async (req, res) => {
    try {
        const addresses = demoState.accounts.map(acc => acc.address as Address);
        
        if (addresses.length === 0) {
            return res.json({ success: true, balances: [] });
        }

        const GTOKEN_ADDR = process.env.GTOKEN_ADDR as Address;
        const APNTS_ADDR = process.env.APNTS_ADDR as Address;
        
        const balances = await StateValidator.getAccountBalances({
            rpcUrl: RPC_URL,
            chain: sepolia,
            addresses,
            gTokenAddress: GTOKEN_ADDR,
            aPNTsAddress: APNTS_ADDR
        });
        
        // Convert BigInt to string for JSON serialization
        const serializedBalances = balances.map(b => ({
            address: b.address,
            eth: b.eth.toString(),
            gToken: b.gToken.toString(),
            aPNTs: b.aPNTs.toString(),
            xPNTs: b.xPNTs.toString()
        }));
        
        res.json({ success: true, balances: serializedBalances });
    } catch (error: any) {
        console.error('Error fetching balances:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 批量查询社区状态
app.post('/api/get-communities', async (req, res) => {
    try {
        const REGISTRY_ADDR = (process.env.REGISTRY_ADDR || process.env.REGISTRY_ADDRESS) as Address;
        const XPNTS_FACTORY_ADDR = (process.env.XPNTS_FACTORY_ADDR || process.env.XPNTS_FACTORY_ADDRESS) as Address;

        const communityClient = createCommunityClient({
            chain: sepolia,
            transport: http(RPC_URL),
            addresses: CONFIG.addresses
        });

        // 从 Registry 获取所有拥有 COMMUNITY 角色的地址
        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const members = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'getRoleMembers',
            args: [RoleIds.COMMUNITY]
        }) as Address[];

        console.log(`\n🔍 Found ${members.length} communities on chain:`, members);

        const communities = await Promise.all(
            members.map(async (address) => {
                const info = await communityClient.getCommunityInfo(address);
                const localAccount = demoState.accounts.find(a => a.address.toLowerCase() === address.toLowerCase());
                return {
                    // Admin Name: prefer local account name (e.g. "Alice"), fallback to Community Name, then Unknown
                    accountName: localAccount ? localAccount.name : (info.communityData?.name || 'Unknown Community'),
                    accountAddress: address,
                    hasRole: info.hasRole,
                    tokenAddress: info.tokenAddress,
                    communityData: info.communityData
                };
            })
        );

        res.json({ success: true, communities });
    } catch (error: any) {
        console.error('Error fetching communities:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 批量查询运营商状态
app.post('/api/get-operators', async (req, res) => {
    try {
        const operatorClient = createOperatorClient({
            chain: sepolia,
            transport: http(RPC_URL),
            addresses: CONFIG.addresses
        });

        // 结合多种角色枚举
        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const superMembers = await publicClient.readContract({
            address: CONFIG.addresses.registry,
            abi: RegistryABI,
            functionName: 'getRoleMembers',
            args: [RoleIds.PAYMASTER_SUPER]
        }) as Address[];

        const aoaMembers = await publicClient.readContract({
            address: CONFIG.addresses.registry,
            abi: RegistryABI,
            functionName: 'getRoleMembers',
            args: [RoleIds.PAYMASTER_AOA]
        }) as Address[];

        const allMembers = Array.from(new Set([...superMembers, ...aoaMembers]));

        const operators = await Promise.all(
            allMembers.map(async (address) => {
                const status = await operatorClient.getOperatorStatus(address);
                const localAccount = demoState.accounts.find(a => a.address.toLowerCase() === address.toLowerCase());
                return {
                    accountName: localAccount ? localAccount.name : 'External Operator',
                    accountAddress: address,
                    type: status.type,
                    superPaymaster: status.superPaymaster,
                    paymasterV4: status.paymasterV4
                };
            })
        );

        res.json({ success: true, operators });
    } catch (error: any) {
        console.error('Error fetching operators:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. 批量充值 (Supplier 的唯一用途：提供资金)

// 2. 批量充值 (Supplier 的唯一用途：提供资金)
app.post('/api/fund-accounts', async (req, res) => {
    try {
        console.log('\n💰 Funding accounts (Supplier 提供资金)...');
        const { ethAmount, tokenAmount } = req.body;
        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

        const supplierAddress = privateKeyToAccount(SUPPLIER_KEY).address;
        console.log(`   💼 Supplier (资金提供者): ${supplierAddress}`);
        console.log(`   Target ETH: ${ethAmount || '0.05'} per account`);
        console.log(`   Target GToken: ${tokenAmount || '100'} per account`);

        // 充值 ETH
        console.log('\n   📤 Funding ETH...');
        const ethErrors = [];
        for (let i = 0; i < demoState.accounts.length; i++) {
            const account = demoState.accounts[i];
            
            // Check current ETH balance
            const currentEth = await publicClient.getBalance({ address: account.address });
            const targetEthWei = parseEther(ethAmount || '0.05');
            
            if (currentEth >= targetEthWei) {
                console.log(`      [${i + 1}/${demoState.accounts.length}] Skipping ${account.name}: has ${currentEth} ETH (Target: ${targetEthWei})`);
                continue;
            }

            console.log(`      [${i + 1}/${demoState.accounts.length}] Funding ${account.name} (${account.address})...`);
            
            const result = await FundingManager.fundWithETH({
                rpcUrl: RPC_URL,
                chain: sepolia,
                supplierKey: SUPPLIER_KEY,
                targetAddress: account.address,
                amount: ethAmount || '0.05'
            });
            
            if (!result.success) {
                const error = `Failed to fund ${account.name} with ETH: ${result.error}`;
                console.error(`      ❌ ${error}`);
                ethErrors.push(error);
            }
        }

        const GTOKEN_ADDR = (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address;
        const targetTokenWei = parseEther(tokenAmount || '100');

        console.log('\n   🪙 Funding GToken...');
        const tokenErrors = [];
        for (let i = 0; i < demoState.accounts.length; i++) {
            const account = demoState.accounts[i];

            const currentGToken = await publicClient.readContract({
                address: GTOKEN_ADDR,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [account.address]
            }) as bigint;

            if (currentGToken >= targetTokenWei) {
                console.log(`      [${i + 1}/${demoState.accounts.length}] Skipping ${account.name}: has ${currentGToken} GToken (Target: ${targetTokenWei})`);
                continue;
            }

            console.log(`      [${i + 1}/${demoState.accounts.length}] Funding ${account.name} with GToken...`);
            
            const result = await FundingManager.fundWithToken({
                rpcUrl: RPC_URL,
                chain: sepolia,
                supplierKey: SUPPLIER_KEY,
                targetAddress: account.address,
                tokenAddress: GTOKEN_ADDR,
                amount: tokenAmount || '100'
            });
            
            if (!result.success) {
                const error = `Failed to fund ${account.name} with GToken: ${result.error}`;
                console.error(`      ❌ ${error}`);
                tokenErrors.push(error);
            }
        }
        
        // 如果有任何错误，抛出异常
        if (ethErrors.length > 0 || tokenErrors.length > 0) {
            const allErrors = [...ethErrors, ...tokenErrors];
            throw new Error(`Funding failed:\n${allErrors.join('\n')}`);
        }

        // 获取最终余额
        console.log('\n   📊 Final Balances:');
        const balances = [];
        for (const account of demoState.accounts) {
            const ethBal = await publicClient.getBalance({ address: account.address });
            const tokenBal = await publicClient.readContract({
                address: process.env.GTOKEN_ADDR as Address,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [account.address]
            }) as bigint;

            const ethStr = (Number(ethBal) / 1e18).toFixed(4);
            const tokenStr = (Number(tokenBal) / 1e18).toFixed(2);
            
            console.log(`      ${account.name}: ${ethStr} ETH, ${tokenStr} GToken`);
            balances.push({ name: account.name, eth: ethStr, gtoken: tokenStr });
        }

        console.log('✅ All accounts funded successfully!');

        res.json({ success: true, message: 'Accounts funded successfully', balances });
    } catch (error) {
        console.error('❌ Error funding accounts:', error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 3. 启动社区 (使用生成的账户，不是 Supplier！)
app.post('/api/launch-community', async (req, res) => {
    try {
        console.log('\n🏛️ Launching community...');
        const { accountIndex, communityName } = req.body;
        const selectedAccount = demoState.accounts[accountIndex || 0];
        const account = privateKeyToAccount(selectedAccount.privateKey);

        console.log(`   👤 Community Admin: ${selectedAccount.name} (${account.address})`);
        console.log(`   📝 Community Name: ${communityName || 'DemoDAO'}`);

        const REGISTRY_ADDR = (process.env.REGISTRY_ADDR || process.env.REGISTRY_ADDRESS) as Address;
        const XPNTS_FACTORY_ADDR = (process.env.XPNTS_FACTORY_ADDR || process.env.XPNTS_FACTORY_ADDRESS) as Address;
        const GTOKEN_ADDR = (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address;
        const STAKING_ADDR = (process.env.STAKING_ADDR || process.env.STAKING_ADDRESS) as Address;

        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const hasRole = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'hasRole',
            args: [RoleIds.COMMUNITY, account.address]
        });

        const client = createCommunityClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: {
                registry: REGISTRY_ADDR,
                gTokenStaking: STAKING_ADDR,
                xPNTsFactory: XPNTS_FACTORY_ADDR,
                gToken: GTOKEN_ADDR
            }
        });

        if (hasRole) {
            console.log(`   ℹ️  Account ${account.address} already has COMMUNITY role.`);
            const info = await client.getCommunityInfo(account.address);
            return res.json({ 
                success: true, 
                communityAddress: account.address,
                tokenAddress: info.tokenAddress,
                transactions: [],
                message: 'Already registered'
            });
        }

        console.log('   🚀 Calling launch()...');
        
        let result;
        try {
            result = await client.launch({
                name: communityName || 'DemoDAO',
                tokenName: 'Demo Token',
                tokenSymbol: 'DEMO'
            });
            
            console.log('   ✅ Launch completed successfully');
            console.log('   📦 Result:', JSON.stringify(result, null, 2));
            
        } catch (launchError: any) {
            console.error('   ❌ Launch error caught:', launchError);
            console.error('   📋 Error details:', {
                message: launchError.message,
                stack: launchError.stack,
                cause: launchError.cause,
                errorName: launchError.errorName
            });
            
            // 重新抛出带有更多上下文的错误
            throw new Error(`Failed to launch community: ${launchError.message}`);
        }
        
        // 验证 result 结构
        if (!result) {
            throw new Error('Launch returned undefined result');
        }
        
        if (!result.txs) {
            console.warn('   ⚠️  Result missing txs property:', result);
            result.txs = [];
        }

        demoState.communityAddress = account.address;
        demoState.tokenAddress = (result as any).tokenAddress || ('0x0000000000000000000000000000000000000000' as Address);
        
        const txs = (result as any).txs || [];
        if (txs.length > 0) {
            demoState.transactions.push(...txs.map((hash: Hex) => ({ type: 'Community Launch', hash, timestamp: Date.now() })));
        }

        console.log(`✅ Community launched!`);
        console.log(`   Community Address: ${demoState.communityAddress}`);
        console.log(`   Token Address: ${demoState.tokenAddress}`);
        console.log(`   Transactions: ${txs.length}`);

        res.json({ 
            success: true, 
            communityAddress: demoState.communityAddress,
            tokenAddress: demoState.tokenAddress,
            transactions: txs
        });
    } catch (error) {
        console.error('❌ Error launching community:', error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 4. 设置运营商
app.post('/api/setup-operator', async (req, res) => {
    try {
        console.log('\n⚙️ Setting up operator...');
        const { accountIndex, type } = req.body;
        const account = privateKeyToAccount(demoState.accounts[accountIndex || 1].privateKey);

        console.log(`   Operator: ${demoState.accounts[accountIndex || 1].name} (${account.address})`);
        console.log(`   Type: ${type || 'super'}`);

        const operatorClient = createOperatorClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: {
                registry: (process.env.REGISTRY_ADDR || process.env.REGISTRY_ADDRESS) as Address,
                gTokenStaking: (process.env.STAKING_ADDR || process.env.STAKING_ADDRESS) as Address,
                gToken: (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address,
                superPaymaster: (process.env.SUPER_PAYMASTER || process.env.SUPER_PAYMASTER_ADDR) as Address,
                aPNTs: (process.env.APNTS_ADDR || process.env.APNTS_ADDRESS) as Address,
                paymasterFactory: (process.env.PAYMASTER_FACTORY_ADDR || process.env.PAYMASTER_FACTORY_ADDRESS) as Address
            }
        });

        console.log(`   🔧 Processing ${type || 'super'} setup...`);
        let txs: Hex[] = [];
        if (type === 'v4') {
            const tx = await operatorClient.deployPaymasterV4();
            txs = [tx];
        } else {
            txs = await operatorClient.onboardOperator({
                stakeAmount: parseEther('50'),
                depositAmount: parseEther('0'),
                roleId: RoleIds.PAYMASTER_SUPER
            });
        }

        if (txs.length > 0) {
            demoState.transactions.push(...txs.map((hash: Hex) => ({ type: 'Operator Setup', hash, timestamp: Date.now() })));
        }

        console.log(`✅ Operator setup complete!`);
        console.log(`   Transactions: ${txs.length}`);

        res.json({ success: true, transactions: txs });
    } catch (error) {
        console.error('❌ Error setting up operator:', error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

app.post('/api/onboard-user', async (req, res) => {
    try {
        const { accountIndex } = req.body;
        const accountData = demoState.accounts[accountIndex || 2];
        const account = privateKeyToAccount(accountData.privateKey);

        const REGISTRY_ADDR = (process.env.REGISTRY_ADDR || process.env.REGISTRY_ADDRESS) as Address;
        const SUPER_PAYMASTER_ADDR = (process.env.SUPER_PAYMASTER || process.env.SUPER_PAYMASTER_ADDR) as Address;
        const FACTORY_ADDR = (process.env.SIMPLE_ACCOUNT_FACTORY || '0x8B516A71c134a4b5196775e63b944f88Cc637F2b') as Address;
        const GTOKEN_ADDR = (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address;
        const STAKING_ADDR = (process.env.STAKING_ADDR || process.env.STAKING_ADDRESS) as Address;
        const XPNTS_FACTORY_ADDR = (process.env.XPNTS_FACTORY_ADDR || process.env.XPNTS_FACTORY_ADDRESS) as Address;

        if (!demoState.communityAddress || demoState.communityAddress === '0x0000000000000000000000000000000000000000') {
             demoState.communityAddress = (process.env.COMMUNITY_ADDR || process.env.COMMUNITY_ADDRESS) as Address;
             if (!demoState.communityAddress) {
                 return res.status(400).json({ success: false, error: 'Community not launched or configured' });
             }
        }

        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

        // --- 核心修复: 自动资助 ETH (用于 AA 部署和交易) ---
        const ethBalance = await publicClient.getBalance({ address: account.address });
        if (ethBalance < parseEther('0.02')) {
            console.log(`   💰 Funding ETH to user ${account.address}...`);
            const supplierClient = createWalletClient({ account: privateKeyToAccount(SUPPLIER_KEY), chain: sepolia, transport: http(RPC_URL) });
            const fundEthTx = await supplierClient.sendTransaction({
                to: account.address,
                value: parseEther('0.02')
            });
            await publicClient.waitForTransactionReceipt({ hash: fundEthTx });
        }
        
        // 检查是否已有角色
        const hasRole = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'hasRole',
            args: [RoleIds.ENDUSER, account.address]
        });
        if (hasRole) {
             return res.json({ success: true, message: 'Already an end user' });
        }

        let deployTx: Hash | null = null;
        // 如果是 AA 账户且未部署，则执行部署
        if (accountData.type === 'AA') {
            const byteCode = await publicClient.getBytecode({ address: accountData.address });
            if (!byteCode || byteCode === '0x') {
                deployTx = await walletClient.writeContract({
                    address: FACTORY_ADDR,
                    abi: SimpleAccountFactoryABI,
                    functionName: 'createAccount',
                    args: [account.address, 0n]
                });
                await publicClient.waitForTransactionReceipt({ hash: deployTx });
            }
        }

        // --- 核心修复: GToken 质押准备 ---
        console.log(`   🛠  Preparing GToken for onboarding...`);
        let balance = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [account.address]
        }) as bigint;

        const minStakeRequired = parseEther('0.35'); // EndUser min stake (0.3) + burn (0.05)
        if (balance < minStakeRequired) {
            console.log(`   💰 Funding GToken to user...`);
            const supplierClient = createWalletClient({ account: privateKeyToAccount(SUPPLIER_KEY), chain: sepolia, transport: http(RPC_URL) });
            const fundTx = await supplierClient.writeContract({
                address: GTOKEN_ADDR,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [account.address, minStakeRequired]
            });
            await publicClient.waitForTransactionReceipt({ hash: fundTx });
        }

        const allowance = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [account.address, STAKING_ADDR]
        }) as bigint;

        if (allowance < minStakeRequired) {
            console.log(`   🔓 Approving Staking contract...`);
            const appTx = await walletClient.writeContract({
                address: GTOKEN_ADDR,
                abi: erc20Abi,
                functionName: 'approve',
                args: [STAKING_ADDR, parseEther('1000')]
            });
            await publicClient.waitForTransactionReceipt({ hash: appTx });
        }

        const client = createEndUserClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: CONFIG.addresses
        });

        const roleData = RoleDataFactory.endUser({
            account: account.address,
            community: demoState.communityAddress,
            avatarURI: '',
            ensName: '',
            stakeAmount: 0n
        });

        const result = await client.joinAndActivate({
            community: demoState.communityAddress,
            roleId: RoleIds.ENDUSER,
            roleData
        });

        demoState.transactions.push({ type: 'User Onboarding', hash: result.tx, timestamp: Date.now() });

        res.json({ success: true, sbtId: result.sbtId.toString(), transaction: result.tx });
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 6. 基准测试
app.post('/api/benchmark', async (req, res) => {
    try {
        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const account = privateKeyToAccount(demoState.accounts[0].privateKey);

        // EOA 转账基准
        const walletClient = createWalletClient({ 
            account, 
            chain: sepolia, 
            transport: http(RPC_URL) 
        });

        const eoaHash = await walletClient.sendTransaction({
            to: demoState.accounts[1].address,
            value: 1n
        });

        const eoaReceipt = await publicClient.waitForTransactionReceipt({ hash: eoaHash });

        const results = [
            { scenario: 'EOA Transfer', gasUsed: eoaReceipt.gasUsed.toString(), hash: eoaHash },
            { scenario: 'Standard AA (Sponsored)', gasUsed: '85000', hash: 'Simulated' },
            { scenario: 'Paymaster V4', gasUsed: '90000', hash: 'Simulated' },
            { scenario: 'SuperPaymaster V3', gasUsed: '92500', hash: 'Simulated' }
        ];

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 7. 获取状态
app.get('/api/state', (req, res) => {
    res.json({
        accounts: demoState.accounts.map(a => ({ 
            name: a.name, 
            address: a.address,
            type: a.type || 'EOA'
        })),
        communityAddress: demoState.communityAddress,
        tokenAddress: demoState.tokenAddress,
        transactions: demoState.transactions
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Demo Server running at http://localhost:${PORT}`);
    console.log(`📄 Open http://localhost:${PORT} in your browser`);
});
