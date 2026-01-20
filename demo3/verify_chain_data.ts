import { createPublicClient, http, hexToString, decodeAbiParameters, parseAbiItem, type Address, type Hex, erc20Abi } from 'viem';
import { sepolia } from 'viem/chains';
import { RegistryABI } from '@aastar/core';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL;
const REGISTRY_ADDR = process.env.REGISTRY_ADDR as Address;
const XPNTS_FACTORY_ADDR = process.env.XPNTS_FACTORY_ADDR as Address;

// 简单的解码函数，复制自 RoleDataFactory 以确保独立性
function decodeCommunityMetadata(data: Hex) {
    if (!data || data === '0x') return { name: 'No Metadata' };
    try {
        const decoded = decodeAbiParameters(
            [{
                type: 'tuple',
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'ensName', type: 'string' },
                    { name: 'website', type: 'string' },
                    { name: 'description', type: 'string' },
                    { name: 'logoURI', type: 'string' },
                    { name: 'stakeAmount', type: 'uint256' }
                ]
            }],
            data
        );
        const result = decoded[0] as any;
        if (Array.isArray(result)) {
             return { name: result[0], description: result[3] };
        } else {
             return { name: result.name, description: result.description };
        }
    } catch (e) {
        return { name: `Decode Error: ${(e as Error).message}` };
    }
}

async function main() {
    console.log("🔍 Starting Chain Data Verification...");
    console.log(`📡 RPC: ${RPC_URL}`);
    console.log(`📜 Registry: ${REGISTRY_ADDR}`);

    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

    // 1. 获取所有 Community 角色成员
    console.log("\n1️⃣  Fetching Community Role Members...");
    // RoleIds.COMMUNITY (keccak256("COMMUNITY"))
    // 0xe94d78b6d8fb99b2c21131eb4552924a60f564d8515a3cc90ef300fc9735c074
    const COMMUNITY_ROLE = '0xe94d78b6d8fb99b2c21131eb4552924a60f564d8515a3cc90ef300fc9735c074';
    
    let members: Address[] = [];
    try {
        members = await publicClient.readContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'getRoleMembers',
            args: [COMMUNITY_ROLE]
        }) as Address[];
    } catch (e) {
        console.error("❌ Failed to fetch role members:", e);
        return;
    }

    console.log(`✅ Found ${members.length} communities on-chain.\n`);

    // 2. 遍历每个社区获取详细信息
    console.log("2️⃣  Fetching Details for Each Community...");
    
    // xPNTs Factory ABI for getting token
    const factoryAbi = [
        parseAbiItem('function getTokenAddress(address community) view returns (address)')
    ];

    for (const [index, address] of members.entries()) {
        console.log(`\n--- Community #${index + 1}: ${address} ---`);
        
        // A. 获取元数据
        let metadata: Hex = '0x';
        try {
            metadata = await publicClient.readContract({
                address: REGISTRY_ADDR,
                abi: RegistryABI,
                functionName: 'roleMetadata',
                args: [COMMUNITY_ROLE, address]
            }) as Hex;
        } catch (e) {
            console.warn(`   ⚠️ Failed to fetch metadata: ${(e as Error).message}`);
        }

        const info = decodeCommunityMetadata(metadata);
        console.log(`   📝 Name: ${info.name}`);
        if(info.description) console.log(`   📄 Desc: ${info.description}`);

        // B. 获取 Token 地址
        let tokenAddr = '0x0000000000000000000000000000000000000000';
        try {
            tokenAddr = await publicClient.readContract({
                address: XPNTS_FACTORY_ADDR,
                abi: factoryAbi,
                functionName: 'getTokenAddress',
                args: [address]
            }) as string;
        } catch (e) {
            console.warn(`   ⚠️ Failed to fetch token address: ${(e as Error).message}`);
        }

        if (tokenAddr !== '0x0000000000000000000000000000000000000000') {
            console.log(`   🪙 Token: ${tokenAddr}`);
            // 可以尝试获取 Token 的 Name/Symbol
            try {
                const symbol = await publicClient.readContract({
                    address: tokenAddr as Address,
                    abi: erc20Abi,
                    functionName: 'symbol'
                });
                console.log(`      Symbol: ${symbol}`);
            } catch {}
        } else {
            console.log(`   ❌ No Token Deployed`);
        }
    }
    console.log("\n✅ Verification Done.");

    // 3. 诊断 Alice 状态
    console.log("\n3️⃣  Diagnosing Alice's Status...");
    const ALICE_ADDR = '0xB6D31d6Af6B171BA5ACb6D45416a6aC39149F7BD';
    const hasRole = await publicClient.readContract({
        address: REGISTRY_ADDR,
        abi: RegistryABI,
        functionName: 'hasRole',
        args: [COMMUNITY_ROLE, ALICE_ADDR]
    });
    console.log(`   👤 Alice (${ALICE_ADDR}): hasRole = ${hasRole}`);
    
    const isInList = members.map(m => m.toLowerCase()).includes(ALICE_ADDR.toLowerCase());
    console.log(`   📋 Alice in getRoleMembers list? ${isInList}`);
    
    if (hasRole && !isInList) {
        console.error("   🚨 CRITICAL INCONSISTENCY: Alice has role but is NOT in member list!");
        console.error("      This implies an issue with AccessControlEnumerable logic in the Registry contract,");
        console.error("      or the list is corrupted/desynchronized.");
    }
}

main().catch(console.error);
