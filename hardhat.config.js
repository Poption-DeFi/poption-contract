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
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 0,
      },
    },
  },
  networks: {
    polygon: {
      url: parsed.POLYGON_URL,
    },
    hardhat: {
      chainId: 1999,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "CNY",
  },
  etherscan: {
    apiKey: parsed.ETHERSCAN_API_KEY,
  },
};
