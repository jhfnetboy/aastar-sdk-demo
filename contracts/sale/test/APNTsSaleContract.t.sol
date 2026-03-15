// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {APNTsSaleContract} from "../src/APNTsSaleContract.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract MockAPNTs is ERC20 {
    constructor() ERC20("AccessPoints", "aPNTs") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

contract APNTsSaleContractTest is Test {
    APNTsSaleContract public saleContract;
    MockAPNTs public aPNTs;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    // Default price: $0.02 = 20_000 (6 decimals)
    uint256 public constant DEFAULT_PRICE = 20_000;
    // Inventory: 1,000,000 aPNTs
    uint256 public constant INITIAL_INVENTORY = 1_000_000 * 1e18;

    function setUp() public {
        aPNTs = new MockAPNTs();
        usdc = new MockUSDC();

        vm.startPrank(owner);
        saleContract = new APNTsSaleContract(address(aPNTs), treasury, DEFAULT_PRICE, owner);
        saleContract.setPaymentToken(address(usdc), true);
        vm.stopPrank();

        // Fund the sale contract with aPNTs to sell
        aPNTs.mint(address(saleContract), INITIAL_INVENTORY);

        // Fund users with USDC ($100,000 each)
        usdc.mint(user1, 100_000 * 1e6);
        usdc.mint(user2, 100_000 * 1e6);
    }

    // =================================================
    // SECTION 1: Initial State
    // =================================================

    function test_InitialState() public view {
        assertEq(address(saleContract.aPNTs()), address(aPNTs));
        assertEq(saleContract.treasury(), treasury);
        assertEq(saleContract.priceUSD(), DEFAULT_PRICE);
        assertEq(saleContract.totalSold(), 0);
        assertEq(saleContract.availableInventory(), INITIAL_INVENTORY);
        assertTrue(saleContract.acceptedPaymentTokens(address(usdc)));
        assertEq(saleContract.minPurchaseAmount(), 10 * 1e18);
        assertEq(saleContract.maxPurchaseAmount(), 100_000 * 1e18);
    }

    // =================================================
    // SECTION 2: Price Calculation
    // =================================================

    function test_GetAPNTsForUSD() public view {
        // $1.00 USDC (1e6) buys 50 aPNTs at $0.02 each
        uint256 usdAmount = 1_000_000; // $1.00
        uint256 expected = (usdAmount * 1e18) / DEFAULT_PRICE; // 50 * 1e18
        assertEq(saleContract.getAPNTsForUSD(usdAmount), expected);
    }

    function test_GetUSDForAPNTs() public view {
        // 50 aPNTs should cost $1.00
        uint256 aPNTsAmount = 50 * 1e18;
        uint256 usdAmount = saleContract.getUSDForAPNTs(aPNTsAmount);
        assertEq(usdAmount, 1_000_000); // $1.00 in USDC (6 decimals)
    }

    function test_PriceCalculation_RoundTrip() public view {
        // Buying aPNTs then calculating USD should be consistent
        uint256 usdIn = 500_000_000; // $500 USDC
        uint256 aPNTsOut = saleContract.getAPNTsForUSD(usdIn);
        uint256 usdCheck = saleContract.getUSDForAPNTs(aPNTsOut);
        // Should be within 1 unit of rounding error
        assertApproxEqAbs(usdCheck, usdIn, 1);
    }

    // =================================================
    // SECTION 3: Purchase Logic — buyAPNTs
    // =================================================

    function test_BuyAPNTs_Success() public {
        uint256 usdAmount = 1_000_000; // $1.00 → 50 aPNTs
        uint256 expectedAPNTs = saleContract.getAPNTsForUSD(usdAmount);

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();

        assertEq(aPNTs.balanceOf(user1), expectedAPNTs);
        assertEq(usdc.balanceOf(treasury), usdAmount);
        assertEq(saleContract.totalSold(), expectedAPNTs);
    }

    function test_BuyAPNTs_MultipleUsers() public {
        uint256 usdAmount = 2_000_000; // $2.00

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();

        vm.startPrank(user2);
        usdc.approve(address(saleContract), usdAmount);
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();

        // Both users should have received aPNTs
        assertGt(aPNTs.balanceOf(user1), 0);
        assertGt(aPNTs.balanceOf(user2), 0);
        assertEq(usdc.balanceOf(treasury), usdAmount * 2);
    }

    function test_BuyAPNTs_SameUserCanBuyMultipleTimes() public {
        uint256 usdAmount = 1_000_000; // $1.00

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount * 2);

        saleContract.buyAPNTs(usdAmount, address(usdc));
        uint256 balanceAfterFirst = aPNTs.balanceOf(user1);

        // Second purchase should succeed (no one-per-user restriction)
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();

        assertEq(aPNTs.balanceOf(user1), balanceAfterFirst * 2);
    }

    // =================================================
    // SECTION 4: Purchase Logic — buyExactAPNTs
    // =================================================

    function test_BuyExactAPNTs_Success() public {
        uint256 aPNTsAmount = 100 * 1e18; // Buy exactly 100 aPNTs
        uint256 expectedUSD = saleContract.getUSDForAPNTs(aPNTsAmount);

        vm.startPrank(user1);
        usdc.approve(address(saleContract), expectedUSD);
        saleContract.buyExactAPNTs(aPNTsAmount, address(usdc));
        vm.stopPrank();

        assertEq(aPNTs.balanceOf(user1), aPNTsAmount);
        assertEq(usdc.balanceOf(treasury), expectedUSD);
    }

    // =================================================
    // SECTION 5: Reverts
    // =================================================

    function test_Revert_ZeroAmount() public {
        vm.startPrank(user1);
        usdc.approve(address(saleContract), 1e6);
        vm.expectRevert(APNTsSaleContract.ZeroAmount.selector);
        saleContract.buyAPNTs(0, address(usdc));
        vm.stopPrank();
    }

    function test_Revert_UnacceptedPaymentToken() public {
        address fakeToken = makeAddr("fakeToken");
        vm.startPrank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(APNTsSaleContract.PaymentTokenNotAccepted.selector, fakeToken)
        );
        saleContract.buyAPNTs(1_000_000, fakeToken);
        vm.stopPrank();
    }

    function test_Revert_BelowMinPurchase() public {
        // minPurchase is 10 aPNTs. Buying $0.10 = 5 aPNTs → below min
        uint256 usdAmount = 100_000; // $0.10 → 5 aPNTs at $0.02

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        vm.expectRevert(
            abi.encodeWithSelector(
                APNTsSaleContract.BelowMinPurchase.selector,
                saleContract.getAPNTsForUSD(usdAmount),
                saleContract.minPurchaseAmount()
            )
        );
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();
    }

    function test_Revert_ExceedsMaxPurchase() public {
        // maxPurchase is 100,000 aPNTs. Buying $3,000 = 150,000 aPNTs → exceeds max
        uint256 usdAmount = 3_000_000_000; // $3,000

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        vm.expectRevert(
            abi.encodeWithSelector(
                APNTsSaleContract.ExceedsMaxPurchase.selector,
                saleContract.getAPNTsForUSD(usdAmount),
                saleContract.maxPurchaseAmount()
            )
        );
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();
    }

    function test_Revert_InsufficientInventory() public {
        // Raise max limit to allow large purchase
        vm.prank(owner);
        saleContract.setPurchaseLimits(10 * 1e18, 10_000_000 * 1e18);

        // Buy more than inventory (inventory = 1M aPNTs, buy costs $40,000 for 2M)
        uint256 usdAmount = 40_000_000_000; // $40,000 → 2M aPNTs
        usdc.mint(user1, usdAmount);

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);
        vm.expectRevert(
            abi.encodeWithSelector(
                APNTsSaleContract.InsufficientInventory.selector,
                saleContract.getAPNTsForUSD(usdAmount),
                saleContract.availableInventory()
            )
        );
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();
    }

    // =================================================
    // SECTION 6: Admin Functions
    // =================================================

    function test_Admin_SetPrice() public {
        uint256 newPrice = 40_000; // $0.04
        vm.prank(owner);
        saleContract.setPrice(newPrice);
        assertEq(saleContract.priceUSD(), newPrice);

        // Verify the new price is used in calculations
        uint256 aPNTsForDollar = saleContract.getAPNTsForUSD(1_000_000);
        assertEq(aPNTsForDollar, 25 * 1e18); // $1 / $0.04 = 25 aPNTs
    }

    function test_Admin_SetPrice_ZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(APNTsSaleContract.InvalidPrice.selector);
        saleContract.setPrice(0);
    }

    function test_Admin_SetTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(owner);
        saleContract.setTreasury(newTreasury);
        assertEq(saleContract.treasury(), newTreasury);
    }

    function test_Admin_SetTreasury_ZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(APNTsSaleContract.ZeroAddress.selector);
        saleContract.setTreasury(address(0));
    }

    function test_Admin_SetPaymentToken() public {
        address newToken = makeAddr("newToken");
        vm.prank(owner);
        saleContract.setPaymentToken(newToken, true);
        assertTrue(saleContract.acceptedPaymentTokens(newToken));

        vm.prank(owner);
        saleContract.setPaymentToken(newToken, false);
        assertFalse(saleContract.acceptedPaymentTokens(newToken));
    }

    function test_Admin_SetPurchaseLimits() public {
        uint256 newMin = 100 * 1e18;
        uint256 newMax = 500_000 * 1e18;
        vm.prank(owner);
        saleContract.setPurchaseLimits(newMin, newMax);
        assertEq(saleContract.minPurchaseAmount(), newMin);
        assertEq(saleContract.maxPurchaseAmount(), newMax);
    }

    function test_Admin_WithdrawUnsoldAPNTs() public {
        uint256 inventoryBefore = saleContract.availableInventory();
        assertGt(inventoryBefore, 0);

        vm.prank(owner);
        saleContract.withdrawUnsoldAPNTs();

        assertEq(saleContract.availableInventory(), 0);
        assertEq(aPNTs.balanceOf(treasury), inventoryBefore);
    }

    function test_Admin_WithdrawEther() public {
        vm.deal(address(saleContract), 1 ether);
        uint256 treasuryBefore = treasury.balance;

        vm.prank(owner);
        saleContract.withdrawEther();

        assertEq(treasury.balance, treasuryBefore + 1 ether);
        assertEq(address(saleContract).balance, 0);
    }

    function test_Admin_RecoverToken_Reverts_ForAPNTs() public {
        vm.prank(owner);
        vm.expectRevert("Use withdrawUnsoldAPNTs");
        saleContract.recoverToken(address(aPNTs), 100);
    }

    // =================================================
    // SECTION 7: Access Control
    // =================================================

    function test_Revert_NonOwner_SetPrice() public {
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1)
        );
        saleContract.setPrice(40_000);
    }

    function test_Revert_NonOwner_SetTreasury() public {
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1)
        );
        saleContract.setTreasury(makeAddr("x"));
    }

    function test_Revert_NonOwner_SetPaymentToken() public {
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1)
        );
        saleContract.setPaymentToken(address(usdc), false);
    }

    function test_Revert_NonOwner_WithdrawAPNTs() public {
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1)
        );
        saleContract.withdrawUnsoldAPNTs();
    }

    // =================================================
    // SECTION 8: Events
    // =================================================

    function test_Event_APNTsPurchased() public {
        uint256 usdAmount = 1_000_000; // $1.00
        uint256 expectedAPNTs = saleContract.getAPNTsForUSD(usdAmount);

        vm.startPrank(user1);
        usdc.approve(address(saleContract), usdAmount);

        vm.expectEmit(true, true, false, true);
        emit APNTsSaleContract.APNTsPurchased(
            user1, address(usdc), expectedAPNTs, usdAmount, DEFAULT_PRICE
        );
        saleContract.buyAPNTs(usdAmount, address(usdc));
        vm.stopPrank();
    }

    function test_Event_PriceUpdated() public {
        uint256 newPrice = 40_000;
        vm.expectEmit(false, false, false, true);
        emit APNTsSaleContract.PriceUpdated(DEFAULT_PRICE, newPrice);

        vm.prank(owner);
        saleContract.setPrice(newPrice);
    }
}
