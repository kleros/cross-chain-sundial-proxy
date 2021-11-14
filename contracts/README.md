# Cross-Chain Sundial Proxy

Enables cross-chain arbitration for Sundial on Polygon using Kleros as arbitrator.

We use Polygon Fx-Portal mechanism for cross chain communication.
You can find out more about how Fx-Portal works from here:

- https://docs.polygon.technology/docs/develop/l1-l2-communication/fx-portal/
- https://github.com/fx-portal/contracts

## High-Level Flow Description

1. Alice requests arbitration on the main chain paying the arbitration fee to the ETH proxy
1. The ETH proxy communicates the request to the Polygon proxy through the Fx-Portal.
1. The Polygon tries to notify Sundial of the arbitration request and forwards the `max_previous` value:
   1. If the bond has not changed, the arbitration request will be accepted.
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

### Home Proxy

- Mumbai: [deployment](deployments/mumbai/DAISO.json#L2).
- Polygon: [deployment](deployments/polygon/DAISO.json#L2).

### Foreign Proxy

- goerli: [deployment](deployments/goerli/SundialForeignArbitrationProxy.json#L2).
- Mainnet: [deployment](deployments/mainnet/SundialForeignArbitrationProxy.json#L2).

## Contributing

### Install Dependencies

```bash
yarn install
```

### Run Tests

```bash
yarn test
```

### Compile the Contracts

```bash
yarn build
```

### Run Linter on Files

```bash
yarn lint
```

### Fix Linter Issues on Files

```bash
yarn fix
```

### Deploy Instructions

**IMPORTANT:** new versions of any of the contracts require publishing **both** Home and Foreign proxies, as their binding is immutable.

**NOTICE:** the commands bellow work only if you are inside the `contracts/` directory.

#### 0. Set the Environment Variables

Copy `.env.example` file as `.env` and edit it accordingly.

```bash
cp .env.example .env
```

The following env vars are required:

- `PRIVATE_KEY`: the private key of the deployer account used for xDAI, Sokol and Kovan.
- `MAINNET_PRIVATE_KEY`: the private key of the deployer account used for Mainnet.
- `INFURA_API_KEY`: the API key for infura.

The ones below are optional:

- `ETHERSCAN_API_KEY`: used only if you wish to verify the source of the newly deployed contracts on Etherscan.

#### 1. Update the Constructor Parameters (optional)

If some of the constructor parameters (such as the Meta Evidence) needs to change, you need to update the files in the `deploy/` directory.

#### 2. Deploy the Proxies

```bash
yarn deploy:staging # to deploy to Mumbai/Goerli
# yarn deploy:production # to deploy to Polygon/Mainnet
```

The deployed addresses should be output to the screen after the deployment is complete.
If you miss that, you can always go to the `deployments/<network>` directory and look for the respective file.

#### 3. Verify the Source Code for Contracts

This must be done for each network separately.

For `Goerli` or `Mainnet` you can use the `etherscan-verify` command from `hardhat`:

```bash
yarn hardhat --network <mumbai|polygon|goerli|mainnet> etherscan-verify
```

_Note_: For Polygon Mainnet and Mumbai testnet a separate ETHERSCAN_API_KEY is required created on https://polygonscan.com
