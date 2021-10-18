require("dotenv/config");
const { task } = require("hardhat/config");
const prompts = require("prompts");
const getContracts = require("./helpers/getContracts");

task("link-proxies", "Links cross-chain proxies together", async ({ env }, { ethers }) => {
  const { homeProxy, foreignProxy } = await getContracts({ env, ethers });

  await setHomeProxy();
  await setForeignProxy();

  async function setForeignProxy() {
    if ((await homeProxy.foreignProxy()) === foreignProxy.address) {
      console.log(
        `Foreign Proxy address on Home Proxy (${homeProxy.address}) is the same: ${foreignProxy.address}. Skipping...`
      );
      return;
    }

    const response = await prompts({
      type: "confirm",
      name: "value",
      message: `Do you want to set the Foreign Proxy address on the Home Proxy Contract to ${foreignProxy.address}? `,
    });

    if (!response.value) {
      console.log("Aborting...");
      return;
    }

    const foreignChainIdByEnv = {
      staging: 42,
      production: 1,
    };

    const tx = await homeProxy.setForeignProxy(foreignProxy.address, foreignChainIdByEnv[env]);

    await tx.wait();
    console.log("Foreign Proxy address successfuly set on Home Proxy!");
  }

  async function setHomeProxy() {
    if ((await foreignProxy.homeProxy()) === homeProxy.address) {
      console.log(
        `Home Proxy address on Foreign Proxy (${foreignProxy.address}) is the same: ${homeProxy.address}. Skipping...`
      );
      return;
    }

    const response = await prompts({
      type: "confirm",
      name: "value",
      message: `Do you want to set the Home Proxy address on the Foreign Proxy Contract to ${homeProxy.address}? `,
    });

    if (!response.value) {
      console.log("Aborting...");
      return;
    }

    const homeChainIdByEnv = {
      staging: 77,
      production: 100,
    };

    const tx = await foreignProxy.setHomeProxy(homeProxy.address, homeChainIdByEnv[env]);

    await tx.wait();
    console.log("Home Proxy address successfuly set on Foreign Proxy!");
  }
}).addParam("env", 'The environment to link the proxies. One of "staging", "production".');
