const getContractAddress = require("../deploy-helpers/getContractAddress");

const FOREIGN_CHAIN_IDS = [5];
const paramsByChainId = {
  5: {
    checkpointManager: "0x2890bA17EfE978480615e330ecB65333b880928e",
    fxRoot: "0x3d1d3E34f7fB6D26245E6640E1c50710eFFf15bA",
    arbitrator: "0xCF5F227De666AF96Cf671Cd5727247A427b28b7A", // SimplePermissionlessArbitrator
    arbitratorExtraData:
      "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    metaEvidence: "/ipfs/Qmc2cpRZgT5PmR4ZikDsVG54xejKF62qSBBnYf4R5bpiNH/realitio.json",
    termsOfService: "/ipfs/Qmf67KPWvFLSQEczsb8Kh9HtGUevNtSSVELqTS8yTe95GW/omen-rules.pdf",
  },
  1: {
    checkpointManager: "0x86e4dc95c7fbdbf52e33d563bbdb00823894c287",
    fxRoot: "0xfe5e5D361b2ad62c541bAb87C45a0B9B018389a2",
    arbitrator: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069", // KlerosLiquid address
    arbitratorExtraData:
      "0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f4",
    metaEvidence: "/ipfs/Qmc6bWTzPMFeRx9VWHwnDpDXfimwNsvnEgJo3gymg37rRd/realitio.json",
    termsOfService: "/ipfs/QmZM12kkguXFk2C94ykrKpambt4iUVKsVsxGxDEdLS68ws/omen-rules.pdf",
  },
};

async function deployForeignProxy({ deployments, getNamedAccounts, getChainId, ethers, config }) {
  const { deploy } = deployments;
  const { providers } = ethers;

  const accounts = await getNamedAccounts();
  const { deployer, counterPartyDeployer } = accounts;
  const chainId = await getChainId();

  const homeNetworks = {
    5: config.networks.mumbai,
    1: config.networks.polygon,
  };
  const { url } = homeNetworks[chainId];
  const homeChainProvider = new providers.JsonRpcProvider(url);
  const nonce = await homeChainProvider.getTransactionCount(counterPartyDeployer);

  const { checkpointManager, fxRoot, arbitrator, arbitratorExtraData, metaEvidence, termsOfService } =
    paramsByChainId[chainId];

  // Foreign Proxy deploy will happen AFTER the Home Proxy deploy, so we need to subtract 1 from the nonce
  const homeProxyAddress = getContractAddress(counterPartyDeployer, nonce - 1);

  const foreignProxy = await deploy("RealitioForeignArbitrationProxy", {
    from: deployer,
    args: [checkpointManager, fxRoot, homeProxyAddress, arbitrator, arbitratorExtraData, metaEvidence, termsOfService],
    gas: 8000000,
  });

  console.log("Home Proxy:", homeProxyAddress);
  console.log("Foregin Proxy:", foreignProxy.address);
}

deployForeignProxy.tags = ["ForeignChain"];
deployForeignProxy.skip = async ({ getChainId }) => !FOREIGN_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployForeignProxy;
