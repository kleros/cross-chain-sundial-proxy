// SPDX-License-Identifier: MIT

pragma solidity >=0.7;

import {IArbitrable} from "@kleros/erc-792/contracts/IArbitrable.sol";
import {IEvidence} from "@kleros/erc-792/contracts/erc-1497/IEvidence.sol";

interface IHomeArbitrationProxy {
    /**
     * @notice To be emitted when the Realitio contract has been notified of an arbitration request.
     * @param _projectID The ID of the question.
     */
    event RequestReceived(uint256 indexed _projectID);

    /**
     * @notice To be emitted when arbitration request is rejected.
     * @dev This can happen if the current bond for the question is higher than maxPrevious
     * or if the question is already finalized.
     * @param _projectID The ID of the question.
     */
    event RequestRejected(uint256 indexed _projectID);

    /**
     * @notice To be emitted when the arbitration request acknowledgement is sent to the Foreign Chain.
     * @param _projectID The ID of the question.
     */
    event RequestAcknowledged(uint256 indexed _projectID);

    /**
     * @notice To be emitted when the arbitration request is canceled.
     * @param _projectID The ID of the question.
     */
    event RequestCanceled(uint256 indexed _projectID);

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
     */
    function receiveCreateDisputeRequest(uint256 _projectID) external;

    /**
     * @notice Handles arbitration request after it has been received and validated.
     * @dev This method exists because `receiveArbitrationRequest` is called by the Polygon Bridge
     * and cannot send messages back to it.
     * @param _projectId The ID of the project.
     */
    function handleReceivedRequest(uint256 _projectId) external;

    /**
     * @notice Handles arbitration request after it has been rejected.
     * @dev This method exists because `receiveArbitrationRequest` is called by the Polygon Bridge
     * and cannot send messages back to it.
     * @param _projectId The ID of the project.
     */
    function handleRejectedRequest(uint256 _projectId) external;

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
     * @param _disputeID The ID of the dispute.
     */
    event ArbitrationCreated(uint256 indexed _projectID, uint256 indexed _disputeID);

    /**
     * @notice Should be emitted when the dispute could not be created.
     * @dev This will happen if there is an increase in the arbitration fees
     * between the time the arbitration is made and the time it is acknowledged.
     * @param _projectID The ID of the question with the request for arbitration.
     */
    event ArbitrationFailed(uint256 indexed _projectID);

    /**
     * @notice Should be emitted when the arbitration is canceled by the Home Chain.
     * @param _projectID The ID of the question with the request for arbitration.
     */
    event ArbitrationCanceled(uint256 indexed _projectID);

    /**
     * @notice Requests arbitration for the given projectID.
     * @param _projectID The ID of the project.
     */
    function createDisputeForProjectRequest(uint256 _projectID) external payable;

    /**
     * @notice Receives the acknowledgement of the arbitration request for the given question. TRUSTED.
     * @param _projectID The ID of the question.
     */
    function receiveArbitrationAcknowledgement(uint256 _projectID) external;

    /**
     * @notice Receives the cancelation of the arbitration request for the given question. TRUSTED.
     * @param _projectID The ID of the question.
     */
    function receiveArbitrationCancelation(uint256 _projectID) external;

    /**
     * @notice Cancels the arbitration in case the dispute could not be created.
     * @param _projectID The ID of the question.
     */
    function handleFailedDisputeCreation(uint256 _projectID) external;

    /**
     * @notice Gets the fee to create a dispute.
     * @param _projectID the ID of the question.
     * @return The fee to create a dispute.
     */
    function getDisputeFee(uint256 _projectID) external view returns (uint256);
}
