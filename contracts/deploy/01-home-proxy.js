const getContractAddress = require("../deploy-helpers/getContractAddress");

const HOME_CHAIN_IDS = [80001];
const paramsByChainId = {
  80001: {
    fxChild: "0xCf73231F28B7331BBe3124B907840A94851f9f11",
  },
  137: {
    fxChild: "0x8397259c983751DAf40400790063935a11afa28a",
  },
};

async function deployHomeProxy({ deployments, getNamedAccounts, getChainId, ethers, config }) {
  const { deploy } = deployments;
  const { providers } = ethers;

  const accounts = await getNamedAccounts();
  const { deployer, counterPartyDeployer } = accounts;
  const chainId = await getChainId();

  const foreignNetworks = {
    80001: config.networks.goerli,
    137: config.networks.mainnet,
  };
  const { url } = foreignNetworks[chainId];
  const foreignChainProvider = new providers.JsonRpcProvider(url);
  const nonce = await foreignChainProvider.getTransactionCount(counterPartyDeployer);

  const { fxChild } = paramsByChainId[chainId];

  // Foreign proxy deploy will happen AFTER this, so the nonce on that account should be the current transaction count
  const foreignProxyAddress = getContractAddress(counterPartyDeployer, nonce);

  const homeProxy = await deploy("DAISO", {
    from: deployer,
    gas: 8000000,
    args: [fxChild, foreignProxyAddress],
  });

  console.log("Home Proxy:", homeProxy.address);
  console.log("Foreign Proxy:", foreignProxyAddress);
}

deployHomeProxy.tags = ["HomeChain"];
deployHomeProxy.skip = async ({ getChainId }) => !HOME_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployHomeProxy;
