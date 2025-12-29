import { keccak256, toBytes } from 'viem';

const errors = [
    // Standard
    'InvalidParameter(string)',
    'RoleNotConfigured(bytes32,bool)', // Note: Registry.sol defines this as (bytes32,bool)
    'RoleAlreadyGranted(bytes32,address)',
    'RoleNotGranted(bytes32,address)',
    'InsufficientStake(uint256,uint256)',
    
    // GTokenStaking (Hypothetical & Common)
    'StakeAlreadyExists(address,bytes32)',
    'InsufficientAllowance(uint256,uint256)',
    'InsufficientBalance(uint256,uint256)',
    'TransferFailed()',
    'StakeNotFound()',

    // MySBT
    'TokenIdAlreadyMinted(uint256)',
    'AlreadyMinted(address,bytes32)',
    'SBT_AlreadyExists()',

    // Generic
    'Unauthorized()',
    'NotFound()',
    'AlreadyExists()',
    
    // Paymaster
    'PaymasterNotFound(address)',
    
    // OpenZeppelin / Standard
    'ERC20InsufficientBalance(address,uint256,uint256)',
    'ERC20InvalidSender(address)',
    'ERC20InvalidReceiver(address)',
    'ERC20InsufficientAllowance(address,uint256,uint256)',
    'ERC20InvalidApprover(address)',
    'ERC20InvalidSpender(address)',

    // AccessControl
    'AccessControlUnauthorizedAccount(address,bytes32)',

    // SafeERC20
    'SafeERC20FailedOperation(address)',
    
    // Custom Guesses based on functionality
    'RoleMemberLimitReached(bytes32)',
    'NameAlreadyRegistered(string)',
    'ENSAlreadyRegistered(string)'
];

console.log('--- Error Signatures Round 2 ---');
errors.forEach(err => {
    const hash = keccak256(toBytes(err));
    const selector = hash.slice(0, 10);
    // console.log(`${selector} : ${err}`);
    if (selector.toLowerCase() === '0xfb8f41b2') {
        console.log(`FOUND IT! 0xfb8f41b2 is: ${err}`);
    }
});
console.log('Done scanning.');
