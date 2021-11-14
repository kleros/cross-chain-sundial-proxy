pragma solidity ^0.7.6;

import {IArbitrator} from "@kleros/erc-792/contracts/IArbitrator.sol";
import {SundialForeignArbitrationProxyWithAppeals} from "../SundialForeignArbitrationProxyWithAppeals.sol";

contract MockForeignArbitrationProxyWithAppeals is SundialForeignArbitrationProxyWithAppeals {
    constructor(
        address _checkpointManager,
        address _fxRoot,
        address _homeProxy,
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        string memory _metaEvidence,
        string memory _termsOfService,
        uint256 _winnerMultiplier,
        uint256 _loserMultiplier,
        uint256 _loserAppealPeriodMultiplier
    )
        SundialForeignArbitrationProxyWithAppeals(
            _checkpointManager,
            _fxRoot,
            _homeProxy,
            _arbitrator,
            _arbitratorExtraData,
            _metaEvidence,
            _termsOfService,
            _winnerMultiplier,
            _loserMultiplier,
            _loserAppealPeriodMultiplier
        )
    {}

    // Helper method to test _processMessageFromChild directly without having to call internal
    // _validateAndExtractMessage
    function processMessageFromChild(bytes memory message) public {
        _processMessageFromChild(message);
    }
}
