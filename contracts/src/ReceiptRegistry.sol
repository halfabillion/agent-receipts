// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ReceiptRegistry: public, append-only anchor for AgentReceipts
/// @notice A seller anchors the hash of each off-chain receipt together with the settlement it covers.
///         At anchor time the contract reads the Chainlink USDC/USD feed itself, so the valuation is
///         attested by the chain rather than asserted by the seller. Stale or invalid oracle data reverts.
contract ReceiptRegistry {
    struct Anchor {
        address seller;
        bytes32 settlementTx;
        uint32 logIndex;
        uint96 amountAtomic; // USDC, 6 decimals
        bytes32 termsHash;
        uint80 oracleRoundId;
        int256 usdPerUnit; // feed decimals
        uint64 anchoredAt;
        bool revoked;
    }

    AggregatorV3Interface public immutable usdcUsdFeed;
    uint256 public immutable maxOracleAge;
    mapping(bytes32 => Anchor) public anchors; // receiptHash => anchor
    mapping(bytes32 => bytes32) public receiptForSettlement; // keccak(tx, logIndex) => receiptHash

    event ReceiptAnchored(bytes32 indexed receiptHash, address indexed seller, bytes32 indexed settlementTx, uint32 logIndex,
        uint96 amountAtomic, bytes32 termsHash, uint80 oracleRoundId, int256 usdPerUnit);
    event ReceiptRevoked(bytes32 indexed receiptHash, bytes32 indexed replacement, string reason);

    error AlreadyAnchored();
    error SettlementAlreadyReceipted(bytes32 existing);
    error StaleOracle(uint256 updatedAt);
    error InvalidOracleAnswer();
    error NotSeller();
    error UnknownReceipt();

    constructor(AggregatorV3Interface feed, uint256 maxAgeSeconds) {
        usdcUsdFeed = feed;
        maxOracleAge = maxAgeSeconds;
    }

    function anchor(bytes32 receiptHash, bytes32 settlementTx, uint32 logIndex, uint96 amountAtomic, bytes32 termsHash)
        external returns (uint80 roundId, int256 answer)
    {
        if (anchors[receiptHash].seller != address(0)) revert AlreadyAnchored();
        bytes32 key = keccak256(abi.encode(settlementTx, logIndex));
        bytes32 existing = receiptForSettlement[key];
        if (existing != bytes32(0) && !anchors[existing].revoked) revert SettlementAlreadyReceipted(existing);

        uint256 updatedAt;
        uint80 answeredInRound;
        (roundId, answer,, updatedAt, answeredInRound) = usdcUsdFeed.latestRoundData();
        if (answer <= 0 || answeredInRound < roundId) revert InvalidOracleAnswer();
        if (block.timestamp - updatedAt > maxOracleAge) revert StaleOracle(updatedAt);

        anchors[receiptHash] = Anchor(msg.sender, settlementTx, logIndex, amountAtomic, termsHash, roundId, answer, uint64(block.timestamp), false);
        receiptForSettlement[key] = receiptHash;
        emit ReceiptAnchored(receiptHash, msg.sender, settlementTx, logIndex, amountAtomic, termsHash, roundId, answer);
    }

    /// @notice Seller can supersede a receipt (e.g. corrected buyer VAT evidence). History stays public.
    function revoke(bytes32 receiptHash, bytes32 replacement, string calldata reason) external {
        Anchor storage a = anchors[receiptHash];
        if (a.seller == address(0)) revert UnknownReceipt();
        if (a.seller != msg.sender) revert NotSeller();
        a.revoked = true;
        emit ReceiptRevoked(receiptHash, replacement, reason);
    }

    /// @notice USD value (6 decimals) of an anchored receipt using the round read on-chain at anchor time.
    function usdValue(bytes32 receiptHash) external view returns (uint256) {
        Anchor memory a = anchors[receiptHash];
        if (a.seller == address(0)) revert UnknownReceipt();
        return (uint256(a.amountAtomic) * uint256(a.usdPerUnit)) / (10 ** usdcUsdFeed.decimals());
    }
}
