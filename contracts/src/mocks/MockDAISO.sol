pragma solidity ~0.8.9;

import {DAISO} from "../DAISO.sol";

interface IMockFxBaseRootTunnel {
    function processMessageFromChild(bytes memory message) external;
}

/**
 * @title Arbitration proxy for Realitio on Ethereum side (A.K.A. the Foreign Chain).
 * @dev This contract is meant to be deployed to the Ethereum chains where Kleros is deployed.
 */
contract MockDAISO is DAISO {
    IMockFxBaseRootTunnel foreignProxy;

    constructor(address _fxChild, address _foreignProxy) DAISO(_fxChild, _foreignProxy) {
        foreignProxy = IMockFxBaseRootTunnel(_foreignProxy);
    }

    // Overridden to directly call the foreignProxy under test
    // instead of emitting an event
    function _sendMessageToRoot(bytes memory message) internal override {
        foreignProxy.processMessageFromChild(message);
    }
}
