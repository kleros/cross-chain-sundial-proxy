# @kleros/cross-chain-realitio-contracts

Smart contracts to enable cross-chain arbitration for Realitio (Reality.eth)

## Deployed Addresses

### Home Proxy

- Mumbai: [deployment](deployments/mumbai/RealitioHomeArbitrationProxy.json#L2).
- Polygon: [deployment](deployments/polygon/RealitioHomeArbitrationProxy.json#L2).

### Foreign Proxy

- goerli: [deployment](deployments/goerli/RealitioForeignArbitrationProxy.json#L2).
- Mainnet: [deployment](deployments/mainnet/RealitioForeignArbitrationProxy.json#L2).

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

For `Kovan` or `Mainnet` you can use the `etherscan-verify` command from `hardhat`:

```bash
yarn hardhat --network <mumbai|polygon|goerli|mainnet> etherscan-verify
```

_Note_: For Polygon Mainnet and Mumbai testnet a separate ETHERSCAN_API_KEY is required created on https://polygonscan.com
