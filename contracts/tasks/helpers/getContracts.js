async function getContracts({ env, ethers }) {
  const networksByEnv = {
    staging: {
      home: {
        name: "sokol",
        url: "https://sokol.poa.network",
      },
      foreign: {
        name: "kovan",
        url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
      },
    },
    production: {
      home: {
        name: "xdai",
        url: "https://rpc.xdaichain.com/",
      },
      foreign: {
        name: "mainnet",
        url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      },
    },
  };

  const networks = networksByEnv[env];

  if (!networks) {
    throw new Error(`Invalid env "${env}"`);
  }

  const RealitioHomeArbitrationProxy = require(`../../deployments/${networks.home.name}/RealitioHomeArbitrationProxy.json`);
  const homeProvider = new ethers.providers.JsonRpcProvider(networks.home.url);
  const homeWallet = new ethers.Wallet(process.env.PRIVATE_KEY, homeProvider);
  const homeProxy = await ethers.getContractAt(
    RealitioHomeArbitrationProxy.abi,
    RealitioHomeArbitrationProxy.address,
    homeWallet
  );

  const RealitioForeignArbitrationProxy = require(`../../deployments/${networks.foreign.name}/RealitioForeignArbitrationProxy.json`);
  const foreignProvider = new ethers.providers.JsonRpcProvider(networks.foreign.url);
  const foreignWallet = new ethers.Wallet(
    env === "staging" ? process.env.PRIVATE_KEY : process.env.MAINNET_PRIVATE_KEY,
    foreignProvider
  );
  const foreignProxy = await ethers.getContractAt(
    RealitioForeignArbitrationProxy.abi,
    RealitioForeignArbitrationProxy.address,
    foreignWallet
  );

  return { homeProxy, foreignProxy };
}

module.exports = getContracts;
