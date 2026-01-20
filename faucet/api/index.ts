// @ts-nocheck
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

// Load env
if (fs.existsSync(path.join(__dirname, '../.env'))) {
    dotenv.config({ path: path.join(__dirname, '../.env') });
}

const app = express();
app.use(cors());
app.use(express.json());

// --- Authentication Middleware ---
const FAUCET_SECRET = process.env.FAUCET_SECRET;

app.use((req, res, next) => {
    // Public Endpoint: Root (Instructions)
    if (req.path === '/' || req.path === '/api') return next();

    // If Secret is set, enforce it
    if (FAUCET_SECRET) {
        const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
        const token = (authHeader as string)?.replace('Bearer ', '').trim();
        
        if (!token || token !== FAUCET_SECRET) {
            console.warn(`⚠️  Unauthorized access attempt.`);
            return res.status(401).json({ error: 'Unauthorized: Missing or Invalid Faucet Secret' });
        }
    }
    next();
});

// --- Configuration ---
const CONFIG_PATH = path.join(process.cwd(), 'config.sepolia.json');
let fileConfig: any = {};
try {
    if (fs.existsSync(CONFIG_PATH)) {
        fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
} catch (e) {
    console.error("❌ Failed to load config:", e);
}

// Merge Config: Env Vars > File Config
const config = {
    registry: process.env.REGISTRY_ADDR || fileConfig.registry,
    staking: process.env.STAKING_ADDR || fileConfig.staking,
    superPaymaster: process.env.SUPER_PAYMASTER || fileConfig.superPaymaster,
    gToken: process.env.GTOKEN_ADDR || fileConfig.gToken,
    xPNTsFactory: process.env.XPNTS_FACTORY_ADDR || fileConfig.xPNTsFactory,
    paymasterFactory: process.env.PAYMASTER_FACTORY_ADDR || fileConfig.paymasterFactory,
    sbt: process.env.MYSBT_ADDR || fileConfig.sbt,
    simpleAccountFactory: process.env.SIMPLE_ACCOUNT_FACTORY || fileConfig.simpleAccountFactory,
    aPNTs: process.env.APNTS_ADDR || fileConfig.aPNTs || fileConfig.contracts?.aPNTs,
    entryPoint: process.env.ENTRYPOINT_ADDR || fileConfig.entryPoint || '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
};

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const PUBLIC_CLIENT = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

const SUPPLIER_KEY = process.env.PRIVATE_KEY_SUPPLIER || process.env.ADMIN_KEY;
if (!SUPPLIER_KEY) {
    console.error("❌ Missing PRIVATE_KEY_SUPPLIER env var");
}

let adminWallet: any;
if (SUPPLIER_KEY) {
    const adminAccount = privateKeyToAccount(SUPPLIER_KEY as `0x${string}`);
    adminWallet = createWalletClient({
        account: adminAccount,
        chain: sepolia,
        transport: http(RPC_URL)
    });
}

// ... ABIs omitted for brevity ... (Assuming existing ABIs are fine)

// --- Routes ---

app.get('/', (req, res) => {
    // Return HTML Guide
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AAStar Faucet Service</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #f9fafb; color: #111827; }
            h1 { color: #2563eb; }
            code { background: #e5e7eb; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; }
            pre { background: #1f2937; color: #f9fafb; padding: 1rem; border-radius: 8px; overflow-x: auto; }
            .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
            .badge-green { background: #d1fae5; color: #065f46; }
            .badge-red { background: #fee2e2; color: #991b1b; }
        </style>
    </head>
    <body>
        <h1>🚰 AAStar Faucet Service</h1>
        <p>Status: <span class="badge ${FAUCET_SECRET ? 'badge-green' : 'badge-red'}">${FAUCET_SECRET ? 'Secured' : 'Public/Insecure'}</span></p>
        <p>This service provides ETH funding and L4-level Account Abstraction onboarding for the AAStar ecosystem.</p>
        
        <h2>🚀 How to Use</h2>
        <p>Send a <strong>POST</strong> request to <code>/faucet</code> endpoint.</p>

        <h3>Request Body</h3>
        <pre>
{
  "target": "0xYourPendingSmartAccountAddress",
  "ownerKey": "0xYourEOAPrivateKey" // Required for full L4 registration/staking
}</pre>

        <h3>Example (cURL)</h3>
        <pre>
curl -X POST ${req.protocol}://${req.get('host')}/faucet \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_FAUCET_SECRET" \\
  -d '{ "target": "0x123...", "ownerKey": "0xabc..." }'</pre>

        <h2>⚙️ Configuration</h2>
        <ul>
            <li><strong>Registry</strong>: <code>${config.registry}</code></li>
            <li><strong>SuperPaymaster</strong>: <code>${config.superPaymaster}</code></li>
            <li><strong>RPC</strong>: Sepolia</li>
        </ul>
        <h2>🛠️ Tech Stack</h2>
        <ul>
            <li><strong>Framework</strong>: Node.js (Vercel Serverless)</li>
            <li><strong>SDK</strong>: @aastar/sdk, @aastar/core</li>
            <li><strong>Blockchain</strong>: Viem (Sepolia)</li>
        </ul>
    </body>
    </html>
    `;
    res.send(html);
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


// --- Routes ---

app.get('/', (req, res) => {
    res.json({
        service: "AAStar Faucet Service",
        status: "Online",
        auth_required: !!FAUCET_SECRET,
        usage: "POST /faucet { target, ownerKey }"
    });
});

app.post('/faucet', async (req, res) => {
    const { target, ownerKey } = req.body;
    if (!target) return res.status(400).json({ error: "Target address required" });
    if (!adminWallet) return res.status(500).json({ error: "Faucet misconfigured (Missing Key)" });

    console.log(`\n🚰 Faucet request for: ${target}`);
    const results: any[] = [];

    try {
        // 1. Fund ETH to AA
        const balance = await PUBLIC_CLIENT.getBalance({ address: target as `0x${string}` });
        if (balance < parseEther('0.01')) {
            const hash = await adminWallet.sendTransaction({ to: target as `0x${string}`, value: parseEther('0.05') });
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

                // ii. Approve Staking
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

                // iii. Register
                // Hardcoded Anni/Community for Demo
                const anni = "0x7F2C6C1BFA354d24B2C8D237731737A494957777"; 
                const roleData = encodeAbiParameters(
                    parseAbiParameters('address acc, address comm, string avatar, string ens, uint256 stake'),
                    [target as `0x${string}`, anni as `0x${string}`, "", "", parseEther('0.3')]
                );
                const regData = encodeFunctionData({
                    abi: REGISTRY_ABI,
                    functionName: 'registerRole',
                    args: [ROLE_ENDUSER as `0x${string}`, target as `0x${string}`, roleData]
                });
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
            } else {
                results.push({ name: "Community Registration", status: "skipped (already member)" });
            }
        }

        // 4. Mint Gas Tokens
        const apntsAddr = config.aPNTs as `0x${string}`;
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
        } else {
            results.push({ name: "Gas Token Minting", status: "skipped (already has balance)" });
        }

        // 4b. Paymaster Deposit
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
        }

        // 4c. Force Price Update (DVT)
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
            results.push({ name: "Paymaster Price Update", tx: upHash, status: "success" });
        } catch (e: any) {
            console.log(`   ⚠️ Price Update Skipped: ${e.message.slice(0, 100)}`);
        }

        // 5. Approve SuperPaymaster
        const spAddress = config.superPaymaster as `0x${string}`;
        const allowance = await PUBLIC_CLIENT.readContract({
            address: config.aPNTs as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [target as `0x${string}`, spAddress]
        });

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
        }

        res.json({ success: true, results });
    } catch (error: any) {
        console.error(`❌ Faucet Internal Error: ${error.message}`);
        res.status(500).json({ error: error.message, results });
    }
});

// Local Development Support
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3002;
    app.listen(PORT, () => {
        console.log(`🚰 Faucet Service running on http://localhost:${PORT}`);
    });
}

// Export for Vercel
export default app;
