require("dotenv/config");
const { task } = require("hardhat/config");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-web3");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("./tasks/link-proxies");

// This is a sample Buidler task. To learn how to create your own go to
// https://buidler.dev/guides/create-task.html
task("accounts", "Prints the list of accounts", async (_, { ethers }) => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.getAddress());
  }
});

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./src",
  },
  networks: {
    mumbai: {
      chainId: 80001,
      url: `https://rpc-mumbai.maticvigil.com/v1/${process.env.MATIC_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    polygon: {
      chainId: 137,
      url: `https://rpc-mainnet.maticvigil.com/v1/${process.env.MATIC_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    sokol: {
      chainId: 77,
      url: "https://sokol.poa.network/",
      accounts: [process.env.PRIVATE_KEY],
    },
    xdai: {
      chainId: 100,
      url: "https://rpc.xdaichain.com/",
      accounts: [process.env.PRIVATE_KEY, process.env.MAINNET_PRIVATE_KEY],
    },
    goerli: {
      chainId: 5,
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    kovan: {
      chainId: 42,
      url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    mainnet: {
      chainId: 1,
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.MAINNET_PRIVATE_KEY, process.env.PRIVATE_KEY],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    counterPartyDeployer: {
      default: 0,
      xdai: 1,
      mainnet: 1,
    },
  },
};
