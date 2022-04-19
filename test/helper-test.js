const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { BigNumber, utils } = require("ethers");
const { ethers, network } = require("hardhat");
const { _ } = require("lodash");
const { parseEther, solidityKeccak256 } = utils;
const { expect } = chai;
const chaiAsPromised = require("chai-as-promised");
chai.use(solidity);
chai.use(chaiAsPromised);
const { SLOT_NUM } = require("../slotNum");

const slots = [
  "416821430997571584",
  "1483446462075981312",
  "2550071493154391040",
  "3616696524232800256",
  "4683321555311210496",
  "5749946586389619712",
  "6816571617468028928",
  "7883196648546439168",
  "8949821679624848384",
  "10016446710703257600",
  "11083071741781667840",
  "12149696772860078080",
  "13216321803938486272",
  "14282946835016896512",
  "15349571866095306752",
  "16349571866095306752",
].slice(0, SLOT_NUM);

const prepareEnv = async () => {
  const signers = await ethers.getSigners();

  const Erc20 = await ethers.getContractFactory("TestERC20");
  const erc20 = await Erc20.deploy("test", "TST", 18);
  const erc202 = await Erc20.deploy("test2", "TST2", 6);
  const Pool = await ethers.getContractFactory("TestPool");
  const pool = await Pool.deploy(erc202.address, erc20.address);
  await pool.deployed();
  const Oracle = await ethers.getContractFactory("UniswapOracle");
  const oracle = await Oracle.deploy(
    pool.address,
    "18446744073709551616000000000000",
    false
  );

  await pool.set("1511100629161057346785068673184606");
  await Promise.all([oracle.deployed(), erc20.deployed()]);
  await Promise.all(
    _.map(signers, (i) => erc20.connect(i).mint(parseEther("10"))).concat(
      _.map(signers, (i) => erc202.connect(i).mint(parseEther("10")))
    )
  );
  return [oracle, erc202, erc20];
};
const deployPoption = async (oracle, erc20) => {
  const Poption = await ethers.getContractFactory("Poption");
  const blockId = await ethers.provider.getBlockNumber();
  const time = await ethers.provider
    .getBlock(blockId)
    .then(({ timestamp }) => timestamp);
  const poption = await Poption.deploy(
    erc20.address,
    oracle.address,
    time + 200,
    _.map(slots, BigNumber.from)
  );
  await poption.deployed();
  const signers = await ethers.getSigners();
  await Promise.all(
    _.map(signers, async (i) => {
      const amount = parseEther("3");
      await erc20.connect(i).approve(poption.address, amount);
      return await poption.connect(i).mint(amount);
    })
  );
  return poption;
};

describe("test helper", () => {
  before(async () => {});

  it("can display is cash", async () => {
    const [oracle, erc1, erc2] = await prepareEnv();
    const poption = await deployPoption(oracle, erc2);

    const Helper = await ethers.getContractFactory("Helper");
    const helper = await Helper.deploy(oracle.address);
    await helper.deployed();
    const [token0, token1, token, settleTime] = await helper.displayPoption(
      poption.address
    );
    expect(token0).to.eql("TST2");
    expect(token1).to.eql("TST");
    expect(token).to.eql("TST");
    expect(settleTime).to.eql(await poption.settleTime());
  });

  it("can display is asset", async () => {
    const [oracle, erc1, erc2] = await prepareEnv();
    const poption = await deployPoption(oracle, erc1);

    const Helper = await ethers.getContractFactory("Helper");
    const helper = await Helper.deploy(oracle.address);
    await helper.deployed();
    const [token0, token1, token, settleTime] = await helper.displayPoption(
      poption.address
    );
    expect(token0).to.eql("TST2");
    expect(token1).to.eql("TST");
    expect(token).to.eql("TST2");
    expect(settleTime).to.eql(await poption.settleTime());
  });

  it("can help deploy swap and poption", async () => {
    const [oracle, erc1, erc2] = await prepareEnv();
    const owner = (await ethers.getSigners())[0];
    const blockId = await ethers.provider.getBlockNumber();
    const time = await ethers.provider
      .getBlock(blockId)
      .then(({ timestamp }) => timestamp);

    const PoptionDeployer = await ethers.getContractFactory("PoptionDeployer");
    const pdeployer = await PoptionDeployer.deploy();
    await pdeployer.deployed();

    const Helper = await ethers.getContractFactory("Helper");
    const helper = await Helper.deploy(pdeployer.address);
    await helper.deployed();
    console.log("deployed");
    const amount = 10000000;
    const poolInit = _.map(slots, () => amount);
    poolInit[0] = Math.round(amount * 0.7);
    poolInit[poolInit.length - 1] = Math.round(amount * 0.7);
    await erc1.mint(amount);
    await erc1.approve(helper.address, amount);
    const tx = await helper.deploy(
      erc1.address,
      oracle.address,
      [time + 100, time + 200, time + 300],
      slots,
      [
        BigNumber.from("0x10200000000000000"),
        BigNumber.from("0x28f5c28f5c29000"),
        BigNumber.from("416757209401000000"),
      ],
      true,
      amount,
      poolInit
    );
    const rx = await tx.wait();

    const conAddrs = _.filter(
      _.map(
        _.filter(rx.logs, (i) => i.address === helper.address),
        (i) => helper.interface.parseLog(i)
      ),
      (i) => i.name === "Create"
    )[0].args;
    const poption = (await ethers.getContractFactory("Poption")).attach(
      conAddrs.poption
    );
    const swap = (await ethers.getContractFactory("BlackScholesSwap")).attach(
      conAddrs.swap
    );

    expect(await swap.poption()).be.eql(poption.address);
    expect(await swap.owner()).be.eql(owner.address);
    expect(_.map(await poption.balanceOfAll(swap.address), (i) => +i)).be.eql(
      poolInit
    );
    expect(
      _.map(await poption.balanceOfAll(owner.address), (i) => amount - +i)
    ).be.eql(poolInit);
  });
});
