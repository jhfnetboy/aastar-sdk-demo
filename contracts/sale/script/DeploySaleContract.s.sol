// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {SaleContract} from "../src/SaleContract.sol";

contract DeploySaleContract is Script {
    function run() external returns (SaleContract) {
        address gTokenAddress = vm.envAddress("GTOKEN_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        address ownerAddress = vm.envOr("OWNER_ADDRESS", msg.sender);

        require(gTokenAddress != address(0), "GTOKEN_ADDRESS not set");
        require(treasuryAddress != address(0), "TREASURY_ADDRESS not set");

        console.log("=== SaleContract Deployment ===");
        console.log("GToken address: ", gTokenAddress);
        console.log("Treasury:       ", treasuryAddress);
        console.log("Owner:          ", ownerAddress);

        vm.startBroadcast();

        SaleContract saleContract = new SaleContract(gTokenAddress, treasuryAddress, ownerAddress);

        console.log("SaleContract deployed at:", address(saleContract));

        vm.stopBroadcast();
        return saleContract;
    }
}
