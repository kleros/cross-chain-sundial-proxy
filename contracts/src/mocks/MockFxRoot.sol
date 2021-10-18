// SPDX-License-Identifier: MIT
pragma solidity ^0.7.2;

interface IFxStateSender {
    function sendMessageToChild(address _receiver, bytes calldata _data) external;
}

// IFxMessageProcessor represents interface to process message
interface IFxMessageProcessor {
    function processMessageFromRoot(
        uint256 stateId,
        address rootMessageSender,
        bytes calldata data
    ) external;
}

/**
 * @title FxRoot root contract for fx-portal
 */
contract MockFxRoot is IFxStateSender {
    address public fxChild;

    event NewFxMessage(address rootMessageSender, address receiver, bytes data);

    function setFxChild(address _fxChild) public {
        require(fxChild == address(0x0));
        fxChild = _fxChild;
    }

    function sendMessageToChild(address _receiver, bytes calldata _data) public override {
        // Directly call the child function.
        emit NewFxMessage(msg.sender, _receiver, _data);
        IFxMessageProcessor(_receiver).processMessageFromRoot(0, msg.sender, _data);
    }
}
