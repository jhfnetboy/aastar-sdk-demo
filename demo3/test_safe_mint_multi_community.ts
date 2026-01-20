import { createPublicClient, createWalletClient, http, parseAbi, encodeAbiParameters, parseAbiParameters, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.sepolia') });

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
const USER4_KEY = process.env.USER4_PRIVATE_KEY as Hex;
const REGISTRY_ADDR = process.env.REGISTRY_ADDR as Hex;
const COMMUNITY_B = '0x021ccDEED21A8ea540017188fB6D9a3BAaDc8C40' as Hex; // BreadDAO

if (!USER4_KEY || !REGISTRY_ADDR) {
    console.error('❌ Missing required env vars');
    process.exit(1);
}

const RegistryABI = parseAbi([
    'function safeMintForRole(bytes32 roleId, address user, bytes data) returns (uint256 tokenId)'
]);

const ENDUSER_ROLE_ID = '0x0c34ecc75d3bf122e0609d2576e167f53fb42429262ce8c9b33cab91ff670e3a' as Hex;

async function main() {
    const account = privateKeyToAccount(USER4_KEY);
    const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
    
    console.log(`\n🧪 测试 Registry.safeMintForRole 添加第二个社区`);
    console.log(`User: ${account.address}`);
    console.log(`Target Community: ${COMMUNITY_B}\n`);
    
    // 构造 roleData（参考 RoleDataFactory.endUser）
    // struct EndUserData { address account; address community; string avatarURI; string ensName; uint256 stakeAmount; }
    const roleData = encodeAbiParameters(
        parseAbiParameters('address account, address community, string avatarURI, string ensName, uint256 stakeAmount'),
        [account.address, COMMUNITY_B, '', '', 0n]
    );
    
    console.log(`📦 Encoded roleData: ${roleData.slice(0, 66)}...`);
    
    try {
        console.log(`\n🚀 Calling safeMintForRole...`);
        const tx = await walletClient.writeContract({
            address: REGISTRY_ADDR,
            abi: RegistryABI,
            functionName: 'safeMintForRole',
            args: [ENDUSER_ROLE_ID, account.address, roleData]
        });
        
        console.log(`✅ Transaction sent: ${tx}`);
        console.log(`\n⏳ Waiting for confirmation...`);
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
        console.log(`✅ Transaction confirmed! Status: ${receipt.status}`);
        
        console.log(`\n📊 请运行以下命令验证结果:`);
        console.log(`   npx tsx debug_sbt_memberships.ts ${account.address}`);
        console.log(`\n如果成功，应该看到 2 个 memberships！`);
        
    } catch (e: any) {
        console.error(`\n❌ 失败:`, e.shortMessage || e.message || e);
        
        if (e.message?.includes('RoleAlreadyGranted')) {
            console.log(`\n⚠️  结论：safeMintForRole 也会检查 RoleAlreadyGranted`);
            console.log(`   → 这不是多社区注册的正确 API`);
        } else if (e.message?.includes('AccessControl') || e.message?.includes('Ownable')) {
            console.log(`\n⚠️  结论：safeMintForRole 有权限限制`);
            console.log(`   → 可能只允许特定角色（如 Community Admin）调用`);
        } else if (e.message?.includes('OnlyRegistry')) {
            console.log(`\n⚠️  结论：safeMintForRole 只能由 Registry 内部调用`);
        } else {
            console.log(`\n❓ 未知错误，详细信息:`);
            console.log(JSON.stringify(e, null, 2));
        }
        
        process.exit(1);
    }
}

main();
