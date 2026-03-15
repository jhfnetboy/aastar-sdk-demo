// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceToken
 * @notice ERC20 token with governance capabilities for the Custom Sale Contract ecosystem
 * @dev Extends ERC20 with voting, permit, and ownership features
 *
 * Design Approach:
 * - Core implementation based on OpenZeppelin ERC20Votes standard
 * - Interface design references SuperPaymaster GToken and GTokenStaking contracts
 * - Future staking integration will follow IGTokenStakingV3 interface pattern
 *
 * Token Distribution:
 * - 20% (4,200,000 tokens): Sale Contract (for fair launch and initial funding)
 * - 20% (4,200,000 tokens): HyperCapital Company (for commercial investment and alignment)
 * - 60% (12,600,000 tokens): Community Treasury (for users and ecosystem contributors)
 *
 * Total Supply: 21,000,000 tokens
 *
 * Reference Contracts:
 * - GTokenStaking: https://vscode.dev/github/AAStarCommunity/SuperPaymaster/blob/stable-v2/contracts/src/paymasters/v3/core/GTokenStaking.sol
 * - IGTokenStakingV3: https://vscode.dev/github/AAStarCommunity/SuperPaymaster/blob/stable-v2/contracts/src/paymasters/v3/interfaces/IGTokenStakingV3.sol
 */
contract GovernanceToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    // Token constants
    uint256 public constant TOTAL_SUPPLY = 21_000_000 * 10**18; // 21 million tokens
    uint256 public constant SALE_CONTRACT_ALLOCATION = TOTAL_SUPPLY * 20 / 100; // 20%
    uint256 public constant HYPERCAPITAL_ALLOCATION = TOTAL_SUPPLY * 20 / 100; // 20%
    uint256 public constant COMMUNITY_TREASURY_ALLOCATION = TOTAL_SUPPLY * 60 / 100; // 60%

    // Allocation addresses (set during initialization)
    address public saleContract;
    address public hyperCapitalWallet;
    address public communityTreasury;

    // Initialization flag
    bool public initialized;

    // Events
    event TokenInitialized(
        address indexed saleContract,
        address indexed hyperCapitalWallet,
        address indexed communityTreasury
    );

    /**
     * @notice Constructor
     * @param name Token name
     * @param symbol Token symbol
     * @param initialOwner Initial owner of the contract
     */
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    )
        ERC20(name, symbol)
        ERC20Permit(name)
        Ownable(initialOwner)
    {}

    /**
     * @notice Initialize token distribution
     * @dev Can only be called once by the owner
     * @param _saleContract Address of the sale contract
     * @param _hyperCapitalWallet Address for HyperCapital company allocation
     * @param _communityTreasury Address for community treasury
     */
    function initializeDistribution(
        address _saleContract,
        address _hyperCapitalWallet,
        address _communityTreasury
    ) external onlyOwner {
        require(!initialized, "GovernanceToken: already initialized");
        require(_saleContract != address(0), "GovernanceToken: invalid sale contract address");
        require(_hyperCapitalWallet != address(0), "GovernanceToken: invalid hypercapital wallet");
        require(_communityTreasury != address(0), "GovernanceToken: invalid community treasury");

        // Set allocation addresses
        saleContract = _saleContract;
        hyperCapitalWallet = _hyperCapitalWallet;
        communityTreasury = _communityTreasury;

        // Mint tokens according to allocation
        _mint(_saleContract, SALE_CONTRACT_ALLOCATION);
        _mint(_hyperCapitalWallet, HYPERCAPITAL_ALLOCATION);
        _mint(_communityTreasury, COMMUNITY_TREASURY_ALLOCATION);

        initialized = true;

        emit TokenInitialized(_saleContract, _hyperCapitalWallet, _communityTreasury);
    }

    /**
     * @notice Get allocation details
     * @return _saleContract Sale contract address
     * @return _hyperCapitalWallet HyperCapital wallet address
     * @return _communityTreasury Community treasury address
     * @return _saleAllocation Sale contract token allocation
     * @return _hyperCapitalAllocation HyperCapital token allocation
     * @return _communityAllocation Community treasury token allocation
     */
    function getAllocations() external view returns (
        address _saleContract,
        address _hyperCapitalWallet,
        address _communityTreasury,
        uint256 _saleAllocation,
        uint256 _hyperCapitalAllocation,
        uint256 _communityAllocation
    ) {
        return (
            saleContract,
            hyperCapitalWallet,
            communityTreasury,
            SALE_CONTRACT_ALLOCATION,
            HYPERCAPITAL_ALLOCATION,
            COMMUNITY_TREASURY_ALLOCATION
        );
    }

    /**
     * @notice Check if token distribution has been initialized
     * @return True if initialized, false otherwise
     */
    function isInitialized() external view returns (bool) {
        return initialized;
    }

    // The following functions are overrides required by Solidity.

    /**
     * @dev Override required by ERC20Votes
     */
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    /**
     * @dev Override required by ERC20Permit
     */
    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
