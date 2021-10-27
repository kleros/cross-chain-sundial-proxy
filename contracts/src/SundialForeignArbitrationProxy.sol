// SPDX-License-Identifier: MIT

/**
 *  @authors: [@shalzz]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ~0.8.9;

import {IArbitrator} from "@kleros/erc-792/contracts/IArbitrator.sol";
import {FxBaseRootTunnel} from "./dependencies/FxBaseRootTunnel.sol";
import {IForeignArbitrationProxy, IHomeArbitrationProxy} from "./ArbitrationProxyInterfaces.sol";

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
        uint256 projectID; // The project ID for the dispute.
        address requester; // The address of the requester who managed to go through with the arbitration request.
    }

    /// @dev Tracks arbitration requests for project ID. arbitrationRequests[projectID][requester]
    mapping(uint256 => mapping(address => ArbitrationRequest)) public arbitrationRequests;

    /// @dev Associates dispute ID to project ID and the requester.
    mapping(uint256 => DisputeDetails) public disputeIDToDisputeDetails;

    /// @dev Whether a dispute has already been created for the given project ID or not.
    mapping(uint256 => bool) public projectIDToDisputeExists;

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
     * @notice Requests arbitration for the given projectID.
     * @param _projectID The ID of the project.
     */
    function createDisputeRequest(uint256 _projectID) external payable override {
        require(!projectIDToDisputeExists[_projectID], "Dispute already exists");

        ArbitrationRequest storage arbitration = arbitrationRequests[_projectID][msg.sender];
        require(arbitration.status == Status.None, "Arbitration already requested");

        uint256 arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);
        require(msg.value >= arbitrationCost, "Deposit value too low");

        arbitration.status = Status.Requested;
        arbitration.deposit = uint248(msg.value);

        bytes4 methodSelector = IHomeArbitrationProxy.createDisputeForProject.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, _projectID, msg.sender);
        _sendMessageToChild(data);

        emit ArbitrationRequested(_projectID, msg.sender);
    }

    /**
     * @notice Receives the acknowledgement of the arbitration request for the given project and requester. TRUSTED.
     * @param _projectID The ID of the project.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationAcknowledgement(uint256 _projectID, address _requester) public override onlyBridge {
        ArbitrationRequest storage arbitration = arbitrationRequests[_projectID][_requester];
        require(arbitration.status == Status.Requested, "Invalid arbitration status");

        uint256 arbitrationCost = arbitrator.arbitrationCost(arbitratorExtraData);

        if (arbitration.deposit >= arbitrationCost) {
            try
                arbitrator.createDispute{value: arbitrationCost}(NUMBER_OF_CHOICES_FOR_ARBITRATOR, arbitratorExtraData)
            returns (uint256 disputeID) {
                DisputeDetails storage disputeDetails = disputeIDToDisputeDetails[disputeID];
                disputeDetails.projectID = _projectID;
                disputeDetails.requester = _requester;

                projectIDToDisputeExists[_projectID] = true;

                // At this point, arbitration.deposit is guaranteed to be greater than or equal to the arbitration cost.
                uint256 remainder = arbitration.deposit - arbitrationCost;

                arbitration.status = Status.Created;
                arbitration.deposit = 0;

                if (remainder > 0) {
                    payable(_requester).send(remainder);
                }

                emit ArbitrationCreated(_projectID, _requester, disputeID);
                emit Dispute(arbitrator, disputeID, META_EVIDENCE_ID, uint256(_projectID));
            } catch {
                arbitration.status = Status.Failed;
                emit ArbitrationFailed(_projectID, _requester);
            }
        } else {
            arbitration.status = Status.Failed;
            emit ArbitrationFailed(_projectID, _requester);
        }
    }

    /**
     * @notice Receives the cancelation of the arbitration request for the given question and requester. TRUSTED.
     * @param _projectID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationCancelation(uint256 _projectID, address _requester) public override onlyBridge {
        ArbitrationRequest storage arbitration = arbitrationRequests[_projectID][_requester];
        require(arbitration.status == Status.Requested, "Invalid arbitration status");
        uint256 deposit = arbitration.deposit;

        delete arbitrationRequests[_projectID][_requester];

        payable(_requester).send(deposit);

        emit ArbitrationCanceled(_projectID, _requester);
    }

    /**
     * @notice Cancels the arbitration in case the dispute could not be created.
     * @param _projectID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function handleFailedDisputeCreation(uint256 _projectID, address _requester) external override {
        ArbitrationRequest storage arbitration = arbitrationRequests[_projectID][_requester];
        require(arbitration.status == Status.Failed, "Invalid arbitration status");
        uint256 deposit = arbitration.deposit;

        delete arbitrationRequests[_projectID][_requester];

        payable(_requester).send(deposit);

        bytes4 methodSelector = IHomeArbitrationProxy.receiveArbitrationFailure.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, _projectID, _requester);
        _sendMessageToChild(data);

        emit ArbitrationCanceled(_projectID, _requester);
    }

    /**
     * @notice Rules a specified dispute.
     * @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     * @param _ruling The ruling given by the arbitrator.
     */
    function rule(uint256 _disputeID, uint256 _ruling) external override onlyArbitrator {
        DisputeDetails storage disputeDetails = disputeIDToDisputeDetails[_disputeID];
        uint256 projectID = disputeDetails.projectID;
        address requester = disputeDetails.requester;

        ArbitrationRequest storage arbitration = arbitrationRequests[projectID][requester];
        require(arbitration.status == Status.Created, "Invalid arbitration status");

        arbitration.status = Status.Ruled;

        bytes4 methodSelector = IHomeArbitrationProxy.receiveArbitrationAnswer.selector;
        bytes memory data = abi.encodeWithSelector(methodSelector, projectID, answer);
        _sendMessageToChild(data);

        emit Ruling(arbitrator, _disputeID, _ruling);
    }

    /**
     * @notice Gets the fee to create a dispute.
     * @return The fee to create a dispute.
     */
    function getDisputeFee(
        uint256 /* _projectID */
    ) external view override returns (uint256) {
        return arbitrator.arbitrationCost(arbitratorExtraData);
    }

    function _processMessageFromChild(bytes memory _data) internal override {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(this).call(_data);
        require(success, "Failed to call contract");
    }
}
