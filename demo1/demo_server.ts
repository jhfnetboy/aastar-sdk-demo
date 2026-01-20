/**
 * demo_server.ts - 统一的演示后端
 * 整合所有 00-05 脚本功能，提供 HTTP API
 */

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { http, parseEther, createPublicClient, erc20Abi, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { 
    KeyManager, 
    FundingManager, 
    StateValidator,
    createCommunityClient,
    createOperatorClient,
    createEndUserClient,
    RoleIds,
    RoleDataFactory
} from '@aastar/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.sepolia') });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'demo_public')));

const RPC_URL = process.env.SEPOLIA_RPC_URL!;
const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER as Hex;

// 存储演示状态
const demoState = {
    accounts: [] as Array<{ name: string; address: Address; privateKey: Hex }>,
    communityAddress: null as Address | null,
    tokenAddress: null as Address | null,
    transactions: [] as Array<{ type: string; hash: Hex; timestamp: number }>
};

// 1. 生成账户
app.post('/api/generate-accounts', async (req, res) => {
    try {
        console.log('\n🎲 Generating accounts...');
        const { names } = req.body;
        const keys = KeyManager.generateKeyPairs(names || ['Alice', 'Bob', 'Charlie']);
        
        demoState.accounts = keys.map(k => ({
            name: k.name,
            address: k.address,
            privateKey: k.privateKey
        }));

        console.log('✅ Generated accounts:');
        demoState.accounts.forEach(a => {
            console.log(`   ${a.name}: ${a.address}`);
            console.log(`   Private Key: ${a.privateKey.substring(0, 10)}...${a.privateKey.substring(a.privateKey.length - 8)}`);
        });

        res.json({ 
            success: true, 
            accounts: demoState.accounts.map(a => ({ 
                name: a.name, 
                address: a.address,
                privateKey: a.privateKey
            })) 
        });
    } catch (error) {
        console.error('❌ Error generating accounts:', error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 2. 批量充值
app.post('/api/fund-accounts', async (req, res) => {
    try {
        console.log('\n💰 Funding accounts...');
        const { ethAmount, tokenAmount } = req.body;
        const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

        console.log(`   Using Supplier: ${privateKeyToAccount(SUPPLIER_KEY).address}`);
        console.log(`   Target ETH: ${ethAmount || '0.05'} per account`);
        console.log(`   Target GToken: ${tokenAmount || '50'} per account`);

        // 充值 ETH
        console.log('\n   📤 Funding ETH...');
        for (let i = 0; i < demoState.accounts.length; i++) {
            const account = demoState.accounts[i];
            console.log(`      [${i + 1}/${demoState.accounts.length}] Funding ${account.name} (${account.address})...`);
            
            await FundingManager.fundWithETH({
                rpcUrl: RPC_URL,
                chain: sepolia,
                supplierKey: SUPPLIER_KEY,
                targetAddress: account.address,
                amount: ethAmount || '0.05'
            });
        }

        // 充值 GToken
        console.log('\n   🪙 Funding GToken...');
        for (let i = 0; i < demoState.accounts.length; i++) {
            const account = demoState.accounts[i];
            console.log(`      [${i + 1}/${demoState.accounts.length}] Funding ${account.name} with GToken...`);
            
            await FundingManager.fundWithToken({
                rpcUrl: RPC_URL,
                chain: sepolia,
                supplierKey: SUPPLIER_KEY,
                targetAddress: account.address,
                tokenAddress: process.env.GTOKEN_ADDR as Address,
                amount: tokenAmount || '50'
            });
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

// 3. 启动社区
app.post('/api/launch-community', async (req, res) => {
    try {
        console.log('\n🏛️ Launching community...');
        const { accountIndex, communityName } = req.body;
        const account = privateKeyToAccount(demoState.accounts[accountIndex || 0].privateKey);

        console.log(`   Admin: ${demoState.accounts[accountIndex || 0].name} (${account.address})`);
        console.log(`   Community Name: ${communityName || 'DemoDAO'}`);

        const client = createCommunityClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: {
                registry: process.env.REGISTRY_ADDR as Address,
                gTokenStaking: process.env.STAKING_ADDR as Address,
                xPNTsFactory: process.env.XPNTS_FACTORY_ADDR as Address,
                gToken: process.env.GTOKEN_ADDR as Address
            }
        });

        console.log('   🚀 Calling launch()...');
        const result = await client.launch({
            name: communityName || 'DemoDAO',
            tokenName: 'Demo Token',
            tokenSymbol: 'DEMO'
        });

        demoState.communityAddress = account.address;
        demoState.tokenAddress = result.tokenAddress;
        
        // 安全处理 txs（可能为 undefined）
        const txs = result.txs || [];
        if (txs.length > 0) {
            demoState.transactions.push(...txs.map(hash => ({ type: 'Community Launch', hash, timestamp: Date.now() })));
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
        const { accountIndex } = req.body;
        const account = privateKeyToAccount(demoState.accounts[accountIndex || 1].privateKey);

        console.log(`   Operator: ${demoState.accounts[accountIndex || 1].name} (${account.address})`);

        const client = createOperatorClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: {
                registry: process.env.REGISTRY_ADDR as Address,
                staking: process.env.STAKING_ADDR as Address,
                superPaymaster: process.env.SUPER_PAYMASTER as Address,
                gtoken: process.env.GTOKEN_ADDR as Address
            }
        });

        console.log('   🔧 Calling onboardOperator()...');
        const result = await client.onboardOperator({
            stakeAmount: parseEther('50'),
            depositAmount: parseEther('0'),
            roleId: RoleIds.PAYMASTER_SUPER,
            roleData: '0x' as Hex
        });

        const txs = result.txs || [];
        if (txs.length > 0) {
            demoState.transactions.push(...txs.map(hash => ({ type: 'Operator Setup', hash, timestamp: Date.now() })));
        }

        console.log(`✅ Operator setup complete!`);
        console.log(`   Transactions: ${txs.length}`);

        res.json({ success: true, transactions: txs });
    } catch (error) {
        console.error('❌ Error setting up operator:', error);
        res.status(500).json({ success: false, error: (error as Error).message });
    }
});

// 5. 用户入驻
app.post('/api/onboard-user', async (req, res) => {
    try {
        const { accountIndex } = req.body;
        const account = privateKeyToAccount(demoState.accounts[accountIndex || 2].privateKey);

        if (!demoState.communityAddress) {
            return res.status(400).json({ success: false, error: 'Community not launched yet' });
        }

        const client = createEndUserClient({
            chain: sepolia,
            transport: http(RPC_URL),
            account,
            addresses: {
                registry: process.env.REGISTRY_ADDR as Address,
                superPaymaster: process.env.SUPER_PAYMASTER as Address
            }
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
        const eoaHash = await publicClient.sendTransaction({
            account,
            to: demoState.accounts[1].address,
            value: 1n
        } as any);

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
        accounts: demoState.accounts.map(a => ({ name: a.name, address: a.address })),
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
