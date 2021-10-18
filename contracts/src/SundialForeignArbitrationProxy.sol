// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shalzz]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.7.2;

import {IArbitrator} from "@kleros/erc-792/contracts/IArbitrator.sol";
import {FxBaseRootTunnel} from "./dependencies/FxBaseRootTunnel.sol";
import {IForeignArbitrationProxy, IHomeArbitrationProxy} from "./ArbitrationProxyInterfaces.sol";
import {IDAISO} from "./dependencies/IDAISO.sol";

/**
 * @title Arbitration proxy for Realitio on Ethereum side (A.K.A. the Foreign Chain).
 * @dev This contract is meant to be deployed to the Ethereum chains where Kleros is deployed.
 */
contract SundialForeignArbitrationProxy is IForeignArbitrationProxy, FxBaseRootTunnel {
    /// @dev The address of the arbitrator. TRUSTED.
    IArbitrator public immutable arbitrator;

    /// @dev The extra data used to raise a dispute in the arbitrator.
    bytes public arbitratorExtraData;

    /// @dev The path for the Terms of Service for Kleros as an arbitrator for Realitio.
    string public termsOfService;

    /// @dev The ID of the MetaEvidence for disputes.
    uint256 public constant META_EVIDENCE_ID = 0;

    /// @dev The number of choices for the arbitrator. Kleros is currently able to provide ruling values of up to 2^256 - 2.
    uint256 public constant NUMBER_OF_CHOICES_FOR_ARBITRATOR = type(uint256).max - 1;

    enum Status {
        None,
        Requested,
        Created,
        Ruled,
        Failed
    }

    struct ArbitrationRequest {
        Status status; // Status of the arbitration.
        uint248 deposit; // The deposit paid by the requester at the time of the arbitration.
    }

    struct DisputeDetails {
        bytes32 questionID; // The question ID for the dispute.
        address requester; // The address of the requester who managed to go through with the arbitration request.
    }

    /// @dev Tracks arbitration requests for question ID. arbitrationRequests[questionID][requester]
    mapping(bytes32 => mapping(address => ArbitrationRequest)) public arbitrationRequests;

    /// @dev Associates dispute ID to question ID and the requester. disputeIDToDisputeDetails[disputeID] -> {questionID, requester}
    mapping(uint256 => DisputeDetails) public disputeIDToDisputeDetails;

    /// @dev Whether a dispute has already been created for the given question ID or not. questionIDToDisputeExists[questionID]
    mapping(bytes32 => bool) public questionIDToDisputeExists;

    modifier onlyArbitrator() {
        require(msg.sender == address(arbitrator), "Only arbitrator allowed");
        _;
    }

    modifier onlyBridge() {
        require(msg.sender == address(this), "Can only be called via bridge");
        _;
    }

    /**
     * @notice Creates an arbitration proxy on the foreign chain.
     * @param _checkpointManager For Polygon FX-portal bridge
     * @param _fxRoot Address of the FxRoot contract of the Polygon bridge
     * @param _homeProxy The address of the proxy.
     * @param _arbitrator Arbitrator contract address.
     * @param _arbitratorExtraData The extra data used to raise a dispute in the arbitrator.
     * @param _metaEvidence The URI of the meta evidence file.
     * @param _termsOfService The path for the Terms of Service for Kleros as an arbitrator for Realitio.
     */
    constructor(
        address _checkpointManager,
        address _fxRoot,
        address _homeProxy,
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        string memory _metaEvidence,
        string memory _termsOfService
    ) FxBaseRootTunnel(_checkpointManager, _fxRoot, _homeProxy) {
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        termsOfService = _termsOfService;

        emit MetaEvidence(META_EVIDENCE_ID, _metaEvidence);
    }

    /**
     * @notice Requests arbitration for the given question and contested answer.
     * @param _questionID The ID of the question.
     * @param _maxPrevious The maximum value of the current bond for the question. The arbitration request will get rejected if the current bond is greater than _maxPrevious. If set to 0, _maxPrevious is ignored.
     */
    function requestArbitration(bytes32 _questionID, uint256 _maxPrevious) external payable override {
        require(!questionIDToDisputeExists[_questionID], "Dispute already exists");

        ArbitrationRequest storage arbitration = arbitrationRequests[_questionID][msg.sender];
        require(arbitration.status == Status.None, "Arbitration already requested");

        uint256 arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= arbitrationCost, "Deposit value too low");

        arbitration.status = Status.Requested;
        arbitration.deposit = uint248(msg.value);

        bytes4 methodSelector = IHomeArbitrationProxy(0).receiveArbitrationRequest.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, _questionID, msg.sender, _maxPrevious);
        _sendMessageToChild(data);

        emit ArbitrationRequested(_questionID, msg.sender, _maxPrevious);
    }

    /**
     * @notice Receives the acknowledgement of the arbitration request for the given question and requester. TRUSTED.
     * @param _questionID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationAcknowledgement(bytes32 _questionID, address _requester) public override onlyBridge {
        ArbitrationRequest storage arbitration = arbitrationRequests[_questionID][_requester];
        require(arbitration.status == Status.Requested, "Invalid arbitration status");

        uint256 arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);

        if (arbitration.deposit >= arbitrationCost) {
            try
                arbitrator.createDispute{value: arbitrationCost}(NUMBER_OF_CHOICES_FOR_ARBITRATOR, arbitratorExtraData)
            returns (uint256 disputeID) {
                DisputeDetails storage disputeDetails = disputeIDToDisputeDetails[disputeID];
                disputeDetails.questionID = _questionID;
                disputeDetails.requester = _requester;

                questionIDToDisputeExists[_questionID] = true;

                // At this point, arbitration.deposit is guaranteed to be greater than or equal to the arbitration cost.
                uint256 remainder = arbitration.deposit - arbitrationCost;

                arbitration.status = Status.Created;
                arbitration.deposit = 0;

                if (remainder > 0) {
                    payable(_requester).send(remainder);
                }

                emit ArbitrationCreated(_questionID, _requester, disputeID);
                emit Dispute(arbitrator, disputeID, META_EVIDENCE_ID, uint256(_questionID));
            } catch {
                arbitration.status = Status.Failed;
                emit ArbitrationFailed(_questionID, _requester);
            }
        } else {
            arbitration.status = Status.Failed;
            emit ArbitrationFailed(_questionID, _requester);
        }
    }

    /**
     * @notice Receives the cancelation of the arbitration request for the given question and requester. TRUSTED.
     * @param _questionID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationCancelation(bytes32 _questionID, address _requester) public override onlyBridge {
        ArbitrationRequest storage arbitration = arbitrationRequests[_questionID][_requester];
        require(arbitration.status == Status.Requested, "Invalid arbitration status");
        uint256 deposit = arbitration.deposit;

        delete arbitrationRequests[_questionID][_requester];

        payable(_requester).send(deposit);

        emit ArbitrationCanceled(_questionID, _requester);
    }

    /**
     * @notice Cancels the arbitration in case the dispute could not be created.
     * @param _questionID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function handleFailedDisputeCreation(bytes32 _questionID, address _requester) external override {
        ArbitrationRequest storage arbitration = arbitrationRequests[_questionID][_requester];
        require(arbitration.status == Status.Failed, "Invalid arbitration status");
        uint256 deposit = arbitration.deposit;

        delete arbitrationRequests[_questionID][_requester];

        payable(_requester).send(deposit);

        bytes4 methodSelector = IHomeArbitrationProxy(0).receiveArbitrationFailure.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, _questionID, _requester);
        _sendMessageToChild(data);

        emit ArbitrationCanceled(_questionID, _requester);
    }

    /**
     * @notice Rules a specified dispute.
     * @dev Note that 0 is reserved for "Unable/refused to arbitrate" and we map it to `bytes32(-1)` which has a similar meaning in Realitio.
     * @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     * @param _ruling The ruling given by the arbitrator.
     */
    function rule(uint256 _disputeID, uint256 _ruling) external override onlyArbitrator {
        DisputeDetails storage disputeDetails = disputeIDToDisputeDetails[_disputeID];
        bytes32 questionID = disputeDetails.questionID;
        address requester = disputeDetails.requester;

        ArbitrationRequest storage arbitration = arbitrationRequests[questionID][requester];
        require(arbitration.status == Status.Created, "Invalid arbitration status");

        arbitration.status = Status.Ruled;

        // Realitio ruling is shifted by 1 compared to Kleros.
        // For example, jurors refusing to rule is `0` on Kleros, but uint(-1) on Realitio.
        // The line below could be written more explicitly as:
        //     bytes32(_ruling == 0 ? uint256(-1) : _ruling - 1)
        // But the way it is written saves some gas.
        bytes32 answer = bytes32(_ruling - 1);

        bytes4 methodSelector = IHomeArbitrationProxy(0).receiveArbitrationAnswer.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, questionID, answer);
        _sendMessageToChild(data);

        emit Ruling(arbitrator, _disputeID, _ruling);
    }

    /**
     * @notice Gets the fee to create a dispute.
     * @return The fee to create a dispute.
     */
    function getDisputeFee(
        bytes32 /* _questionID */
    ) external view override returns (uint256) {
        return arbitrator.arbitrationCost(arbitratorExtraData);
    }

    function _processMessageFromChild(bytes memory _data) internal override {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(this).call(_data);
        require(success, "Failed to call contract");
    }
}
