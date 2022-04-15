require("@babel/register");
const { parsed } = require("dotenv").config({
  path: __dirname.concat("/.env"),
});

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.8",
    settings: {
      optimizer: {
        enabled: true,
        runs: 0,
      },
    },
  },
  networks: {
    polygon: {
      url: process.env.POLYGON_URL || "",
    },
    hardhat: {
      chainId: 1999,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS || false,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
