pragma solidity ^0.7.2;

import {IArbitrator} from "@kleros/erc-792/contracts/IArbitrator.sol";
import {RealitioForeignArbitrationProxy} from "../RealitioForeignArbitrationProxy.sol";

/**
 * @title Arbitration proxy for Realitio on Ethereum side (A.K.A. the Foreign Chain).
 * @dev This contract is meant to be deployed to the Ethereum chains where Kleros is deployed.
 */
contract MockForeignArbitrationProxy is RealitioForeignArbitrationProxy {
    constructor(
        address _checkpointManager,
        address _fxRoot,
        address _homeProxy,
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        string memory _metaEvidence,
        string memory _termsOfService
    )
        RealitioForeignArbitrationProxy(
            _checkpointManager,
            _fxRoot,
            _homeProxy,
            _arbitrator,
            _arbitratorExtraData,
            _metaEvidence,
            _termsOfService
        )
    {}

    // Helper method to test _processMessageFromChild directly without having to call internal
    // _validateAndExtractMessage
    function processMessageFromChild(bytes memory message) public {
        _processMessageFromChild(message);
    }
}
