import express from 'express';
import cors from 'cors';
import { 
    createPublicClient, 
    http, 
    createWalletClient, 
    parseEther, 
    encodeFunctionData
} from 'viem';
import { 
    KeyManager, 
    createEndUserClient 
} from '@aastar/sdk';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const PUBLIC_CLIENT = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
    pollingInterval: 4_000 // Slow it down to avoid rate limits and wait longer
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

app.get('/api/config', (req, res) => {
    res.json({
        faucetUrl: process.env.FAUCET_URL || 'http://localhost:3002/faucet'
    });
});

const ACCOUNTS_FILE = path.join(__dirname, 'generated_accounts.json');

app.post('/api/generate-account', async (req, res) => {
    try {
        const { forceNew } = req.body;
        demoState = { step: 1, userAddress: '', aaAddress: '', txHash: '', logs: [] };
        addLog("Step 1: Getting test account...");

        let accounts: any[] = [];
        if (fs.existsSync(ACCOUNTS_FILE)) {
            try {
                accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
            } catch (e) {
                console.error("Error reading accounts file:", e);
                accounts = [];
            }
        }

        // Strategy: 80% chance to reuse an existing account (if available) to save funds.
        // Unless forceNew is requested.
        const shouldReuse = !forceNew && accounts.length > 0 && Math.random() < 0.8;

        if (shouldReuse) {
            const acc = accounts[Math.floor(Math.random() * accounts.length)];
            addLog("♻️ Loaded existing account (saving funds!)");
            demoState.userAddress = acc.userAddress;
            demoState.aaAddress = acc.aaAddress;
            addLog(`EOA: ${demoState.userAddress}`);
            addLog(`AA: ${demoState.aaAddress}`);
            return res.json({ success: true, ...acc });
        }

        addLog("🆕 Generating FRESH account...");
        const keyPair = KeyManager.generateKeyPair();
        demoState.userAddress = keyPair.address;
        
        // Use a dummy client to calculate AA address
        const userClient = createEndUserClient({
            transport: http(RPC_URL),
            chain: sepolia,
            account: privateKeyToAccount(keyPair.privateKey as `0x${string}`),
            addresses: config
        });
        
        const { accountAddress } = await userClient.createSmartAccount({ owner: keyPair.address });
        demoState.aaAddress = accountAddress;
        
        addLog(`EOA: ${demoState.userAddress}`);
        addLog(`AA: ${demoState.aaAddress}`);

        // Save to file
        const newAccount = {
            userAddress: demoState.userAddress,
            aaAddress: demoState.aaAddress,
            privateKey: keyPair.privateKey
        };
        accounts.push(newAccount);
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

        res.json({ success: true, ...newAccount });
    } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/fund', async (req, res) => {
    const { aaAddress, ownerKey } = req.body;
    if (!aaAddress || !ownerKey) return res.status(400).json({ error: "Missing address or key" });

    try {
        addLog(`Step 2: Requesting L4 Onboarding for ${aaAddress}...`);
        
        const FAUCET_URL = process.env.FAUCET_URL || 'http://localhost:3002/faucet';
        const FAUCET_SECRET = process.env.FAUCET_SECRET || '';

        addLog(`   🔗 Faucet Request: POST ${FAUCET_URL}`);
        const body = { target: aaAddress, ownerKey };
        console.log("➡️ Faucet Body:", JSON.stringify(body));

        const headers: any = { 'Content-Type': 'application/json' };
        if (FAUCET_SECRET) {
            headers['Authorization'] = `Bearer ${FAUCET_SECRET}`;
            console.log("🔑 Auth: Bearer [HIDDEN]");
        }

        const faucetRes = await fetch(FAUCET_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ target: aaAddress, ownerKey })
        });
        
        const data: any = await faucetRes.json();
        if (data.success) {
            addLog("✅ Onboarding & Funding Success!");
            demoState.step = 2;
            res.json({ success: true, results: data.results });
        } else {
            addLog(`❌ Faucet Error: ${data.error}`);
            res.status(500).json({ error: data.error });
        }
    } catch (error: any) {
        addLog(`❌ Connection Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/run-test', async (req, res) => {
    const { privateKey } = req.body;
    if (!privateKey) return res.status(400).json({ error: "Missing private key" });

    try {
        addLog("Step 3: Running Gasless Transaction...");
        const userAccount = privateKeyToAccount(privateKey as `0x${string}`);
        const userClient = createEndUserClient({
            transport: http(RPC_URL),
            chain: sepolia,
            account: userAccount,
            addresses: config
        });

        // Use Anni's community/operator as verified in full flow
        const anniOp = state.operators.anni;
        const txHash = await userClient.executeGasless({
            target: config.aPNTs, // Transfer aPNTs (Corrected casing)
            data: encodeFunctionData({
                abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'val', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
                functionName: 'transfer',
                args: [anniOp.address, parseEther('1')] // Send 1 aPNTs back to Anni's op
            }),
            operator: anniOp.address
        });

        demoState.txHash = txHash;
        demoState.step = 3;
        addLog(`✅ Gasless Successful! Hash: ${txHash}`);
        
        const details = {
            sender: demoState.aaAddress,
            recipient: anniOp.address,
            amount: "1.0",
            symbol: "aPNTs",
            tokenAddress: config.aPNTs,
            txHash
        };

        // Persist Transaction to History
        try {
            if (fs.existsSync(ACCOUNTS_FILE)) {
                const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
                const accountIndex = accounts.findIndex((a: any) => a.aaAddress.toLowerCase() === demoState.aaAddress.toLowerCase());
                
                if (accountIndex !== -1) {
                    if (!accounts[accountIndex].transactions) {
                        accounts[accountIndex].transactions = [];
                    }
                    accounts[accountIndex].transactions.push({
                        hash: txHash,
                        timestamp: new Date().toISOString(),
                        type: 'Gasless aPNTs Transfer',
                        etherscan: `https://sepolia.etherscan.io/tx/${txHash}`
                    });
                    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
                    addLog("💾 Transaction saved to account history.");
                }
            }
        } catch (e: any) {
            console.error("Failed to persist transaction:", e);
        }
        
        res.json({ success: true, details });
    } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

const PUBLIC_DIR = path.resolve('demo_public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
app.use(express.static(PUBLIC_DIR));

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🎮 Demo UI Server running at http://localhost:${PORT}`);
});
