# Cross-Chain Sundial Proxy

Enables cross-chain arbitration for Sundial on Polygon using Kleros as arbitrator.

We use Polygon Fx-Portal mechanism for cross chain communication.
You can find out more about how Fx-Portal works from here:

- https://docs.polygon.technology/docs/develop/l1-l2-communication/fx-portal/
- https://github.com/fx-portal/contracts

## High-Level Flow Description

1. Alice requests arbitration on the main chain paying the arbitration fee to the ETH proxy
1. The ETH proxy communicates the request to the Polygon proxy through the Fx-Portal.
1. The Polygon tries to notify Sundial of the arbitration request:
   1. If the Project ID is valid and reclaimation period has not passed, the arbitration request will be accepted.
      1. Notify the ETH proxy through the Fx-Portal.
      1. Call the receiveMessage function with Polygon Tx hash on Ethereum
   1. Otherwise, if it changed then:
      1. Notify the ETH proxy through the Fx-Portal.
      1. Call the receiveMessage function with Polygon Tx hash on Ethereum
      1. The ETH proxy refunds Alice. **END**
1. In the mean time while Sundial was being notified of the arbitration request, the arbitration fees might have changed:
   1. If the fees stayed the same (most common case) then:
      1. Create a dispute on Kleros Court.
   1. If the fees have decreased then:
      1. Create a dispute on Kleros Court.
      1. Refund Alice of the difference.
   1. If the fees have increased, then the arbitration request will fail:
      1. Refund Alice of the value paid so far.
      1. The ETH proxy notifies the Polygon proxy through the Fx-Portal that the arbitration failed to be created.
      1. The Polygon proxy notifies Sundial of the failed arbitration. **END**
1. The Kleros court gives a ruling. It is relayed to the Polygon proxy through the Fx-Portal.
   1. If the ruling is the current answer, Bob, the last answerer, is the winner. **END**
   1. If it is not, Alice is the winner. **END**

## Relaying Messages from Polygon to Ethereum

Polygon-to-Ethereum communication requires manual intervention, the exact mechanism
for it is described [here](https://github.com/UMAprotocol/protocol/tree/master/packages/fx-tunnel-relayer#why-is-a-bot-needed-to-relay-messages-from-polygon-to-ethereum)

There is also a [fx-tunnel-relayer](https://github.com/UMAprotocol/protocol/tree/master/packages/fx-tunnel-relayer) bot developed by the UMAProtocol for this purpose that can either be
used as is or as a reference for our own bot.

## Deployed Addresses

See [contracts/README.md](contracts/README.md#deployed-addresses).

## Contributing

### Repo Structure

Each directory at the root of this repository contains code for each individual part that enables this integration:

- **`contracts/`**: Smart contracts to enable cross-chain arbitration for Sundial. [Learn more](contracts/README.md).
