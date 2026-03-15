// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {APNTsSaleContract} from "../src/APNTsSaleContract.sol";

/**
 * @notice Deployment script for APNTsSaleContract.
 *
 * Required environment variables:
 *   APNTS_ADDRESS      - The aPNTs ERC20 token contract address
 *   TREASURY_ADDRESS   - Address to receive USDC/USDT payment proceeds
 *   USDC_ADDRESS       - USDC token address (whitelisted on deploy)
 *   USDT_ADDRESS       - USDT token address (optional, whitelisted if set)
 *   PRIVATE_KEY_SUPPLIER - Deployer private key
 *
 * Optional:
 *   INITIAL_PRICE_USD  - Price of 1 aPNTs in USD (6 decimals), default 20_000 ($0.02)
 *   OWNER_ADDRESS      - Owner address, defaults to msg.sender
 *
 * Deploy to Sepolia:
 *   forge script script/DeployAPNTsSaleContract.s.sol \
 *     --rpc-url $RPC_SEPOLIA \
 *     --private-key $PRIVATE_KEY_SUPPLIER \
 *     --broadcast \
 *     --verify
 */
contract DeployAPNTsSaleContract is Script {
    function run() external returns (APNTsSaleContract) {
        address aPNTsAddress = vm.envAddress("APNTS_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        address usdtAddress = vm.envOr("USDT_ADDRESS", address(0));
        uint256 initialPriceUSD = vm.envOr("INITIAL_PRICE_USD", uint256(20_000)); // $0.02
        address ownerAddress = vm.envOr("OWNER_ADDRESS", msg.sender);

        require(aPNTsAddress != address(0), "APNTS_ADDRESS not set");
        require(treasuryAddress != address(0), "TREASURY_ADDRESS not set");
        require(initialPriceUSD > 0, "INITIAL_PRICE_USD must be > 0");

        console.log("=== APNTsSaleContract Deployment ===");
        console.log("aPNTs address:   ", aPNTsAddress);
        console.log("Treasury:        ", treasuryAddress);
        console.log("Initial price:   $", initialPriceUSD / 1e6, ".", initialPriceUSD % 1e6);
        console.log("Owner:           ", ownerAddress);

        vm.startBroadcast();

        APNTsSaleContract saleContract = new APNTsSaleContract(
            aPNTsAddress,
            treasuryAddress,
            initialPriceUSD,
            ownerAddress
        );

        // Whitelist payment tokens
        if (usdcAddress != address(0)) {
            saleContract.setPaymentToken(usdcAddress, true);
            console.log("Whitelisted USDC:", usdcAddress);
        }
        if (usdtAddress != address(0)) {
            saleContract.setPaymentToken(usdtAddress, true);
            console.log("Whitelisted USDT:", usdtAddress);
        }

        vm.stopBroadcast();

        console.log("APNTsSaleContract deployed at:", address(saleContract));
        console.log("Available inventory: fund with aPNTs before opening sale.");

        return saleContract;
    }
}
