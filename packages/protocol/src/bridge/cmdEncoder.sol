// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

library Encoder {
    uint16 constant CMD_TO_UMA_ASSERT_TRUTH = 1;
    uint16 constant CMD_FROM_UMA_RESOLVED_CALLBACK = 2;
    uint16 constant CMD_FROM_UMA_DISPUTED_CALLBACK = 3;

    uint16 constant CMD_FROM_ESCROW_DEPOSIT = 4;
    uint16 constant CMD_FROM_ESCROW_INTENT_TO_WITHDRAW = 5;
    uint16 constant CMD_FROM_ESCROW_WITHDRAW = 6;
    uint16 constant CMD_FROM_ESCROW_REMOVE_WITHDRAWAL_INTENT = 7;

    // Prediction Market Resolver commands
    uint16 constant CMD_FROM_UMA_MARKET_RESOLVED = 8;
    uint16 constant CMD_FROM_UMA_MARKET_DISPUTED = 9;

    // Token Bridge commands
    uint16 constant CMD_CREATE_TOKEN_PAIR = 10;        // Create token pair on remote side
    uint16 constant CMD_CREATE_TOKEN_PAIR_ACK = 11;    // Acknowledge token pair creation
    uint16 constant CMD_BRIDGE_TOKENS = 12;             // Bridge tokens to remote side
    uint16 constant CMD_BRIDGE_ACK = 13;                // Acknowledge bridge completion
    uint16 constant CMD_BRIDGE_RETRY = 14;             // Retry a failed bridge transfer

    function decodeType(bytes memory data) internal pure returns (uint16, bytes memory) {
        return abi.decode(data, (uint16, bytes));
    }

    // To UMA commands
    function encodeToUMAAssertTruth(
        uint256 assertionId,
        address asserter,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes memory claim
    ) internal pure returns (bytes memory) {
        return abi.encode(assertionId, asserter, liveness, currency, bond, claim);
    }

    function decodeToUMAAssertTruth(bytes memory data)
        internal
        pure
        returns (uint256, address, uint64, address, uint256, bytes memory)
    {
        return abi.decode(data, (uint256, address, uint64, address, uint256, bytes));
    }

    // From UMA commands
    function encodeFromUMAResolved(uint256 assertionId, bool truthfully) internal pure returns (bytes memory) {
        return abi.encode(assertionId, truthfully);
    }

    function decodeFromUMAResolved(bytes memory data) internal pure returns (uint256, bool) {
        return abi.decode(data, (uint256, bool));
    }

    function encodeFromUMADisputed(uint256 assertionId) internal pure returns (bytes memory) {
        return abi.encode(assertionId);
    }

    function decodeFromUMADisputed(bytes memory data) internal pure returns (uint256) {
        return abi.decode(data, (uint256));
    }

    // Forward from Bridge Bond Balance commands
    function encodeFromBalanceUpdate(address submitter, address bondToken, uint256 deltaAmount)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(submitter, bondToken, deltaAmount);
    }

    function decodeFromBalanceUpdate(bytes memory data) internal pure returns (address, address, uint256) {
        return abi.decode(data, (address, address, uint256));
    }

    // Prediction Market Resolver commands
    function encodeFromUMAMarketResolved(
        bytes32 marketId,
        bool resolvedToYes,
        bool assertedTruthfully
    ) internal pure returns (bytes memory) {
        return abi.encode(marketId, resolvedToYes, assertedTruthfully);
    }

    function decodeFromUMAMarketResolved(bytes memory data)
        internal
        pure
        returns (bytes32, bool, bool)
    {
        return abi.decode(data, (bytes32, bool, bool));
    }

    function encodeFromUMAMarketDisputed(bytes32 marketId) internal pure returns (bytes memory) {
        return abi.encode(marketId);
    }

    function decodeFromUMAMarketDisputed(bytes memory data) internal pure returns (bytes32) {
        return abi.decode(data, (bytes32));
    }

    // Token Bridge command encoders/decoders
    function encodeCreateTokenPair(
        string memory name,
        string memory symbol,
        uint8 decimals,
        bytes32 salt
    ) internal pure returns (bytes memory) {
        return abi.encode(name, symbol, decimals, salt);
    }

    function decodeCreateTokenPair(bytes memory data)
        internal
        pure
        returns (string memory, string memory, uint8, bytes32)
    {
        return abi.decode(data, (string, string, uint8, bytes32));
    }

    function encodeBridgeTokens(
        bytes32 transferId,
        address token,
        address user,
        uint256 amount
    ) internal pure returns (bytes memory) {
        return abi.encode(transferId, token, user, amount);
    }

    function decodeBridgeTokens(bytes memory data)
        internal
        pure
        returns (bytes32, address, address, uint256)
    {
        return abi.decode(data, (bytes32, address, address, uint256));
    }

    function encodeBridgeAck(bytes32 transferId) internal pure returns (bytes memory) {
        return abi.encode(transferId);
    }

    function decodeBridgeAck(bytes memory data) internal pure returns (bytes32) {
        return abi.decode(data, (bytes32));
    }

    function encodeBridgeRetry(bytes32 transferId) internal pure returns (bytes memory) {
        return abi.encode(transferId);
    }

    function decodeBridgeRetry(bytes memory data) internal pure returns (bytes32) {
        return abi.decode(data, (bytes32));
    }

    function encodeCreateTokenPairAck(address token) internal pure returns (bytes memory) {
        return abi.encode(token);
    }

    function decodeCreateTokenPairAck(bytes memory data) internal pure returns (address) {
        return abi.decode(data, (address));
    }
}
