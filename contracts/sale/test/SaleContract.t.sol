// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {SaleContract} from "../src/SaleContract.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

// Concrete, mintable ERC20 for testing GToken
contract MockGToken is ERC20 {
    constructor() ERC20("GToken", "GT") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

// Concrete, mintable ERC20 with 6 decimals for testing USDC
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

contract SaleContractTest is Test {
    SaleContract public saleContract;
    MockGToken public gToken;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public verifier = makeAddr("verifier");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    // Constants from SaleContract for easier testing
    uint256 public constant STAGE1_TOKEN_LIMIT = 210_000 * 1e18;
    uint256 public constant STAGE2_TOKEN_LIMIT = 630_000 * 1e18;
    uint256 public constant TOTAL_TOKEN_LIMIT = 1_050_000 * 1e18;

    function setUp() public {
        // Deploy mock tokens
        gToken = new MockGToken();
        usdc = new MockUSDC();

        // Deploy the SaleContract
        vm.startPrank(owner);
        saleContract = new SaleContract(address(gToken), treasury, owner);
        saleContract.setWhitelistVerifier(verifier);
        vm.stopPrank();

        // Fund the sale contract with tokens to sell
        gToken.mint(address(saleContract), TOTAL_TOKEN_LIMIT);

        // Fund users with USDC
        usdc.mint(user1, 1_000_000 * 1e6); // 1M USDC
        usdc.mint(user2, 1_000_000 * 1e6); // 1M USDC
    }

    // =============================================
    // SECTION 1: Initial State & Price Calculation
    // =============================================

    function test_InitialState() public view {
        assertEq(saleContract.owner(), owner);
        assertEq(address(saleContract.gToken()), address(gToken));
        assertEq(saleContract.treasury(), treasury);
        assertEq(saleContract.whitelistVerifier(), verifier);
        assertEq(saleContract.tokensSold(), 0);
        assertEq(gToken.balanceOf(address(saleContract)), TOTAL_TOKEN_LIMIT);
    }

    function test_Price_AtStart() public view {
        assertEq(saleContract.getCurrentPriceUSD(), 1_000_000); // $1.00
    }

    function test_Price_InStage1() public {
        setTokensSold(100_000 * 1e18);
        assertEq(saleContract.getCurrentPriceUSD(), 1_250_000); // Expected: $1.25
    }

    function test_Price_AtBoundary1To2() public {
        setTokensSold(STAGE1_TOKEN_LIMIT);
        assertEq(saleContract.getCurrentPriceUSD(), 1_525_000); // Expected: $1.525
    }

    function test_Price_InStage2() public {
        uint256 soldInStage2 = 50_000 * 1e18;
        setTokensSold(STAGE1_TOKEN_LIMIT + soldInStage2);
        assertEq(saleContract.getCurrentPriceUSD(), 1_775_000); // Expected: $1.775
    }

    function test_Price_AtBoundary2To3() public {
        setTokensSold(STAGE2_TOKEN_LIMIT);
        assertEq(saleContract.getCurrentPriceUSD(), 3_625_000); // Expected: $3.625
    }

    function test_Price_InStage3() public {
        uint256 soldInStage3 = 100_000 * 1e18;
        setTokensSold(STAGE2_TOKEN_LIMIT + soldInStage3);
        assertEq(saleContract.getCurrentPriceUSD(), 3_925_000); // Expected: $3.925
    }

    function test_Price_AtSaleEnd() public {
        setTokensSold(TOTAL_TOKEN_LIMIT);
        assertEq(saleContract.getCurrentPriceUSD(), 4_885_000); // Expected: $4.885
    }

    // =============================================
    // SECTION 2: Purchase Logic
    // =============================================

    function test_BuyTokens_Success_Simple() public {
        uint256 usdAmount = 3000 * 1e6; // $3000
        uint256 expectedGTokenAmount = (usdAmount * 1e18) / saleContract.getCurrentPriceUSD();

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        saleContract.buyTokens(usdAmount, address(usdc), "");
        vm.stopPrank();

        assertEq(saleContract.tokensSold(), expectedGTokenAmount);
        assertEq(gToken.balanceOf(user1), expectedGTokenAmount);
        assertEq(usdc.balanceOf(treasury), usdAmount);
        assertTrue(saleContract.hasBought(user1));
    }

    function test_Revert_When_DoubleBuy() public {
        uint256 usdAmount = 100 * 1e6;

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount * 2);
        saleContract.buyTokens(usdAmount, address(usdc), "");

        vm.expectRevert("Address has already bought tokens");
        saleContract.buyTokens(usdAmount, address(usdc), "");
        vm.stopPrank();
    }

    function test_Revert_When_SaleEnded() public {
        setTokensSold(TOTAL_TOKEN_LIMIT);

        vm.startPrank(user2);
        usdc.approve(address(saleContract), 100 * 1e6);
        vm.expectRevert("Sale has ended");
        saleContract.buyTokens(100 * 1e6, address(usdc), "");
        vm.stopPrank();
    }

    // =============================================
    // SECTION 3: Admin Functions
    // =============================================

    function test_Admin_SetTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(owner);
        saleContract.setTreasury(newTreasury);
        assertEq(saleContract.treasury(), newTreasury);
    }

    function test_Revert_When_NonOwnerSetsTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        saleContract.setTreasury(newTreasury);
    }

    function test_Admin_WithdrawUnsold() public {
        vm.prank(owner);
        saleContract.withdrawUnsoldTokens();

        gToken.mint(address(saleContract), 1000 * 1e18);
        uint256 ownerBalanceBefore = gToken.balanceOf(treasury);

        vm.prank(owner); // Added missing prank
        saleContract.withdrawUnsoldTokens();
        assertEq(gToken.balanceOf(treasury), ownerBalanceBefore + 1000 * 1e18);
    }

    // =============================================
    // SECTION 4: Security Tests (High Priority Fixes)
    // =============================================

    function test_Constructor_ZeroAddressRevert() public {
        vm.expectRevert("Zero address");
        new SaleContract(address(0), treasury, owner);

        vm.expectRevert("Zero address");
        new SaleContract(address(gToken), address(0), owner);
    }

    function test_SetWhitelistVerifier_ZeroAddressRevert() public {
        vm.prank(owner);
        vm.expectRevert("Zero address");
        saleContract.setWhitelistVerifier(address(0));
    }

    function test_SetTreasury_ZeroAddressRevert() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(owner);
        saleContract.setTreasury(newTreasury);
        assertEq(saleContract.treasury(), newTreasury);

        vm.expectRevert("Zero address");
        vm.prank(owner);
        saleContract.setTreasury(address(0));
    }

    function test_WithdrawEther_Success() public {
        // Send ether to contract
        vm.deal(address(saleContract), 1 ether);
        uint256 treasuryBefore = treasury.balance;

        vm.prank(owner);
        saleContract.withdrawEther();

        assertEq(treasury.balance, treasuryBefore + 1 ether);
        assertEq(address(saleContract).balance, 0);
    }

    function test_WithdrawEther_NoEtherRevert() public {
        // Should not revert even with no ether
        vm.prank(owner);
        saleContract.withdrawEther();
    }

    function test_WithdrawEther_Unauthorized() public {
        vm.deal(address(saleContract), 1 ether);

        vm.expectRevert();
        vm.prank(user1);
        saleContract.withdrawEther();
    }

    function test_PriceCalculations_HighPrecision() public {
        // Test that fixed precision calculations are accurate
        // Stage 1: 0 tokens sold = $1.00
        assertEq(saleContract.getCurrentPriceUSD(), 1_000_000);

        // Stage 1: 210,000 tokens sold = $1.00 + (210,000 * 25,000) / 10,000 = $1.00 + 525,000 = $1.525
        setTokensSold(STAGE1_TOKEN_LIMIT);
        assertEq(saleContract.getCurrentPriceUSD(), 1_525_000);

        // Stage 2 boundary: 630,000 tokens sold
        // Stage 2 price at boundary: $1.525 + ((630k-210k) * 50,000) / 10,000 = $1.525 + 2,100,000 = $3.625
        setTokensSold(STAGE2_TOKEN_LIMIT);
        assertEq(saleContract.getCurrentPriceUSD(), 3_625_000);

        // Stage 3 boundary: 1,050,000 tokens sold
        // Stage 3 price at boundary: $3.625 + ((1,050k-630k) * 30,000) / 10,000 = $3.625 + 1,260,000 = $4.885
        setTokensSold(TOTAL_TOKEN_LIMIT);
        assertEq(saleContract.getCurrentPriceUSD(), 4_885_000);
    }

    function test_PriceConsistency_AcrossStages() public {
        // Test price curve continuity - the price should increase by exactly the slope amount
        // when crossing stage boundaries

        // Price at end of Stage 1
        setTokensSold(STAGE1_TOKEN_LIMIT - 1);
        uint256 priceAtEndOfStage1 = saleContract.getCurrentPriceUSD();

        // Price at start of Stage 2 (at boundary)
        setTokensSold(STAGE1_TOKEN_LIMIT);
        uint256 priceAtStartOfStage2 = saleContract.getCurrentPriceUSD();

        // With the new calculation, the price increases in steps of 10,000 tokens
        // Moving from 209,999 to 210,000 tokens crosses a 10,000 token boundary
        // So the price difference should be exactly 25,000 ($0.025)
        uint256 priceDiff = priceAtStartOfStage2 - priceAtEndOfStage1;
        assertEq(priceDiff, 25_000); // Price increase at 10k token boundary
    }

    function test_ImmutableVariables_CannotBeChanged() public {
        // totalTokensForSale should be immutable
        assertEq(saleContract.totalTokensForSale(), TOTAL_TOKEN_LIMIT);
        // Cannot be changed as it's immutable - this is verified at compilation time
    }

    function test_BuyTokens_ParameterNamesMatched() public {
        uint256 usdAmount = 3000 * 1e6; // $3000

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        // This should work with updated parameter names
        saleContract.buyTokens(usdAmount, address(usdc), "");
        vm.stopPrank();

        assertTrue(saleContract.hasBought(user1));
    }

    // Helper function to allow `setTokensSold` for testing
    function setTokensSold(uint256 amount) internal {
        // The storage slot for `tokensSold` is 2, as it's the 3rd state variable.
        bytes32 slot = bytes32(uint256(2));
        vm.store(address(saleContract), slot, bytes32(amount));
    }
}
