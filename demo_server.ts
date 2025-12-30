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
import { 
    createPublicClient, 
    createWalletClient, 
    http, 
    parseEther, 
    formatEther, 
    type Account, 
    type Hash, 
    type Address,
    encodeFunctionData,
    getContract,
    parseAbiItem,
    parseAbi,
    publicActions,
    erc20Abi,
    type Hex
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { 
    KeyManager, 
    FundingManager, 
    StateValidator,
    createCommunityClient,
    createOperatorClient,
    createEndUserClient,
    RoleIds,
    RoleDataFactory,
    getAAAddress
} from '@aastar/sdk';
import { 
    RegistryABI, 
    SimpleAccountFactoryABI
} from '@aastar/core';

// ABI Definitions (Inline)
const PaymasterFactoryPartialABI = [
    {
        name: 'getPaymasterList',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'offset', type: 'uint256' },
            { name: 'limit', type: 'uint256' }
        ],
        outputs: [{ name: 'paymasters', type: 'address[]' }]
    },
    {
        name: 'getOperatorByPaymaster',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'paymaster', type: 'address' }],
        outputs: [{ name: 'operator', type: 'address' }]
    },
    {
        name: 'paymasterByOperator',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'operator', type: 'address' }],
        outputs: [{ name: 'paymaster', type: 'address' }]
    }
] as const;

const SuperPaymasterPartialABI = [
    {
        name: 'APNTS_TOKEN',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
    },
    {
        name: 'operators',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'operator', type: 'address' }],
        outputs: [
            { name: 'aPNTsBalance', type: 'uint128' },
            { name: 'exchangeRate', type: 'uint96' },
            { name: 'isConfigured', type: 'bool' },
            { name: 'isPaused', type: 'bool' },
            { name: 'xPNTsToken', type: 'address' },
            { name: 'reputation', type: 'uint32' },
            { name: 'treasury', type: 'address' },
            { name: 'totalSpent', type: 'uint256' },
            { name: 'totalTxSponsored', type: 'uint256' }
        ]
    }
] as const;

const EntryPointABI = [{
    type: 'function',
    name: 'getDepositInfo',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'tuple', components: [{ type: 'uint256', name: 'deposit' }, { type: 'bool', name: 'staked' }, { type: 'uint256', name: 'stake' }, { type: 'uint32', name: 'unstakeDelaySec' }, { type: 'uint48', name: 'withdrawTime' }] }]
}];

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.sepolia') });

// Configuration
const RPC_URL = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || 'https://rpc.sepolia.org';
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hash;

const CONFIG = {
    rpcUrl: RPC_URL,
    addresses: {
        registry: process.env.REGISTRY_ADDR as Address,
        paymasterFactory: process.env.PAYMASTER_FACTORY_ADDR as Address,
        simpleAccountFactory: process.env.SIMPLE_ACCOUNT_FACTORY_ADDR as Address,
        gToken: (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address,
        gTokenStaking: process.env.GTOKEN_STAKING_ADDR as Address,
        superPaymaster: (process.env.SUPER_PAYMASTER || process.env.SUPER_PAYMASTER_ADDRESS) as Address,
        xPNTsFactory: process.env.XPNTS_FACTORY_ADDR as Address,
        apntsToken: (process.env.APNTS_ADDR || '0xD348d910f93b60083bF137803FAe5AF25E14B69d') as Address
    }
};

const REGISTRY_ADDR = CONFIG.addresses.registry;
const FACTORY_ADDR = CONFIG.addresses.simpleAccountFactory;
const PAYMASTER_FACTORY = CONFIG.addresses.paymasterFactory;
const GTOKEN_ADDR = CONFIG.addresses.gToken;
const STAKING_ADDR = CONFIG.addresses.gTokenStaking;
const APNTS_ADDR = CONFIG.addresses.apntsToken;
const ENTRYPOINT_ADDR = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

console.log('--- Server Configuration ---');
console.log('Registry:', REGISTRY_ADDR);
console.log('Paymaster Factory:', PAYMASTER_FACTORY);
console.log('Supplier Key used for funding');
console.log('----------------------------');


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'demo_public')));

// BigInt JSON 序列化支持
(BigInt.prototype as any).toJSON = function() { return this.toString() };

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

// 获取系统配置 (Metadata)
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        network: 'Sepolia',
        config: {
            rpcUrl: RPC_URL,
            contracts: CONFIG.addresses as any,
            supplier: privateKeyToAccount(SUPPLIER_KEY).address
        }
    });
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

        // Explicitly override addresses to ensure we use the Env-defined Registry, not SDK default
        const communityClient = createCommunityClient({
            chain: sepolia,
            transport: http(RPC_URL),
            addresses: {
                ...CONFIG.addresses,
                registry: REGISTRY_ADDR, 
                // xpntsFactory: XPNTS_FACTORY_ADDR // if needed
            }
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


// 全网运营商与 SuperPaymaster 状态查询
app.post('/api/get-network-operators', async (req, res) => {
    try {
        const PAYMASTER_FACTORY = CONFIG.addresses.paymasterFactory;
        const REGISTRY_ADDR = CONFIG.addresses.registry;
        const SUPER_PAYMASTER_ADDR = CONFIG.addresses.superPaymaster;

        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

        // 1. Fetch V4 Paymasters from Factory
        // 1. Fetch V4 Paymasters from Factory using getPaymasterList (API)
        const v4s: any[] = [];
        try {
            console.log(`[DEBUG] Fetching V4 Paymasters from Factory: ${PAYMASTER_FACTORY}`);
            const paymasters = await publicClient.readContract({
                address: PAYMASTER_FACTORY,
                abi: PaymasterFactoryPartialABI,
                functionName: 'getPaymasterList',
                args: [0n, 50n] // Fetch first 50
            }) as Address[];
            
            console.log(`[DEBUG] Found ${paymasters.length} paymasters via getPaymasterList.`);

            const accounts = demoState.accounts; 

            await Promise.all(paymasters.map(async (paymasterAddr) => {
                try {
                    // Get Operator
                    const operator = await publicClient.readContract({
                        address: PAYMASTER_FACTORY,
                        abi: PaymasterFactoryPartialABI,
                        functionName: 'getOperatorByPaymaster',
                        args: [paymasterAddr]
                    }) as Address;
                    
                    console.log(`[DEBUG] Paymaster ${paymasterAddr} -> Operator ${operator}`);

                    // Fetch Paymaster Details
                    // Get balance from EntryPoint
                     const depositInfo = await publicClient.readContract({
                        address: ENTRYPOINT_ADDR,
                        abi: EntryPointABI,
                        functionName: 'getDepositInfo',
                        args: [paymasterAddr]
                    }) as { deposit: bigint };
                    const balance = depositInfo.deposit;

                     // Try to get supported tokens
                    let supportedTokens: any[] = [];
                    try {
                        supportedTokens = await publicClient.readContract({
                            address: paymasterAddr,
                            abi: [ parseAbiItem('function getSupportedGasTokens() view returns (address[])') ],
                            functionName: 'getSupportedGasTokens'
                        }) as any[];
                    } catch (e: any) {
                        console.error(`[DEBUG] Failed to fetch supported tokens for ${paymasterAddr}:`, e.message);
                    }

                    // Get Version if possible
                    let version = 'v4';
                    try {
                        version = await publicClient.readContract({
                            address: paymasterAddr,
                            abi: [ parseAbiItem('function VERSION() view returns (string)') ],
                            functionName: 'VERSION'
                        }) as string;
                    } catch (e) {}

                    v4s.push({
                        address: paymasterAddr,
                        version: version,
                        operator: operator,
                        operatorName: accounts.find(a => a.address.toLowerCase() === operator.toLowerCase())?.name,
                        balance: balance.toString(),
                        supportedTokens: supportedTokens,
                        bindableTokens: [ (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS), (process.env.APNTS_ADDR || process.env.APNTS_ADDRESS) ].filter(t => t && t !== '0x0000000000000000000000000000000000000000')
                    });
                } catch (innerErr) {
                    console.warn(`Error fetching details for paymaster ${paymasterAddr}:`, innerErr);
                }
            }));
            console.log(`[DEBUG] Total V4s processed: ${v4s.length}`);
        } catch (e: any) {
            console.error('⚠️ Failed to fetch V4 Paymaster list via API (getPaymasterList):', e.message);
        }

        // 2. Fetch SuperPaymaster Operators from Registry
        const superMembers = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'getRoleMembers',
            args: [RoleIds.PAYMASTER_SUPER]
        }) as Address[];
        
        // Fetch global settings
        let apntsToken = '0x0000000000000000000000000000000000000000';
        try {
            apntsToken = await publicClient.readContract({
                address: SUPER_PAYMASTER_ADDR,
                abi: SuperPaymasterPartialABI,
                functionName: 'APNTS_TOKEN'
            }) as Address;
        } catch (e) {
            console.error('Failed to fetch APNTS_TOKEN', e);
        }

        const superOperators = await Promise.all(superMembers.map(async (addr) => {
            const local = demoState.accounts.find(a => a.address.toLowerCase() === addr.toLowerCase());
            
            // Get stats
            let balance = 0n;
            let totalSpent = 0n;
            try {
                const stats = await publicClient.readContract({
                    address: SUPER_PAYMASTER_ADDR,
                    abi: SuperPaymasterPartialABI,
                    functionName: 'operators',
                    args: [addr]
                }) as any;
                // viem returns array for struct/tuple output? No, named outputs usually object if compiled with ABI that has names?
                // Actually with 'readContract' and ABI with named outputs, it often returns array depending on version/config.
                // Let's assume array indexing based on ABI order just to be safe: 
                // [aPNTsBalance, exchangeRate, isConfigured, isPaused, xPNTsToken, reputation, treasury, totalSpent, totalTxSponsored]
                
                // If viem returns array (common):
                if (Array.isArray(stats)) {
                    balance = stats[0];
                    totalSpent = stats[7];
                } else {
                    balance = stats.aPNTsBalance;
                    totalSpent = stats.totalSpent;
                }
            } catch (e) {}

            return {
                type: 'super',
                address: SUPER_PAYMASTER_ADDR,
                operator: addr,
                operatorName: local ? local.name : null,
                balance: balance.toString(),
                totalSpent: totalSpent.toString()
            };
        }));


        // Fetch Token Symbols for all encountered tokens
        const allTokenAddrs = new Set<string>();
        v4s.forEach(p => p.supportedTokens.forEach((t: string) => allTokenAddrs.add(t.toLowerCase())));
        // Also check if any super operator tokens needed? (Already handled below)

        const tokenSymbols: Record<string, string> = {
            [(process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS || '').toLowerCase()]: 'GToken',
            [(process.env.APNTS_ADDR || process.env.APNTS_ADDRESS || '').toLowerCase()]: 'xPNTs'
        };

        // Fetch missing symbols
        await Promise.all(Array.from(allTokenAddrs).map(async (addr) => {
            if (!tokenSymbols[addr]) {
                try {
                    const symbol = await publicClient.readContract({
                        address: addr as Address,
                        abi: [ parseAbiItem('function symbol() view returns (string)') ],
                        functionName: 'symbol'
                    }) as string;
                    tokenSymbols[addr] = symbol;
                } catch (e) {
                    tokenSymbols[addr] = 'ERC20';
                }
            }
        }));

        res.json({
            success: true,
            v4: v4s,
            super: superOperators,
            constants: {
                apntsToken,
                tokens: tokenSymbols
            }
        });
    } catch (e: any) {
        console.error('Failed to load operators:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Deposit aPNTs to SuperPaymaster
app.post('/api/paymaster/deposit', async (req, res) => {
    try {
        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const { operatorAddr, amount } = req.body; 
        
        const rawAccount = demoState.accounts.find(a => a.address.toLowerCase() === operatorAddr.toLowerCase());
        if (!rawAccount) throw new Error('Operator account not found locally');
        
        // Fix: Convert to Viem Account
        const account = privateKeyToAccount(rawAccount.privateKey as `0x${string}`);

        const walletClient = createWalletClient({
            account: account, // Correct Viem account
            chain: sepolia,
            transport: http(RPC_URL)
        });

        // 1. Get APNTS Token
        const apntsToken = await publicClient.readContract({
             address: (process.env.SUPER_PAYMASTER_ADDR || process.env.SUPER_PAYMASTER) as Address,
             abi: [ parseAbiItem('function APNTS_TOKEN() view returns (address)') ],
             functionName: 'APNTS_TOKEN'
        }) as Address;

        const value = parseEther(amount.toString());

        // 2. Approve (Skipped: User indicates SuperPaymaster is trusted/whitelisted)
        // console.log(`Approving ${amount} aPNTs for SuperPaymaster...`);
        // const approveHash = await walletClient.writeContract({
        //     address: apntsToken,
        //     abi: [ parseAbiItem('function approve(address spender, uint256 value) external returns (bool)') ],
        //     functionName: 'approve',
        //     args: [(process.env.SUPER_PAYMASTER_ADDR || process.env.SUPER_PAYMASTER) as Address, value],
        //     chain: sepolia,
        //     account: account 
        // });
        // await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // 3. Deposit
        console.log(`Depositing ${amount} aPNTs...`);
        const depositHash = await walletClient.writeContract({
            address: (process.env.SUPER_PAYMASTER_ADDR || process.env.SUPER_PAYMASTER) as Address,
            abi: [ parseAbiItem('function deposit(uint256 amount) external') ],
            functionName: 'deposit',
            args: [value],
            chain: sepolia,
            account: account
        });
        
        await publicClient.waitForTransactionReceipt({ hash: depositHash });
        console.log('Deposit confirmed:', depositHash);

        res.json({ success: true, tx: depositHash });
    } catch (e: any) {
        console.error('Deposit failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});


// 批量查询运营商状态
app.post('/api/get-operators', async (req, res) => {
    try {
        // Instead of fetching from Registry (which only knows Super/AOA),
        // we should iterate over our LOCAL accounts to check their status on chain.
        // This ensures Alice (who might have V4 but no Registry role) is checked.
        
        const operatorClient = createOperatorClient({
            chain: sepolia,
            transport: http(RPC_URL),
            addresses: CONFIG.addresses
        });

        const operators = await Promise.all(
            demoState.accounts.map(async (account) => {
                // 1. Check if they have a V4 Paymaster via Factory (using our new ABI method)
                const factoryAddr = (process.env.PAYMASTER_FACTORY_ADDR || process.env.PAYMASTER_FACTORY_ADDRESS) as Address;
                let v4Address: Address | null = null;
                try {
                    const pm = await publicClient.readContract({
                        address: factoryAddr,
                        abi: PaymasterFactoryPartialABI,
                        functionName: 'paymasterByOperator',
                        args: [account.address]
                    }) as Address;
                    if(pm && pm !== '0x0000000000000000000000000000000000000000') v4Address = pm;
                } catch(e) {}

                // 2. Check SuperPaymaster Status via OperatorClient (or manual check)
                let superStatus = null;
                try {
                     const status = await operatorClient.getOperatorStatus(account.address);
                     // If they have superPaymaster data
                     if (status.superPaymaster && status.superPaymaster.isConfigured) {
                         superStatus = status.superPaymaster;
                     }
                } catch(e) {}

                return {
                    accountName: account.name,
                    accountAddress: account.address,
                    type: (v4Address && superStatus) ? 'Hybrid' : (v4Address ? 'V4 Only' : (superStatus ? 'Super Only' : 'None')),
                    superPaymaster: superStatus,
                    paymasterV4: v4Address ? { address: v4Address, balance: '0', version: 'v4' } : null
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
// 2. 批量充值 (Smart Funding)
app.post('/api/fund-accounts', async (req, res) => {
    try {
        console.log('\n💰 Funding accounts (Smart Mode)...');
        const { ethAmount, tokenAmount } = req.body;
        
        // Thresholds
        // ETH: check < 0.05, target 0.1 (or user param)
        // GToken: check < 100, target 1000 (or user param)
        // aPNTs: check < 1000, target 10000
        const ETH_THRESHOLD = parseEther('0.05');
        const ETH_TARGET = parseEther('0.1');
        const GTOKEN_THRESHOLD = parseEther('100');
        const GTOKEN_TARGET = parseEther('1000');
        const APNTS_THRESHOLD = parseEther('1000');
        const APNTS_TARGET = parseEther('10000');

        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
        const supplier = privateKeyToAccount(SUPPLIER_KEY);
        const walletClient = createWalletClient({ account: supplier, chain: sepolia, transport: http(RPC_URL) });

        const GTOKEN_ADDR = (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address;
        const APNTS_ADDR = (process.env.APNTS_ADDR || '0xD348d910f93b60083bF137803FAe5AF25E14B69d') as Address;

        console.log(`   💼 Supplier: ${supplier.address}`);

        const results = [];

        for (let i = 0; i < demoState.accounts.length; i++) {
            const acc = demoState.accounts[i];
            const accAddr = acc.address;
            const actions = [];
            
            // 1. ETH Check
            const ethBal = await publicClient.getBalance({ address: accAddr });
            if (ethBal < ETH_THRESHOLD) {
                const amount = ETH_TARGET - ethBal; 
                try {
                    const hash = await walletClient.sendTransaction({ to: accAddr, value: amount });
                    await publicClient.waitForTransactionReceipt({ hash });
                    actions.push(`ETH: +${(Number(amount)/1e18).toFixed(3)}`);
                } catch (e: any) {
                    console.error(`Failed to fund ETH for ${acc.name}:`, e.message);
                }
            } else {
                actions.push(`ETH: OK`);
            }

            // 2. GToken Check
            try {
                const gBal = await publicClient.readContract({ address: GTOKEN_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [accAddr] }) as bigint;
                if (gBal < GTOKEN_THRESHOLD) {
                    const amount = GTOKEN_TARGET - gBal;
                    const hash = await walletClient.writeContract({ address: GTOKEN_ADDR, abi: erc20Abi, functionName: 'transfer', args: [accAddr, amount] });
                     await publicClient.waitForTransactionReceipt({ hash });
                    actions.push(`GToken: +${(Number(amount)/1e18).toFixed(0)}`);
                } else {
                    actions.push(`GToken: OK`);
                }
            } catch (e: any) {
                 console.error(`Failed to fund GToken for ${acc.name}:`, e.message);
            }

            // 3. aPNTs Check
            if (APNTS_ADDR && APNTS_ADDR !== '0x0000000000000000000000000000000000000000') {
                try {
                    const aBal = await publicClient.readContract({ address: APNTS_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [accAddr] }) as bigint;
                    if (aBal < APNTS_THRESHOLD) {
                        const amount = APNTS_TARGET - aBal;
                         const hash = await walletClient.writeContract({ address: APNTS_ADDR, abi: erc20Abi, functionName: 'transfer', args: [accAddr, amount] });
                        await publicClient.waitForTransactionReceipt({ hash });
                        actions.push(`aPNTs: +${(Number(amount)/1e18).toFixed(0)}`);
                    } else {
                        actions.push(`aPNTs: OK`);
                    }
                } catch (e: any) {
                    console.error(`Failed to fund aPNTs for ${acc.name}: (Check if Supplier has bal/allowance)`, e.message);
                }
            }

            console.log(`      [${i+1}/${demoState.accounts.length}] ${acc.name}: ${actions.join(', ')}`);
            results.push({ name: acc.name, actions });
        }

        console.log('✅ Smart funding complete!');
        res.json({ success: true, message: 'Smart funding complete', results });
    } catch (error: any) {
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
        const targetIndex = accountIndex !== undefined ? accountIndex : 1;
        const account = privateKeyToAccount(demoState.accounts[targetIndex].privateKey);

        console.log(`   Operator: ${demoState.accounts[targetIndex].name} (${account.address})`);
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

        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

        console.log(`   🔧 Processing ${type || 'super'} setup...`);
        let txs: Hex[] = [];
        if (type === 'v4') {
            // Check if Paymaster already exists for this operator
            const factoryAddr = (process.env.PAYMASTER_FACTORY_ADDR || process.env.PAYMASTER_FACTORY_ADDRESS) as Address;
            const existingPm = await publicClient.readContract({
                address: factoryAddr,
                abi: PaymasterFactoryPartialABI,
                functionName: 'paymasterByOperator',
                args: [account.address]
            }) as Address;

            if (existingPm && existingPm !== '0x0000000000000000000000000000000000000000') {
                console.log(`   ⚠️ Operator already has Paymaster: ${existingPm}. Skipping deployment.`);
                // We can't return the tx hash of deployment since didn't deploy, but we can treat as success
                txs = [];
            } else {
                console.log('   SDK: Deploying Paymaster V4 (v4.2) with initialization...');
                
                // Encode initialize(owner) for V4.2 Clone
                const initAbi = parseAbi(['function initialize(address) external']);
                const initData = encodeFunctionData({
                    abi: initAbi,
                    functionName: 'initialize',
                    args: [account.address]
                });

                const tx = await operatorClient.deployPaymasterV4({ version: 'v4.2', initData });
                txs = [tx];
            }
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
        const { accountIndex, communityAddress } = req.body;
        console.log(`\n🚀 [API] /onboard-user called. Index: ${accountIndex}, Community: ${communityAddress}`);

        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

        const targetIndex = accountIndex !== undefined ? accountIndex : 2;
        const accountData = demoState.accounts[targetIndex];
        const account = privateKeyToAccount(accountData.privateKey);

        const REGISTRY_ADDR = (process.env.REGISTRY_ADDR || process.env.REGISTRY_ADDRESS) as Address;
        const SUPER_PAYMASTER_ADDR = (process.env.SUPER_PAYMASTER || process.env.SUPER_PAYMASTER_ADDR) as Address;
        const FACTORY_ADDR = (process.env.SIMPLE_ACCOUNT_FACTORY || '0x8B516A71c134a4b5196775e63b944f88Cc637F2b') as Address;
        const GTOKEN_ADDR = (process.env.GTOKEN_ADDR || process.env.GTOKEN_ADDRESS) as Address;
        const STAKING_ADDR = (process.env.STAKING_ADDR || process.env.STAKING_ADDRESS) as Address;
        const XPNTS_FACTORY_ADDR = (process.env.XPNTS_FACTORY_ADDR || process.env.XPNTS_FACTORY_ADDRESS) as Address;

        // 1. Resolve Target Community
        let targetCommunity = communityAddress as Address;
        if (!targetCommunity || targetCommunity === '0x0000000000000000000000000000000000000000') {
             targetCommunity = (demoState.communityAddress || process.env.COMMUNITY_ADDR || process.env.COMMUNITY_ADDRESS) as Address;
        }
        
        if (targetCommunity) demoState.communityAddress = targetCommunity;

        if (!targetCommunity || targetCommunity === '0x0000000000000000000000000000000000000000') {
            console.error('[Error] No Community Address provided or configured.');
            return res.status(400).json({ success: false, error: 'Community not launched or configured' });
        }

        console.log(`\n🔍 [Debug] Onboarding Check for ${accountData.name} (${accountData.address})`);
        console.log(`   Target Community: ${targetCommunity}`);

        // 2. Check xPNTs Token
        const factoryAbi = parseAbi(['function getTokenAddress(address) view returns (address)']);
        let tokenAddr = '0x0000000000000000000000000000000000000000';
        try {
            tokenAddr = await publicClient.readContract({
                address: XPNTS_FACTORY_ADDR,
                abi: factoryAbi,
                functionName: 'getTokenAddress',
                args: [targetCommunity]
            }) as string;
            console.log(`   Token Address Found: ${tokenAddr}`);
        } catch (e: any) {
            console.error(`   ❌ Failed to query token address: ${e.message}`);
        }

        if (!tokenAddr || tokenAddr === '0x0000000000000000000000000000000000000000') {
             console.warn(`   ⚠️ Community ${targetCommunity} has NO xPNTs Token configured.`);
             return res.status(400).json({ success: false, error: `Community ${targetCommunity} not fully launched (No xPNTs Token). Please deploy token first.` });
        }

        const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

        // 3. Fund ETH (for AA deployment)
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
        
        // 4. Check Existing Role
        const hasRole = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'hasRole',
            args: [RoleIds.ENDUSER, account.address]
        });
        if (hasRole) {
             return res.json({ success: true, message: 'Already an end user' });
        }

        // 5. Deploy AA Account if needed
        let deployTx: Hash | null = null;
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

        // 6. GToken Staking Preparation
        const minStakeRequired = parseEther('0.35'); // EndUser min stake (0.3) + burn (0.05)
        
        let balance = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [account.address]
        }) as bigint;
        console.log(`   GToken Balance: ${(Number(balance)/1e18).toFixed(2)}`);

        if (balance < minStakeRequired) {
            console.log(`   ⚠️ Insufficient GToken. Funding from Supplier...`);
            const supplierClient = createWalletClient({ account: privateKeyToAccount(SUPPLIER_KEY), chain: sepolia, transport: http(RPC_URL) });
            const fundTx = await supplierClient.writeContract({
                address: GTOKEN_ADDR,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [account.address, minStakeRequired]
            });
            await publicClient.waitForTransactionReceipt({ hash: fundTx });
            console.log(`   ✅ GToken Funded: ${fundTx}`);
        }

        const allowance = await publicClient.readContract({
            address: GTOKEN_ADDR,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [account.address, STAKING_ADDR]
        }) as bigint;
        console.log(`   Staking Allowance: ${(Number(allowance)/1e18).toFixed(2)}`);

        if (allowance < minStakeRequired) {
            console.log(`   🔓 Approving Staking contract...`);
            const appTx = await walletClient.writeContract({
                address: GTOKEN_ADDR,
                abi: erc20Abi,
                functionName: 'approve',
                args: [STAKING_ADDR, parseEther('1000')]
            });
            await publicClient.waitForTransactionReceipt({ hash: appTx });
            console.log(`   ✅ Approved: ${appTx}`);
        }

        // 7. Initialize EndUser Client and Join
        const client = createEndUserClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: CONFIG.addresses
        });

        console.log(`   🏛 Joining Community: ${targetCommunity}`);

        const roleData = RoleDataFactory.endUser({
            account: account.address,
            community: targetCommunity,
            avatarURI: '',
            ensName: '',
            stakeAmount: 0n
        });

        console.log(`   🚀 Sending joinAndActivate transaction...`);
        const result = await client.joinAndActivate({
            community: targetCommunity,
            roleId: RoleIds.ENDUSER,
            roleData
        });
        console.log(`   ✅ Success! Tx: ${result.tx}, SBT ID: ${result.sbtId}`);

        demoState.transactions.push({ type: 'User Onboarding', hash: result.tx, timestamp: Date.now() });

        res.json({ success: true, sbtId: result.sbtId.toString(), transaction: result.tx });
    } catch (error) {
        console.error('❌ Error during user onboarding:', error);
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

// --- New Endpoints for Token & Paymaster Binding ---

app.post('/api/deploy-token', async (req, res) => {
    try {
        const { accountAddress, name, symbol, communityName } = req.body;
        const accountData = demoState.accounts.find(a => a.address === accountAddress);
        if (!accountData) throw new Error('Account not found');
        const account = privateKeyToAccount(accountData.privateKey);

        const client = createWalletClient({
            account,
            chain: sepolia,
            transport: http(RPC_URL)
        }).extend(publicActions);

        console.log(`🚀 Deploying xPNTs for ${communityName}...`);
        
        // ABI for deployxPNTsToken
        const factoryAbi = parseAbi(['function deployxPNTsToken(string,string,string,string,uint256,address) returns (address)']);
        
        const hash = await client.writeContract({
            account: account as any,
            address: CONFIG.addresses.xPNTsFactory,
            abi: factoryAbi,
            functionName: 'deployxPNTsToken',
            args: [
                name || 'Community Token',
                symbol || 'XPNT',
                communityName || 'Community',
                '', // ENS
                1000000000000000000n, // 1:1 Exchange Rate
                '0x0000000000000000000000000000000000000000' // Paymaster AOA
            ]
        });

        console.log(`   Tx Sent: ${hash}`);
        const receipt = await client.waitForTransactionReceipt({ hash });
        console.log(`   ✅ Token Deployed`);

        res.json({ success: true, tx: hash });
    } catch (e: any) {
        console.error('Deploy Token Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/bind-paymaster', async (req, res) => {
    try {
        const { paymasterAddress, tokenAddress, operatorAddress } = req.body;
        const accountData = demoState.accounts.find(a => a.address.toLowerCase() === operatorAddress.toLowerCase());
        if (!accountData) throw new Error('Operator account not found');
        const account = privateKeyToAccount(accountData.privateKey);

        const client = createWalletClient({
            account,
            chain: sepolia,
            transport: http(RPC_URL)
        }).extend(publicActions);

        console.log(`🔗 Binding Token ${tokenAddress} to Paymaster ${paymasterAddress}...`);

        const abi = parseAbi(['function addGasToken(address)']);
        const hash = await client.writeContract({
            account: account as any,
            address: paymasterAddress,
            abi,
            functionName: 'addGasToken',
            args: [tokenAddress]
        });

        console.log(`   Tx Sent: ${hash}`);
        await client.waitForTransactionReceipt({ hash });
        console.log(`   ✅ Bound Successfully`);

        res.json({ success: true, tx: hash });
    } catch (e: any) {
        console.error('Bind Paymaster Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Demo Server running at http://localhost:${PORT}`);
    console.log(`📄 Open http://localhost:${PORT} in your browser`);
});
