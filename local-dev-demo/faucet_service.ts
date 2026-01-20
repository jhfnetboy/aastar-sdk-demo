import express from 'express';
import cors from 'cors';
import { 
    createPublicClient, 
    http, 
    createWalletClient, 
    parseEther, 
    encodeFunctionData,
    parseAbi,
    parseAbiParameters,
    encodeAbiParameters,
    formatEther
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.sepolia') });

const app = express();
app.use(cors());
app.use(express.json());

// Load configurations
const SDK_PATH = path.resolve(__dirname, '../../aastar-sdk');
const CONFIG_PATH = path.join(SDK_PATH, 'config.sepolia.json');
const STATE_PATH = path.join(SDK_PATH, 'scripts/l4-state.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const PUBLIC_CLIENT = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER || process.env.ADMIN_KEY;
if (!SUPPLIER_KEY) {
    console.error("❌ Missing PRIVATE_KEY_SUPPLIER in .env.sepolia");
    process.exit(1);
}

const adminAccount = privateKeyToAccount(SUPPLIER_KEY as `0x${string}`);
const adminWallet = createWalletClient({
    account: adminAccount,
    chain: sepolia,
    transport: http(RPC_URL)
});

// --- ABIs ---
const ERC20_ABI = parseAbi([
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function mint(address to, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)'
]);

const REGISTRY_ABI = parseAbi([
    'function hasRole(bytes32 roleId, address user) view returns (bool)',
    'function registerRole(bytes32 roleId, address user, bytes data) public',
    'function ROLE_ENDUSER() view returns (bytes32)'
]);

const FACTORY_ABI = parseAbi([
    'function createAccount(address owner, uint256 salt) returns (address)'
]);

const ACCOUNT_ABI = parseAbi([
    'function execute(address dest, uint256 value, bytes calldata func) external'
]);

const ROLE_ENDUSER = "0x0c34ecc75d3bf122e0609d2576e167f53fb42429262ce8c9b33cab91ff670e3a";

// --- Endpoints ---

app.get('/', (req, res) => {
    const readme = `
🚰 AAStar Onboarding Faucet (L4 Logic)
======================================

The faucet service provides ETH funding and L4-level AA registration.

Usage (curl):
------------
curl -X POST http://localhost:3002/faucet \\
     -H "Content-Type: application/json" \\
     -d '{"target": "0xYourAAAddress", "ownerKey": "0xYourOwnerPrivateKey"}'

Parameters:
-----------
- target: The AA address to fund and register.
- ownerKey: (Required for full L4 registration).
            The private key of the AA's owner EOA.
`;
    res.type('text/plain').send(readme);
});

app.post('/faucet', async (req, res) => {
    const { target, ownerKey } = req.body;
    if (!target) return res.status(400).json({ error: "Target address required" });

    console.log(`\n🚰 Faucet request for: ${target}`);
    const results: { name: string; tx?: string; amount?: string; status: string }[] = [];

    try {
        // 1. Fund ETH to AA
        const balance = await PUBLIC_CLIENT.getBalance({ address: target as `0x${string}` });
        if (balance < parseEther('0.01')) {
            const hash = await adminWallet.sendTransaction({ to: target as `0x${string}`, value: parseEther('0.05') });
            // await PUBLIC_CLIENT.waitForTransactionReceipt({ hash }); // Optional: wait or fire-and-forget to speed up? Better wait.
            await PUBLIC_CLIENT.waitForTransactionReceipt({ hash });
            results.push({ name: "AA ETH Funding", amount: "0.05 ETH", tx: hash, status: "success" });
            console.log(`   ✅ AA ETH Funded: ${hash}`);
        } else {
            results.push({ name: "AA ETH Funding", status: "skipped (already funded)" });
        }

        if (ownerKey) {
            const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
            
            // 1b. Fund ETH to Owner
            const ownerBalance = await PUBLIC_CLIENT.getBalance({ address: ownerAccount.address });
            if (ownerBalance < parseEther('0.01')) {
                const hash = await adminWallet.sendTransaction({ to: ownerAccount.address, value: parseEther('0.05') });
                await PUBLIC_CLIENT.waitForTransactionReceipt({ hash });
                results.push({ name: "EOA ETH Funding", amount: "0.05 ETH", tx: hash, status: "success" });
                console.log(`   ✅ EOA ETH Funded: ${hash}`);
            }

            const ownerClient = createWalletClient({ account: ownerAccount, chain: sepolia, transport: http(RPC_URL) });

            // 2. Deploy AA if needed
            const code = await PUBLIC_CLIENT.getBytecode({ address: target as `0x${string}` });
            if (!code || code === '0x') {
                const hash = await adminWallet.writeContract({
                    address: config.simpleAccountFactory as `0x${string}`,
                    abi: FACTORY_ABI,
                    functionName: 'createAccount',
                    args: [ownerAccount.address, 0n]
                });
                await PUBLIC_CLIENT.waitForTransactionReceipt({ hash });
                results.push({ name: "AA Deployment", tx: hash, status: "success" });
                console.log(`   ✅ AA Deployed: ${hash}`);
            }

            // 3. Register Role
            const isMember = await PUBLIC_CLIENT.readContract({
                address: config.registry as `0x${string}`,
                abi: REGISTRY_ABI,
                functionName: 'hasRole',
                args: [ROLE_ENDUSER as `0x${string}`, target as `0x${string}`]
            });

            if (!isMember) {
                // i. Fund GToken
                const fundHash = await adminWallet.writeContract({
                    address: config.gToken as `0x${string}`,
                    abi: ERC20_ABI,
                    functionName: 'transfer',
                    args: [target as `0x${string}`, parseEther('2')]
                });
                await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: fundHash });
                results.push({ name: "GToken Seeding", amount: "2 GToken", tx: fundHash, status: "success" });

                // ii. Approve Staking (via AA execute)
                const approveData = encodeFunctionData({
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [config.staking as `0x${string}`, parseEther('2000')]
                });
                const execApproveData = encodeFunctionData({
                    abi: ACCOUNT_ABI,
                    functionName: 'execute',
                    args: [config.gToken as `0x${string}`, 0n, approveData]
                });
                const approveHash = await ownerClient.sendTransaction({ 
                    to: target as `0x${string}`, 
                    data: execApproveData 
                });
                await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: approveHash });
                results.push({ name: "Staking Approval", tx: approveHash, status: "success" });

                // iii. Register (via AA execute)
                const anni = state.operators.anni.address;
                const roleData = encodeAbiParameters(
                    parseAbiParameters('address acc, address comm, string avatar, string ens, uint256 stake'),
                    [target as `0x${string}`, anni as `0x${string}`, "", "", parseEther('0.3')]
                );
                const regData = encodeFunctionData({
                    abi: REGISTRY_ABI,
                    functionName: 'registerRole',
                    args: [ROLE_ENDUSER as `0x${string}`, target as `0x${string}`, roleData]
                });
                // Note: We use execute here so the msg.sender in Registry is the AA
                const execRegData = encodeFunctionData({
                    abi: ACCOUNT_ABI,
                    functionName: 'execute',
                    args: [config.registry as `0x${string}`, 0n, regData]
                });
                const regHash = await ownerClient.sendTransaction({ 
                    to: target as `0x${string}`, 
                    data: execRegData 
                });
                await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: regHash });
                results.push({ name: "Community Registration", tx: regHash, status: "success" });
                console.log(`   ✅ AA Registered: ${regHash}`);
            } else {
                results.push({ name: "Community Registration", status: "skipped (already member)" });
            }
        }

        // 4. Mint Gas Tokens (aPNTs)
        const apntsAddr = config.aPNTs as `0x${string}` || config.contracts?.aPNTs;
        const apntsBal = await PUBLIC_CLIENT.readContract({
            address: apntsAddr,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [target as `0x${string}`]
        });

        if (apntsBal < parseEther('10')) {
            const mintHash = await adminWallet.writeContract({
                address: apntsAddr,
                abi: ERC20_ABI,
                functionName: 'mint',
                args: [target as `0x${string}`, parseEther('100')]
            });
            await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: mintHash });
            results.push({ name: "Gas Token Minting", amount: "100 aPNTs", tx: mintHash, status: "success" });
            console.log(`   ✅ aPNTs Minted: ${mintHash}`);
        } else {
            results.push({ name: "Gas Token Minting", status: "skipped (already has balance)" });
        }

        // 4b. Ensure Paymaster Deposit (Fix for AA23)
        const entryPointAbi = parseAbi([
            'function balanceOf(address) view returns (uint256)',
            'function depositTo(address) payable'
        ]);
        const spDeposit = await PUBLIC_CLIENT.readContract({
            address: config.entryPoint as `0x${string}`,
            abi: entryPointAbi,
            functionName: 'balanceOf',
            args: [config.superPaymaster as `0x${string}`]
        });
        
        console.log(`   🔎 Paymaster Deposit: ${formatEther(spDeposit)} ETH`);

        if (spDeposit < parseEther('0.05')) {
            const depositHash = await adminWallet.writeContract({
                address: config.entryPoint as `0x${string}`,
                abi: entryPointAbi,
                functionName: 'depositTo',
                args: [config.superPaymaster as `0x${string}`],
                value: parseEther('0.1')
            });
            await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: depositHash });
            results.push({ name: "Paymaster Deposit Top-up", amount: "0.1 ETH", tx: depositHash, status: "success" });
            console.log(`   ✅ Paymaster Deposited: ${depositHash}`);
        }

        // 4c. Force Paymaster Oracle Update via DVT (Owner Override)
        // Fix for AA23 OracleError: Chainlink might be stale, so we force a value.
        const pmAbi = parseAbi(['function updatePriceDVT(int256 price, uint256 updatedAt, bytes calldata proof) external']);
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const price = 300000000000n; // $3000 * 1e8
            
            const upHash = await adminWallet.writeContract({
                address: config.superPaymaster as `0x${string}`,
                abi: pmAbi,
                functionName: 'updatePriceDVT',
                args: [price, BigInt(timestamp), '0x']
            });
            await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: upHash });
            results.push({ name: "Paymaster DVT Price Update", tx: upHash, status: "success" });
            console.log(`   ✅ Price Updated (DVT): ${upHash}`);
        } catch (e: any) {
            console.log(`   ⚠️ Price Update Skipped/Failed: ${e.message.slice(0, 100)}`);
            results.push({ name: "Paymaster DVT Price Update", status: "skipped/failed" });
        }

        // 5. Approve SuperPaymaster (Required for Gasless)
        const spAddress = config.superPaymaster as `0x${string}`;
        console.log(`   🔎 Checking Allowance for SP: ${spAddress} on Token: ${config.aPNTs}`);
        const allowance = await PUBLIC_CLIENT.readContract({
            address: config.aPNTs as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [target as `0x${string}`, spAddress]
        });
        console.log(`   🔎 Current Allowance: ${formatEther(allowance)} aPNTs`);

        if (allowance < parseEther('500') && ownerKey) {
             const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
             const ownerClient = createWalletClient({ account: ownerAccount, chain: sepolia, transport: http(RPC_URL) });
             
             const approveData = encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [spAddress, parseEther('1000')]
            });
            const execApproveData = encodeFunctionData({
                abi: ACCOUNT_ABI,
                functionName: 'execute',
                args: [config.aPNTs as `0x${string}`, 0n, approveData]
            });
            
            const spApproveHash = await ownerClient.sendTransaction({
                to: target as `0x${string}`,
                data: execApproveData
            });
            await PUBLIC_CLIENT.waitForTransactionReceipt({ hash: spApproveHash });
            results.push({ name: "SuperPaymaster Approval", tx: spApproveHash, status: "success" });
            console.log(`   ✅ SuperPaymaster Approved: ${spApproveHash}`);
        }

        res.json({ success: true, results });
    } catch (error: any) {
        console.error(`   ❌ Faucet Error: ${error.message}`);
        res.status(500).json({ error: error.message, results });
    }
});

const PORT = 3002;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚰 Faucet Admin: ${adminAccount.address}`);
    console.log(`🚀 Faucet running at http://localhost:${PORT}`);
});
