import express from 'express';
import cors from 'cors';

import { 
    createPublicClient, 
    http, 
    createWalletClient, 
    parseEther, 
    formatEther,
    encodeFunctionData
} from 'viem';
import { 
    KeyManager, 
    createEndUserClient 
} from '@aastar/sdk';
import { SepoliaFaucetAPI } from '@aastar/core';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.sepolia') });

const app = express();
app.use(cors());
app.use(express.json());

// Load contract addresses from aastar-sdk
const CONFIG_PATH = path.resolve(__dirname, '../../aastar-sdk/config.sepolia.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const PUBLIC_CLIENT = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL)
});

// Admin/Supplier key for funding
const ADMIN_KEY = process.env.PRIVATE_KEY_ANNI || process.env.ADMIN_KEY || process.env.PRIVATE_KEY_SUPPLIER;
if (!ADMIN_KEY) {
    console.error("Missing ADMIN_KEY or PRIVATE_KEY_ANNI in .env.sepolia");
    process.exit(1);
}
const adminAccount = privateKeyToAccount(ADMIN_KEY as `0x${string}`);
const adminWallet = createWalletClient({
    account: adminAccount,
    chain: sepolia,
    transport: http(RPC_URL)
});

let demoState = {
    step: 0,
    userAddress: '',
    aaAddress: '',
    txHash: '',
    logs: [] as string[]
};

function addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    demoState.logs.push(`[${timestamp}] ${msg}`);
    console.log(msg);
}

app.get('/api/state', (req, res) => res.json(demoState));

app.post('/api/run-demo', async (req, res) => {
    try {
        demoState = { step: 0, userAddress: '', aaAddress: '', txHash: '', logs: [] };
        addLog("🚀 Starting Gasless Demo Journey...");

        // Step 3: Account Generation
        addLog("Step 3: Generating new test EOA account...");
        const keyPair = KeyManager.generateKeyPair();
        demoState.userAddress = keyPair.address;
        addLog(`New EOA: ${demoState.userAddress}`);

        // Step 4: Environment Preparation (Faucet)
        addLog("Step 4: Preparing environment (Funding ETH and Tokens)...");
        // We use SepoliaFaucetAPI to ensure the AA account is ready.
        // First, calculate the potential AA address
        const userClient = createEndUserClient({
            account: privateKeyToAccount(keyPair.privateKey as `0x${string}`),
            chain: sepolia,
            transport: http(RPC_URL),
            contracts: config
        });
        const { accountAddress } = await userClient.createSmartAccount({ owner: keyPair.address });
        demoState.aaAddress = accountAddress;
        addLog(`Predicted AA Address: ${accountAddress}`);


        addLog("Step 4.1: Checking Registry and Admin state...");
        try {
            const stakingAddr = await PUBLIC_CLIENT.readContract({
                address: config.registry,
                abi: [{ type: 'function', name: 'GTOKEN_STAKING', inputs: [], outputs: [{ type: 'address' }] }],
                functionName: 'GTOKEN_STAKING'
            });
            addLog(`Registry GTOKEN_STAKING: ${stakingAddr}`);

            const gTokenBal = await PUBLIC_CLIENT.readContract({
                address: config.aPNTs,
                abi: [{ type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
                functionName: 'balanceOf',
                args: [adminAccount.address]
            });
            addLog(`Admin (Sponsor) aPNTs Balance: ${formatEther(gTokenBal as bigint)}`);
        } catch (diagErr: any) {
            addLog(`⚠️ Diagnostic Error: ${diagErr.message}`);
        }

        addLog("Calling SepoliaFaucetAPI.prepareTestAccount...");

        await SepoliaFaucetAPI.prepareTestAccount(
            adminWallet,
            PUBLIC_CLIENT,
            {
                targetAA: accountAddress,

                token: config.aPNTs, // Using aPNTs as the default token
                registry: config.registry,
                tokenAmount: parseEther('100')
            }
        );
        addLog("Environment ready! AA account is funded and registered.");

        // Step 5: Gasless Transaction
        addLog("Step 5: Executing Gasless Transaction via SuperPaymaster...");
        // Jason's EOA as dummy recipient
        const recipient = '0x1234567890123456789012345678901234567890'; 
        
        // Use the high-level executeGasless API
        const txHash = await userClient.executeGasless({
            target: config.aPNTs, // Transfer aPNTs
            data: encodeFunctionData({
                abi: [{
                    name: 'transfer',
                    type: 'function',
                    inputs: [
                        { name: 'recipient', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                    ],
                    outputs: [{ type: 'bool' }]
                }],
                args: [recipient, parseEther('1')]
            }),
            operator: adminAccount.address // Admin acts as operator for this demo
        });

        demoState.txHash = txHash;
        demoState.step = 5;
        addLog(`✅ Gasless Transaction Successful! Hash: ${txHash}`);
        addLog(`View on Etherscan: https://sepolia.etherscan.io/tx/${txHash}`);

        res.json({ success: true, txHash });
    } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve frontend (to be created)
const PUBLIC_DIR = path.resolve('demo_public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
app.use(express.static(PUBLIC_DIR));

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Gasless Demo Server running at http://localhost:${PORT}`);
});
