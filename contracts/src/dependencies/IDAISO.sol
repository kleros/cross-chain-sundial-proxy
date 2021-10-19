// SPDX-License-Identifier: MIT

pragma solidity ~0.8.9;

interface IDAISO {
    /* DAISO */
    event CreateProject(uint256 indexed projectId, address indexed sender, string hash);

    event CreateStream(uint256 indexed streamId, address indexed sender);

    event WithdrawFromProject(uint256 indexed projectId, address indexed sender, uint256 withdrawTime, uint256 amount);

    event CancelProject(
        uint256 indexed projectId,
        uint256 indexed streamId,
        address sender,
        uint256 investSellBalance,
        uint256 investFundBalance,
        uint256 refunds,
        uint256 cancelTime
    );

    event CancelProjectForProject(uint256 indexed projectId, uint256 projectSellBalance);

    /* DAISOForInvest */
    event WithdrawFromInvest(
        uint256 indexed streamId,
        uint256 indexed projectId,
        address indexed sender,
        uint256 withdrawTime,
        uint256 amount
    );

    event CancelStream(
        uint256 indexed projectId,
        uint256 indexed streamId,
        address indexed sender,
        uint256 investSellBalance,
        uint256 investFundBalance,
        uint256 cancelTime
    );

    event Arbitration(
        uint256 indexed projectId,
        uint256 indexed _metaEvidenceID,
        string _metaEvidence,
        address project,
        address indexed invest,
        uint256 arbitrationCost,
        uint256 reclaimedAt
    );

    function createDisputeForProject(uint256 projectId) external nonReentrant returns (bool);

    /**
     * @notice Receives a failed attempt to request arbitration. TRUSTED.
     * @dev Currently this can happen only if the arbitration cost increased.
     * @param _questionID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function receiveArbitrationFailure(bytes32 _questionID, address _requester) external;

    /**
     * @notice Receives the answer to a specified question. TRUSTED.
     * @param _questionID The ID of the question.
     * @param _answer The answer from the arbitrator.
     */
    function receiveArbitrationAnswer(bytes32 _questionID, bytes32 _answer) external;
}
