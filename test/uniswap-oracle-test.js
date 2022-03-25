const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const { _ } = require("lodash");
const { expect } = chai;
const chaiAsPromised = require("chai-as-promised");
chai.use(solidity);
chai.use(chaiAsPromised);

describe("Oracle", () => {
  let pool, oracle, erc20, erc202;
  before(async () => {
    const Erc20 = await ethers.getContractFactory("TestERC20");
    erc20 = await Erc20.deploy("test", "TST", 18);
    erc202 = await Erc20.deploy("test2", "TST2", 6);
    const Pool = await ethers.getContractFactory("Pool");
    pool = await Pool.deploy(erc202.address, erc20.address);
    await pool.deployed();
  });
  describe("pool", () => {
    const slot0 = "1511100629161057346785068673184606";
    it("x should be set and read", async () => {
      await pool.set(slot0);
      expect((await pool.slot0())[0]).to.equal(slot0);
    });
  });
  describe("not inversed oracle", () => {
    it("can be init", async () => {
      const Oracle = await ethers.getContractFactory("UniswapOracle");
      oracle = await Oracle.deploy(
        pool.address,
        "18446744073709551616000000000000",
        false
      );
      await pool.set("1511100629161057346785068673184606");
      expect(+(await oracle.get()).toString() / Math.pow(2, 64)).to.equal(
        0.0003637706074729216
      );
    });
    it("can get Token", async () => {
      expect(await oracle.token0()).to.equal(erc202.address);
      expect(await oracle.token1()).to.equal(erc20.address);
    });
    it("can change", async () => {
      await pool.set("1513035456556694987398916947481985");
      expect(+(await oracle.get()).toString() / Math.pow(2, 64)).to.equal(
        0.00036470275444033454
      );
    });
  });
  describe("inversed oracle", () => {
    it("can be init", async () => {
      const Oracle = await ethers.getContractFactory("UniswapOracle");
      oracle = await Oracle.deploy(
        pool.address,
        "18446744073709551616000000000000",
        true
      );
      await pool.set("1511100629161057346785068673184606");
      expect(+(await oracle.get()).toString() / Math.pow(2, 64)).to.equal(
        1 / 0.0003637706074729216
      );
    });
    it("can get Token", async () => {
      expect(await oracle.token0()).to.equal(erc20.address);
      expect(await oracle.token1()).to.equal(erc202.address);
    });
    it("can change", async () => {
      await pool.set("1513035456556694987398916947481985");
      expect(+(await oracle.get()).toString() / Math.pow(2, 64)).to.equal(
        1 / 0.00036470275444033454
      );
    });
  });
});
