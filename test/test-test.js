const chai = require("chai");
const { solidity } = require("ethereum-waffle");

const { BigNumber, utils } = require("ethers");
const { ethers, network } = require("hardhat");
const { _ } = require("lodash");
const { parseEther, solidityKeccak256 } = utils;
const { expect } = chai;
const chaiAsPromised = require("chai-as-promised");

const { estGas, readGas } = require("../testUtils");

chai.use(solidity);
chai.use(chaiAsPromised);
const { SLOT_NUM } = require("../slotNum");

describe("test oracle", () => {
  let oracle;
  before(async () => {
    const Oracle = await ethers.getContractFactory("TestOracle");
    oracle = await Oracle.deploy();
    await oracle.deployed();
  });

  it("should be initialized as 1", async () => {
    expect(await oracle.get()).to.equal(1);
  });

  it("should provide info", async () => {
    await expect(oracle.symbol()).to.fulfilled;
    await expect(oracle.token0Symbol()).to.fulfilled;
    await expect(oracle.token1Symbol()).to.fulfilled;
    await expect(oracle.source()).to.fulfilled;
  });

  describe("action", () => {
    it("x should be set and read", async () => {
      await oracle.set(1000);
      expect(await oracle.get()).to.equal(1000);
    });
  });
});

describe("test swap", () => {
  let swap;
  before(async () => {
    const Swap = await ethers.getContractFactory("TestSwap");
    swap = await Swap.deploy();
    await swap.deployed();
  });

  it("always reject toswap", async () => {
    await expect(swap.toSwap(_.range(16), _.range(16))).be.rejected;
  });

  it("always reject toLiqudIn", async () => {
    await expect(swap.toLiquidIn(20)).be.rejected;
  });

  it("always accept toswap", async () => {
    await swap.set(true);
    await expect(swap.toSwap(_.range(16), _.range(16))).to.fulfilled;
  });

  it("always accept toLiquidIn", async () => {
    await swap.set(true);
    await expect(swap.toLiquidIn(20, swap.address)).to.fulfilled;
  });
});
