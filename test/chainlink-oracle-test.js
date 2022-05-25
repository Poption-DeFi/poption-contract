const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const { _ } = require("lodash");
const { expect } = chai;
const chaiAsPromised = require("chai-as-promised");
chai.use(solidity);
chai.use(chaiAsPromised);

describe("Chainlink Oracle", () => {
  let pool, oracle, erc20, erc202;
  before(async () => {
    const Chainlink = await ethers.getContractFactory("ChainlinkMoke");
    /* uint8 decimals_,
        string memory description_,
        uint256 version_,
        uint80 roundId_,
        int256 answer_,
        uint256 startedAt_,
        uint256 updatedAt_,
        uint80 answeredInRound_
*/
    timestamp = Math.round(+new Date() / 1000);
    const decimals = 8;
    chainlink = await Chainlink.deploy(
      decimals,
      "ABC / DEF",
      1,
      1,
      134 * Math.pow(10, decimals),
      timestamp,
      timestamp,
      1
    );
    await chainlink.deployed();
  });

  describe("test 1", () => {
    it("can be init", async () => {
      const Oracle = await ethers.getContractFactory("ChainlinkOracle");
      oracle = await expect(Oracle.deploy(chainlink.address, "ABC", "DEF")).be
        .fulfilled;
      const res = +(await oracle.get()).toString() / Math.pow(2, 64);
      console.log(res);
      expect(res).to.equal(134);
    });
    it("can get info", async () => {
      expect(await oracle.token0Symbol()).to.equal("ABC");
      expect(await oracle.token1Symbol()).to.equal("DEF");
      expect(await oracle.symbol()).to.equal("ORA-c-ABC/DEF");
      expect(await oracle.source()).to.eql(chainlink.address);
    });
  });
});
