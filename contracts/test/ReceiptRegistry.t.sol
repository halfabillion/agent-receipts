// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiptRegistry, AggregatorV3Interface} from "../src/ReceiptRegistry.sol";

interface Vm { function warp(uint256) external; function prank(address) external; function expectRevert(bytes4) external; function expectRevert(bytes calldata) external; }

contract MockFeed is AggregatorV3Interface {
    uint80 public r = 1; int256 public a = 99984937; uint256 public u;
    constructor() { u = block.timestamp; }
    function set(uint80 r_, int256 a_, uint256 u_) external { r = r_; a = a_; u = u_; }
    function decimals() external pure returns (uint8) { return 8; }
    function description() external pure returns (string memory) { return "USDC / USD"; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) { return (r, a, u, u, r); }
}

contract ReceiptRegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockFeed feed; ReceiptRegistry reg;
    bytes32 constant H = keccak256("receipt"); bytes32 constant TX = keccak256("tx"); bytes32 constant TERMS = keccak256("terms");

    function setUp() public { vm.warp(1_800_000_000); feed = new MockFeed(); feed.set(7, 99984937, block.timestamp); reg = new ReceiptRegistry(feed, 86400 + 3600); }

    function testAnchorReadsChainlink() public {
        (uint80 rid, int256 ans) = reg.anchor(H, TX, 324, 20000, TERMS);
        require(rid == 7 && ans == 99984937, "round");
        (address seller,,, uint96 amt,, uint80 storedRound,,, bool revoked) = reg.anchors(H);
        require(seller == address(this) && amt == 20000 && storedRound == 7 && !revoked, "stored");
        require(reg.usdValue(H) == 19996, "usd"); // 0.019996 USD
    }
    function testRejectsDuplicateReceipt() public { reg.anchor(H, TX, 324, 20000, TERMS); vm.expectRevert(ReceiptRegistry.AlreadyAnchored.selector); reg.anchor(H, TX, 324, 20000, TERMS); }
    function testRejectsDoubleReceiptingSameSettlement() public {
        reg.anchor(H, TX, 324, 20000, TERMS);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.SettlementAlreadyReceipted.selector, H));
        reg.anchor(keccak256("other"), TX, 324, 20000, TERMS);
    }
    function testRevokeThenReissue() public {
        reg.anchor(H, TX, 324, 20000, TERMS); bytes32 H2 = keccak256("corrected");
        reg.revoke(H, H2, "buyer VAT ID supplied"); reg.anchor(H2, TX, 324, 20000, TERMS);
        (,,,,,,,, bool revoked) = reg.anchors(H); require(revoked, "revoked");
    }
    function testOnlySellerRevokes() public { reg.anchor(H, TX, 324, 20000, TERMS); vm.prank(address(0xBEEF)); vm.expectRevert(ReceiptRegistry.NotSeller.selector); reg.revoke(H, bytes32(0), "x"); }
    function testStaleOracleReverts() public { feed.set(7, 99984937, block.timestamp - 2 days); vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.StaleOracle.selector, block.timestamp - 2 days)); reg.anchor(H, TX, 1, 1, TERMS); }
    function testBadAnswerReverts() public { feed.set(7, 0, block.timestamp); vm.expectRevert(ReceiptRegistry.InvalidOracleAnswer.selector); reg.anchor(H, TX, 1, 1, TERMS); }
}
