// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SaleContract
 * @author Mycelium Protocol
 * @notice This contract manages the initial sale of GToken.
 * It uses a multi-stage linear price curve to sell a fixed supply of tokens.
 * Access is controlled by an off-chain whitelist mechanism via EIP-712 signatures.
 */
contract SaleContract is Ownable, ReentrancyGuard {
    using SafeERC20 for ERC20;

    // =============================================================
    //                           STATE
    // =============================================================

    ERC20 public immutable gToken;
    address public treasury;

    uint256 public tokensSold;
    uint256 public immutable totalTokensForSale;

    // Mapping to prevent a user from buying more than once
    mapping(address => bool) public hasBought;

    // Off-chain signature verifier address
    address public whitelistVerifier;

    // --- Slope-Driven Price Curve Parameters ---
    uint256 public constant PRECISION = 1e36;
    uint256 public constant INITIAL_PRICE_USD = 1_000_000; // $1.00

    // Price increase amounts in USD (6 decimals) per 10,000 GTokens (1e18 decimals)
    uint256 public constant STAGE1_PRICE_INCREASE_PER_10K = 25_000;   // $0.025 per 10k tokens
    uint256 public constant STAGE2_PRICE_INCREASE_PER_10K = 50_000;   // $0.05 per 10k tokens
    uint256 public constant STAGE3_PRICE_INCREASE_PER_10K = 30_000;   // $0.03 per 10k tokens

    // These thresholds define the token sale stages.
    uint256 public constant STAGE1_TOKEN_LIMIT = 210_000 * 1e18;
    uint256 public constant STAGE2_TOKEN_LIMIT = 630_000 * 1e18; // 210k + 420k
    uint256 public constant TOTAL_TOKEN_LIMIT = 1_050_000 * 1e18; // Stage 1 + 2 + 3

    // Calculate base prices directly without divide-before-multiply pattern
    // Formula: base_price = initial_price + (token_limit / 10_000) * price_increase_per_10k
    uint256 public constant STAGE2_BASE_PRICE_USD = INITIAL_PRICE_USD + (STAGE1_TOKEN_LIMIT / 10_000 / 1e18) * STAGE1_PRICE_INCREASE_PER_10K;
    uint256 public constant STAGE3_BASE_PRICE_USD = STAGE2_BASE_PRICE_USD + ((STAGE2_TOKEN_LIMIT - STAGE1_TOKEN_LIMIT) / 10_000 / 1e18) * STAGE2_PRICE_INCREASE_PER_10K;
    uint256 public constant CEILING_PRICE_USD = STAGE3_BASE_PRICE_USD + ((TOTAL_TOKEN_LIMIT - STAGE2_TOKEN_LIMIT) / 10_000 / 1e18) * STAGE3_PRICE_INCREASE_PER_10K;

    // =============================================================
    //                          EVENTS
    // =============================================================

    event TokensPurchased(address indexed buyer, uint256 gTokenAmount, uint256 usdValue);
    event WhitelistVerifierUpdated(address indexed newVerifier);
    event TreasuryUpdated(address indexed newTreasury);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address _gTokenAddress, address _initialTreasury, address _initialOwner) Ownable(_initialOwner) {
        require(_gTokenAddress != address(0), "Zero address");
        require(_initialTreasury != address(0), "Zero address");
        gToken = ERC20(_gTokenAddress);
        treasury = _initialTreasury;
        totalTokensForSale = TOTAL_TOKEN_LIMIT;
    }

    // =============================================================
    //                      PRICE CALCULATION
    // =============================================================

    /**
     * @notice Calculates the current price of one GToken in USD (with 6 decimals).
     */
    function getCurrentPriceUSD() public view returns (uint256) {
        uint256 sold = tokensSold;

        if (sold >= TOTAL_TOKEN_LIMIT) {
            return CEILING_PRICE_USD; // Return calculated ceiling price
        }

        if (sold < STAGE1_TOKEN_LIMIT) {
            // Calculate price increase: (sold / 10_000 / 1e18) * STAGE1_PRICE_INCREASE_PER_10K
            return INITIAL_PRICE_USD + (sold / 10_000 / 1e18) * STAGE1_PRICE_INCREASE_PER_10K;
        } else if (sold < STAGE2_TOKEN_LIMIT) {
            uint256 soldInStage2 = sold - STAGE1_TOKEN_LIMIT;
            // Calculate price increase in stage 2
            return STAGE2_BASE_PRICE_USD + (soldInStage2 / 10_000 / 1e18) * STAGE2_PRICE_INCREASE_PER_10K;
        } else {
            uint256 soldInStage3 = sold - STAGE2_TOKEN_LIMIT;
            // Calculate price increase in stage 3
            return STAGE3_BASE_PRICE_USD + (soldInStage3 / 10_000 / 1e18) * STAGE3_PRICE_INCREASE_PER_10K;
        }
    }

    // =============================================================
    //                       PURCHASE LOGIC
    // =============================================================

    /**
     * @notice Main function to purchase GTokens.
     * @param usdAmount The amount in USD (with 6 decimals) the user wants to spend.
     * @param paymentToken The address of the ERC20 token to pay with (e.g., USDC, USDT, WBTC).
     * @param signature The EIP-712 signature for whitelist verification (currently unused).
     *
     * TODO: Implement the full logic for the function.
     */
    function buyTokens(uint256 usdAmount, address paymentToken, bytes calldata signature)
        external
        payable
        nonReentrant
    {
        // 1. Check if sale is active and has not ended
        require(tokensSold < totalTokensForSale, "Sale has ended");

        // 2. Check against multiple buys
        require(!hasBought[msg.sender], "Address has already bought tokens");

        // 3. Verify the signature from the off-chain service
        // TODO: Implement EIP-712 signature verification.
        // The signature should verify the buyer (msg.sender) and the max USD amount they are allowed to spend.
        // require(verifySignature(msg.sender, usdAmount, signature), "Invalid signature");

        // 4. Calculate GToken amount to be received
        // TODO: For simplicity, this example uses current price. A real implementation
        // should integrate over the curve for large purchases.
        uint256 currentPrice = getCurrentPriceUSD();
        uint256 gTokenAmount = (usdAmount * 1e18) / currentPrice;
        require(tokensSold + gTokenAmount <= totalTokensForSale, "Purchase exceeds available tokens");

        // 5. Handle payment
        // TODO: Use a Chainlink price feed to convert usdAmount to the equivalent
        // amount of paymentToken. For this example, we assume paymentToken is USDC (6 decimals) and 1:1 with USD.
        ERC20 paymentERC20 = ERC20(paymentToken);
        paymentERC20.safeTransferFrom(msg.sender, treasury, usdAmount);

        // 6. Update state
        tokensSold += gTokenAmount;
        hasBought[msg.sender] = true;

        // 7. Transfer GTokens
        gToken.safeTransfer(msg.sender, gTokenAmount);

        emit TokensPurchased(msg.sender, gTokenAmount, usdAmount);
    }


    // =============================================================
    //                        ADMIN FUNCTIONS
    // =============================================================

    function setWhitelistVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "Zero address");
        whitelistVerifier = newVerifier;
        emit WhitelistVerifierUpdated(newVerifier);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Zero address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @notice Withdraw any accumulated ETH to the treasury.
     */
    function withdrawEther() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = treasury.call{value: balance}("");
            require(success, "Ether transfer failed");
        }
    }

    /**
     * @notice In case any GTokens remain unsold after the sale period,
     * the owner can withdraw them back to the treasury.
     */
    function withdrawUnsoldTokens() external onlyOwner {
        uint256 remaining = gToken.balanceOf(address(this));
        if (remaining > 0) {
            gToken.safeTransfer(treasury, remaining);
        }
    }
}
