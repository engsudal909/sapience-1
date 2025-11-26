// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./interfaces/IPredictionMarket.sol";
import "./interfaces/IPredictionStructs.sol";
import "./interfaces/IPredictionMarketResolver.sol";
import "./interfaces/IPredictionEvents.sol";
import "./utils/SignatureProcessor.sol";
import "../vault/interfaces/IPassiveLiquidityVault.sol";

/**
 * @title PredictionMarket
 * @notice Implementation of the Prediction Market contract with orderbook functionality
 * @dev This contract implements ERC721 for prediction NFTs but take into account those NFTs are not transferable to contracts implementing IPassiveLiquidityVault.
 * @dev Also notice that, on transfers, it will attempt to call `IERC165(destination_address).supportsInterface(type( )`
 */
contract PredictionMarket is
    ERC721,
    IPredictionMarket,
    ReentrancyGuard,
    SignatureProcessor
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    // ============ Custom Errors ============
    error InvalidCollateralToken();
    error InvalidMinCollateral();
    error RequesterIsNotCaller();
    error InvalidEncodedPredictedOutcomes();
    error PredictionAlreadySettled();
    error CollateralBelowMinimum();
    error RequesterCollateralMustBeGreaterThanZero();
    error ResponderCollateralMustBeGreaterThanZero();
    error InvalidResponderSignature();
    error InvalidMarketsAccordingToResolver();
    error PredictionNotFound();
    error PredictionResolutionFailed();
    error RequesterAndResponderAreDifferent();
    error PredictionDoesNotExist();
    error ResponderDeadlineExpired();
    error TransferFailed();
    error OrderNotFound();
    error OrderExpired();
    error InvalidRequesterNonce();
    error NotOwner();
    error TransferNotAllowed();
    error TransferInProcess();

    // ============ State Variables ============
    IPredictionStructs.Settings public config;

    // ============ Counters ============
    uint256 private _predictionIdCounter; // Single ID for both requests and predictions
    uint256 private _nftTokenIdCounter; // Single counter for both requester and responder NFTs

    // ============ Mappings ============
    mapping(uint256 => IPredictionStructs.PredictionData) private predictions;

    mapping(uint256 => uint256) private nftToPredictionId; // nftTokenId => predictionId

    // Auxiliary mappings to track all nft by requester and responder
    mapping(address => EnumerableSet.UintSet) private nftByRequesterAddress;
    mapping(address => EnumerableSet.UintSet) private nftByResponderAddress;

    // Mapping to track total collateral deposited by each user
    mapping(address => uint256) private userCollateralDeposits;

    // Sequential nonce for replay protection per requester address
    mapping(address => uint256) public nonces;

    // ============ Limit Order ============
    uint256 private orderIdCounter = 1; // initialize the order id counter to 1 (zero means no order)

    mapping(uint256 => IPredictionStructs.LimitOrderData)
        private unfilledOrders;
    
    mapping(address => EnumerableSet.UintSet) private unfilledOrdersByRequester;
    
    EnumerableSet.UintSet private unfilledOrderIds;

    bool private _verifyTransferInProcess = false;


    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        address _collateralToken,
        uint256 _minCollateral
    ) ERC721(name, symbol) {
        if (_collateralToken == address(0)) revert InvalidCollateralToken();
        if (_minCollateral == 0) revert InvalidMinCollateral();

        config = IPredictionStructs.Settings({
            collateralToken: _collateralToken,
            minCollateral: _minCollateral
        });

        _predictionIdCounter = 1;
        _nftTokenIdCounter = 1;
    }

    // ============ Prediction Functions ============

    function mint(
        IPredictionStructs.MintPredictionRequestData
            calldata mintPredictionRequestData
    )
        external
        nonReentrant
        returns (uint256 requesterNftTokenId, uint256 responderNftTokenId)
    {
        // 1- Initial checks
        if (mintPredictionRequestData.requester != msg.sender)
            revert RequesterIsNotCaller();
        if (mintPredictionRequestData.responderDeadline < block.timestamp)
            revert ResponderDeadlineExpired();

        if (mintPredictionRequestData.requesterCollateral < config.minCollateral)
            revert CollateralBelowMinimum();
        if (mintPredictionRequestData.requesterCollateral == 0)
            revert RequesterCollateralMustBeGreaterThanZero();
        if (mintPredictionRequestData.responderCollateral == 0)
            revert ResponderCollateralMustBeGreaterThanZero();
        if (mintPredictionRequestData.encodedPredictedOutcomes.length == 0)
            revert InvalidEncodedPredictedOutcomes();

        // 2- Confirm the responder signature is valid for this prediction (hash of predicted outcomes, responder collateral and requester collateral, resolver and requester address)
        //    and enforce per-requester nonce replay protection
        if (mintPredictionRequestData.requesterNonce != nonces[mintPredictionRequestData.requester]) {
            revert InvalidRequesterNonce();
        }
        // Increment the requester nonce
        nonces[mintPredictionRequestData.requester]++;
        bytes32 messageHash = keccak256(
            abi.encode(
                mintPredictionRequestData.encodedPredictedOutcomes,
                mintPredictionRequestData.responderCollateral,
                mintPredictionRequestData.requesterCollateral,
                mintPredictionRequestData.resolver,
                mintPredictionRequestData.requester,
                mintPredictionRequestData.responderDeadline,
                mintPredictionRequestData.requesterNonce
            )
        );

        if (
            !_isApprovalValid(
                messageHash,
                mintPredictionRequestData.responder,
                mintPredictionRequestData.responderSignature
            )
        ) {
            // Not valid signature for EOA (ERC-712),
            // Check if it's a contract that implements ERC-1271
            try
                IERC1271(mintPredictionRequestData.responder).isValidSignature(
                    messageHash,
                    mintPredictionRequestData.responderSignature
                )
            returns (bytes4 magicValue) {
                if (magicValue != IERC1271.isValidSignature.selector) {
                    revert InvalidResponderSignature();
                }
            } catch {
                // Using the try-catch to handle the case where the responder is not a contract that implements ERC-1271
                revert InvalidResponderSignature();
            }
        }

        // 3- Collect collateral
        _safeTransferIn(
            config.collateralToken,
            mintPredictionRequestData.requester,
            mintPredictionRequestData.requesterCollateral
        );
        _safeTransferIn(
            config.collateralToken,
            mintPredictionRequestData.responder,
            mintPredictionRequestData.responderCollateral
        );

        // 4- Create prediction using internal function
        (requesterNftTokenId, responderNftTokenId) = _createPrediction(
            mintPredictionRequestData.encodedPredictedOutcomes,
            mintPredictionRequestData.resolver,
            mintPredictionRequestData.requester,
            mintPredictionRequestData.responder,
            mintPredictionRequestData.requesterCollateral,
            mintPredictionRequestData.responderCollateral,
            mintPredictionRequestData.refCode
        );

        return (requesterNftTokenId, responderNftTokenId);
    }

    function burn(uint256 tokenId, bytes32 refCode) external nonReentrant {
        if (_verifyTransferInProcess) revert TransferInProcess(); // Prevent reentrancy from transfer verification

        uint256 predictionId = nftToPredictionId[tokenId];

        // 1- Get prediction from Store
        IPredictionStructs.PredictionData storage prediction = predictions[
            predictionId
        ];

        // 2- Initial checks
        if (prediction.requester == address(0)) revert PredictionNotFound();
        if (prediction.responder == address(0)) revert PredictionNotFound();
        if (prediction.settled) revert PredictionAlreadySettled();

        // 3- Ask resolver if markets are settled, and if prediction succeeded or not, it means requester won
        (bool isResolved, , bool parlaySuccess) = IPredictionMarketResolver(
            prediction.resolver
        ).getPredictionResolution(prediction.encodedPredictedOutcomes);

        if (!isResolved) revert PredictionResolutionFailed();

        // 4- Send collateral to winner
        uint256 payout = prediction.requesterCollateral +
            prediction.responderCollateral;
        address winner = parlaySuccess ? prediction.requester : prediction.responder;

        _safeTransferOut(config.collateralToken, winner, payout);

        // 4.1- Update user collateral deposits tracking
        userCollateralDeposits[prediction.requester] -= prediction.requesterCollateral;
        userCollateralDeposits[prediction.responder] -= prediction.responderCollateral;

        // 5- Set the prediction state (identify who won and set as closed)
        prediction.settled = true;
        prediction.requesterWon = parlaySuccess;

        // 6- Burn NFTs
        _burn(prediction.requesterNftTokenId);
        _burn(prediction.responderNftTokenId);

        emit PredictionBurned(
            prediction.requester,
            prediction.responder,
            prediction.encodedPredictedOutcomes,
            prediction.requesterNftTokenId,
            prediction.responderNftTokenId,
            payout,
            prediction.requesterWon,
            refCode
        );
    }

    function consolidatePrediction(
        uint256 tokenId,
        bytes32 refCode
    ) external nonReentrant {
        if (_verifyTransferInProcess) revert TransferInProcess(); // Prevent reentrancy from transfer verification

        uint256 predictionId = nftToPredictionId[tokenId];

        // 1- Get prediction from store
        IPredictionStructs.PredictionData storage prediction = predictions[
            predictionId
        ];

        // 2- Initial checks
        if (prediction.requester == address(0)) revert PredictionNotFound();
        if (prediction.responder == address(0)) revert PredictionNotFound();
        if (prediction.settled) revert PredictionAlreadySettled();

        if (prediction.requester != prediction.responder)
            revert RequesterAndResponderAreDifferent();
        if (prediction.requester != msg.sender) revert NotOwner();

        // 3- Set as settled and requester won and send the collateral to the requester
        prediction.settled = true;
        prediction.requesterWon = true;
        uint256 payout = prediction.requesterCollateral +
            prediction.responderCollateral;
        _safeTransferOut(config.collateralToken, prediction.requester, payout);

        // 3.1- Update user collateral deposits tracking
        userCollateralDeposits[prediction.requester] -= prediction.requesterCollateral;
        userCollateralDeposits[prediction.responder] -= prediction.responderCollateral;

        // 4- Burn NFTs
        _burn(prediction.requesterNftTokenId);
        _burn(prediction.responderNftTokenId);

        emit PredictionConsolidated(
            prediction.requesterNftTokenId,
            prediction.responderNftTokenId,
            payout,
            refCode
        );
    }

    // ============ Limit Order ============

    function placeOrder(
        IPredictionStructs.OrderRequestData calldata orderRequestData
    ) external nonReentrant returns (uint256 orderId) {
        address requester = msg.sender;

        if (orderRequestData.requesterCollateral == 0)
            revert RequesterCollateralMustBeGreaterThanZero();
        if (orderRequestData.responderCollateral == 0)
            revert ResponderCollateralMustBeGreaterThanZero();
        if (orderRequestData.requesterCollateral < config.minCollateral)
            revert CollateralBelowMinimum();

        // 1- Transfer collateral to the contract
        _safeTransferIn(
            config.collateralToken,
            requester,
            orderRequestData.requesterCollateral
        );

        orderId = orderIdCounter++;

        // 2- Store order request data
        unfilledOrders[orderId] = IPredictionStructs.LimitOrderData({
            orderId: orderId,
            requesterCollateral: orderRequestData.requesterCollateral,
            responderCollateral: orderRequestData.responderCollateral,
            orderDeadline: orderRequestData.orderDeadline,
            encodedPredictedOutcomes: orderRequestData.encodedPredictedOutcomes,
            resolver: orderRequestData.resolver,
            requester: requester,
            responder: address(0)
        });
        unfilledOrdersByRequester[requester].add(orderId);
        unfilledOrderIds.add(orderId);
        emit OrderPlaced(
            requester,
            orderId,
            orderRequestData.encodedPredictedOutcomes,
            orderRequestData.resolver,
            orderRequestData.requesterCollateral,
            orderRequestData.responderCollateral,
            orderRequestData.refCode
        );
    }

    function fillOrder(uint256 orderId, bytes32 refCode) external nonReentrant {
        IPredictionStructs.LimitOrderData storage order = unfilledOrders[
            orderId
        ];
        if (order.orderId != orderId) revert OrderNotFound();
        if (order.orderDeadline < block.timestamp) revert OrderExpired();

        // 3- Transfer collateral to the responder
        address responder = msg.sender;
        _safeTransferIn(config.collateralToken, responder, order.responderCollateral);

        // 4- Create prediction using internal function
        _createPrediction(
            bytes(order.encodedPredictedOutcomes),
            order.resolver,
            order.requester,
            responder,
            order.requesterCollateral,
            order.responderCollateral,
            refCode
        );

        // 5- Set the order as filled and remove from tracking
        order.orderId = 0; // zero means no order
        unfilledOrderIds.remove(orderId);
        unfilledOrdersByRequester[order.requester].remove(orderId);

        // 6- emit event
        emit OrderFilled(
            orderId,
            order.requester,
            responder,
            order.encodedPredictedOutcomes,
            order.requesterCollateral,
            order.responderCollateral,
            refCode
        );
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        IPredictionStructs.LimitOrderData storage order = unfilledOrders[
            orderId
        ];
        if (order.orderId != orderId) revert OrderNotFound();
        if (order.requester != msg.sender) revert RequesterIsNotCaller();

        _safeTransferOut(
            config.collateralToken,
            order.requester,
            order.requesterCollateral
        );

        order.orderId = 0; // zero means no order
        unfilledOrderIds.remove(orderId);
        unfilledOrdersByRequester[order.requester].remove(orderId);

        emit OrderCancelled(
            orderId,
            order.requester,
            order.encodedPredictedOutcomes,
            order.requesterCollateral,
            order.responderCollateral
        );
    }

    function getUnfilledOrder(
        uint256 orderId
    ) external view returns (IPredictionStructs.LimitOrderData memory) {
        return unfilledOrders[orderId];
    }

    function getUnfilledOrderIds() external view returns (uint256[] memory) {
        return unfilledOrderIds.values();
    }

    function getUnfilledOrdersCount() external view returns (uint256) {
        return unfilledOrderIds.length();
    }

    function getUnfilledOrderByRequester(
        address requester
    ) external view returns (uint256[] memory) {
        return unfilledOrdersByRequester[requester].values();
    }

    // ============ View Functions ============

    function getConfig()
        external
        view
        returns (IPredictionStructs.Settings memory)
    {
        return config;
    }

    function getPrediction(
        uint256 tokenId
    )
        external
        view
        returns (IPredictionStructs.PredictionData memory predictionData)
    {
        uint256 predictionId = nftToPredictionId[tokenId];
        if (predictionId == 0 || !_isPrediction(predictionId))
            revert PredictionDoesNotExist();

        predictionData = predictions[predictionId];
    }

    /**
     * @notice Get all NFT IDs where `account` is the requester or responder
     * @dev Includes both unfilled and filled orders. Canceled orders are excluded (requester reset to address(0)).
     * @param account Address to filter by
     */
    function getOwnedPredictions(
        address account
    ) external view returns (uint256[] memory nftTokenIds) {
        // Get all nft by requester
        uint256[] memory requesterNftTokenIds = nftByRequesterAddress[account].values();
        uint256 requesterNftTokenIdsLength = requesterNftTokenIds.length;

        // Get all nft by responder
        uint256[] memory responderNftTokenIds = nftByResponderAddress[account].values();
        uint256 responderNftTokenIdsLength = responderNftTokenIds.length;

        uint256 totalCount = requesterNftTokenIdsLength + responderNftTokenIdsLength;
        nftTokenIds = new uint256[](totalCount);

        for (uint256 i = 0; i < totalCount; i++) {
            nftTokenIds[i] = i < requesterNftTokenIdsLength
                ? requesterNftTokenIds[i]
                : responderNftTokenIds[i - requesterNftTokenIdsLength];
        }
    }

    function getOwnedPredictionsCount(
        address account
    ) external view returns (uint256 count) {
        return
            nftByRequesterAddress[account].length() +
            nftByResponderAddress[account].length();
    }

    /**
     * @notice Get the total collateral deposited by a user
     * @param user The address of the user
     * @return The total amount of collateral deposited by the user
     */
    function getUserCollateralDeposits(
        address user
    ) external view returns (uint256) {
        return userCollateralDeposits[user];
    }

    // ============ Internal Functions ============

    /**
     * @dev Prevent transfers to PassiveLiquidityVault contracts
     * @notice This prevents prediction NFTs from being deposited into vaults
     */
    function _verifyTransfer(address , address to, uint256 ) internal virtual {
        if (_verifyTransferInProcess) revert TransferInProcess(); // Prevent reentrancy from transfer verification

        _verifyTransferInProcess = true;

        // Prevent transfers to PassiveLiquidityVault contracts
        if (_isPassiveLiquidityVault(to)) {
            revert TransferNotAllowed();
        }

        _verifyTransferInProcess = false;
    }

    /**
     * @dev Override ERC721 ownership update to keep auxiliary mappings and prediction parties in sync
     * @notice When an NFT is transferred, this updates:
     *   - The requester/responder in the prediction data
     *   - The role-based NFT ownership indexes (nftByRequesterAddress, nftByResponderAddress)
     *   - User collateral deposit tracking (for user-to-user transfers)
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);
        
        uint256 predictionId = nftToPredictionId[tokenId];
        if (predictionId == 0) {
            return from;
        }

        IPredictionStructs.PredictionData storage prediction = predictions[predictionId];

        bool isRequesterToken = tokenId == prediction.requesterNftTokenId;
        bool isResponderToken = tokenId == prediction.responderNftTokenId;

        // Keep role-based NFT ownership indexes in sync
        if (from != address(0)) {
            if (isRequesterToken) {
                nftByRequesterAddress[from].remove(tokenId);
            }
            if (isResponderToken) {
                nftByResponderAddress[from].remove(tokenId);
            }
        }
        if (to != address(0)) {
            if (isRequesterToken) {
                nftByRequesterAddress[to].add(tokenId);
            }
            if (isResponderToken) {
                nftByResponderAddress[to].add(tokenId);
            }
        }

        // Update prediction parties on transfers (not on burn)
        if (to != address(0)) {
            if (isRequesterToken) {
                prediction.requester = to;
            } else if (isResponderToken) {
                prediction.responder = to;
            }
        }

        // Move collateral deposit attribution on user-to-user transfers only
        if (from != address(0) && to != address(0)) {
            if (isRequesterToken) {
                userCollateralDeposits[from] -= prediction.requesterCollateral;
                userCollateralDeposits[to] += prediction.requesterCollateral;
            } else if (isResponderToken) {
                userCollateralDeposits[from] -= prediction.responderCollateral;
                userCollateralDeposits[to] += prediction.responderCollateral;
            }
        }

        // _verifyTransfer includes a reentrancy guard.
        // This prevents malicious contracts from manipulating prediction state during supportsInterface() callback
        if (to != address(0) && from != address(0)) { // Only verify for actual transfers (not mint or burns)
            _verifyTransfer(auth, to, tokenId);
        }

        return from;
    }

    function _isPrediction(uint256 id) internal view returns (bool) {
        return
            predictions[id].requester != address(0) &&
            predictions[id].responder != address(0);
    }

    /**
     * @notice Check if an address is a PassiveLiquidityVault contract
     * @dev Uses ERC-165 standard interface detection
     * @param addr The address to check
     * @return True if the address is a PassiveLiquidityVault contract
     */
    function _isPassiveLiquidityVault(address addr) internal view returns (bool) {
        // Check if the address is a contract
        if (addr.code.length == 0) {
            return false;
        }
        
        // Use ERC-165 standard interface detection
        try IERC165(addr).supportsInterface(type(IPassiveLiquidityVault).interfaceId) returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    /**
     * @dev Internal function to create a prediction after collateral has been transferred
     * @notice This is called by both mint() and fillOrder()
     * @param encodedPredictedOutcomes Encoded prediction outcomes for resolver validation
     * @param resolver Address of the resolver contract
     * @param requester Address of the requester (prediction creator)
     * @param responder Address of the responder (counterparty)
     * @param requesterCollateral Amount of collateral from requester
     * @param responderCollateral Amount of collateral from responder
     * @param refCode Reference code for tracking
     * @return requesterNftTokenId The NFT token ID for the requester
     * @return responderNftTokenId The NFT token ID for the responder
     */
    function _createPrediction(
        bytes memory encodedPredictedOutcomes,
        address resolver,
        address requester,
        address responder,
        uint256 requesterCollateral,
        uint256 responderCollateral,
        bytes32 refCode
    ) internal returns (uint256 requesterNftTokenId, uint256 responderNftTokenId) {
        // 1- Ask resolver if markets are OK
        (bool isValid, ) = IPredictionMarketResolver(resolver)
            .validatePredictionMarkets(encodedPredictedOutcomes);

        if (!isValid) revert InvalidMarketsAccordingToResolver();

        // 2- Set the prediction data
        uint256 predictionId = _predictionIdCounter++;

        requesterNftTokenId = _nftTokenIdCounter++;
        responderNftTokenId = _nftTokenIdCounter++;
        predictions[predictionId] = IPredictionStructs.PredictionData({
            predictionId: predictionId,
            requesterNftTokenId: requesterNftTokenId,
            responderNftTokenId: responderNftTokenId,
            requesterCollateral: requesterCollateral,
            responderCollateral: responderCollateral,
            encodedPredictedOutcomes: encodedPredictedOutcomes,
            resolver: resolver,
            requester: requester,
            responder: responder,
            settled: false,
            requesterWon: false
        });

        // 3- Update user collateral deposits tracking
        userCollateralDeposits[requester] += requesterCollateral;
        userCollateralDeposits[responder] += responderCollateral;

        // 4- Set NFT mappings before minting (needed for _update override)
        nftToPredictionId[requesterNftTokenId] = predictionId;
        nftToPredictionId[responderNftTokenId] = predictionId;

        // 5- Mint NFTs
        _safeMint(requester, requesterNftTokenId);
        _safeMint(responder, responderNftTokenId);

        // 6- Emit prediction minted event
        emit PredictionMinted(
            requester,
            responder,
            encodedPredictedOutcomes,
            requesterNftTokenId,
            responderNftTokenId,
            requesterCollateral,
            responderCollateral,
            requesterCollateral + responderCollateral,
            refCode
        );
    }

    /**
     * @dev Safe transfer in with fee-on-transfer protection
     * @notice Verifies the contract actually received the expected amount
     * @param token The ERC20 token address
     * @param from The address to transfer from
     * @param amount The expected amount to receive
     */
    function _safeTransferIn(
        address token,
        address from,
        uint256 amount
    ) internal {
        uint256 initialBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 finalBalance = IERC20(token).balanceOf(address(this));
        // For inbound transfers, ensure contract balance increased by at least the amount
        // This protects against fee-on-transfer tokens
        if (finalBalance < initialBalance + amount) revert TransferFailed();
    }

    /**
     * @dev Safe transfer out with balance verification
     * @notice Ensures the contract doesn't lose more than the intended amount
     * @param token The ERC20 token address
     * @param to The address to transfer to
     * @param amount The amount to send
     */
    function _safeTransferOut(
        address token,
        address to,
        uint256 amount
    ) internal {
        uint256 initialBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, amount);
        uint256 finalBalance = IERC20(token).balanceOf(address(this));
        // For outbound transfers, ensure contract balance decreased by no more than the amount
        if (finalBalance + amount < initialBalance) revert TransferFailed();
    }
}
