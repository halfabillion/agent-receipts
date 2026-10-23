// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReceiptRegistry, AggregatorV3Interface} from "../src/ReceiptRegistry.sol";

/// Run: forge test --fork-url https://mainnet.base.org --match-contract Fork
contract ReceiptRegistryForkTest {
    AggregatorV3Interface constant FEED = AggregatorV3Interface(0x7e860098F58bBFC8648a4311b374B1D669a2bc6B); // Chainlink USDC/USD, Base
    function testAnchorAgainstLiveChainlinkFeed() public {
        if (block.chainid != 8453) return; // only meaningful on a Base fork
        ReceiptRegistry reg = new ReceiptRegistry(FEED, 86400 + 3600);
        (uint80 rid, int256 ans) = reg.anchor(keccak256("r"), 0x91575d9f4f8db027ec0f3f307d80433827b9b8aaef2c7287a26db397c388e47b, 324, 20000, keccak256("t"));
        require(rid > 0 && ans > 95_000_000 && ans < 105_000_000, "USDC/USD out of band");
        uint256 usd = reg.usdValue(keccak256("r"));
        require(usd > 19_000 && usd < 21_000, "usd value");
    }
}
