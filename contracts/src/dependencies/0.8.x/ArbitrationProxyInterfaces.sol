// SPDX-License-Identifier: MIT

pragma solidity ~0.8.9;

import {IArbitrable} from "@kleros/erc-792/contracts/IArbitrable.sol";
import {IEvidence} from "@kleros/erc-792/contracts/erc-1497/IEvidence.sol";

interface IHomeArbitrationProxy {
    /**
     * @notice To be emitted when the arbitration request acknowledgement is sent to the Foreign Chain.
     * @param _projectID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    event RequestAcknowledged(uint256 indexed _projectID, address indexed _requester);

    /**
     * @notice To be emitted when the dispute could not be created on the Foreign Chain.
     * @dev This will happen if the arbitration fee increases in between the arbitration request and acknowledgement.
     * @param _projectID The ID of the question.
     */
    event ArbitrationFailed(uint256 indexed _projectID);

    /**
     * @notice To be emitted when receiving the answer from the arbitrator.
     * @param _projectID The ID of the question.
     * @param _answer The answer from the arbitrator.
     */
    event ArbitratorAnswered(uint256 indexed _projectID, uint256 _answer);

    /**
     * @notice Requests arbitration for the given projectID.
     * @param _projectID The ID of the project.
     * @param _requester The address of the arbitration requester.
     */
    function receiveCreateDisputeRequest(uint256 _projectID, address _requester) external;

    /**
     * @notice Receives a failed attempt to request arbitration. TRUSTED.
     * @dev Currently this can happen only if the arbitration cost increased.
     * @param _projectID The ID of the question.
     */
    function receiveArbitrationFailure(uint256 _projectID) external;

    /**
     * @notice Receives the answer to a specified question. TRUSTED.
     * @param _projectID The ID of the question.
     * @param _answer The answer from the arbitrator.
     */
    function receiveArbitrationAnswer(uint256 _projectID, uint256 _answer) external;
}

interface IForeignArbitrationProxy is IArbitrable, IEvidence {
    /**
     * @notice Should be emitted when the arbitration is requested.
     * @param _projectID The ID of the question with the request for arbitration.
     * @param _requester The address of the arbitration requester.
     */
    event ArbitrationRequested(uint256 indexed _projectID, address indexed _requester);

    /**
     * @notice Should be emitted when the dispute is created.
     * @param _projectID The ID of the question with the request for arbitration.
     * @param _requester The address of the arbitration requester.
     * @param _disputeID The ID of the dispute.
     */
    event ArbitrationCreated(uint256 indexed _projectID, address indexed _requester, uint256 indexed _disputeID);

    /**
     * @notice Should be emitted when the arbitration is canceled by the Home Chain.
     * @param _projectID The ID of the question with the request for arbitration.
     * @param _requester The address of the arbitration requester.
     */
    event ArbitrationCanceled(uint256 indexed _projectID, address indexed _requester);

    /**
     * @notice Should be emitted when the dispute could not be created.
     * @dev This will happen if there is an increase in the arbitration fees
     * between the time the arbitration is made and the time it is acknowledged.
     * @param _projectID The ID of the question with the request for arbitration.
     * @param _requester The address of the arbitration requester.
     */
    event ArbitrationFailed(uint256 indexed _projectID, address indexed _requester);

    /**
     * @notice Requests arbitration for the given projectID.
     * @param _projectID The ID of the project.
     */
    function createDisputeForProjectRequest(uint256 _projectID) external payable;

    /**
     * @notice Receives the acknowledgement of the arbitration request for the given question and requester. TRUSTED.
     * @param _projectID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationAcknowledgement(uint256 _projectID, address _requester) external;

    /**
     * @notice Receives the cancelation of the arbitration request for the given question and requester. TRUSTED.
     * @param _projectID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationCancelation(uint256 _projectID, address _requester) external;

    /**
     * @notice Cancels the arbitration in case the dispute could not be created.
     * @param _projectID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function handleFailedDisputeCreation(uint256 _projectID, address _requester) external;

    /**
     * @notice Gets the fee to create a dispute.
     * @param _projectID the ID of the question.
     * @return The fee to create a dispute.
     */
    function getDisputeFee(uint256 _projectID) external view returns (uint256);
}
