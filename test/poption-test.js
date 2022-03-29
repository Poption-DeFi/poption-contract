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
const readGas = async (trx) => {
  const receipt = await trx.wait();
  console.log(`gas: ${receipt.gasUsed}`);
};

const estGas = async (trx) => {
  const gas = await trx;
  console.log(`gas: ${gas}`);
};

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

  it("should be initialized as 1", async () => {
    await expect(swap.toSwap()).be.rejected;
  });

  it("x should be set and read", async () => {
    await swap.set(true);
    await expect(swap.toSwap(_.range(16), _.range(16))).to.fulfilled;
  });
});

describe("test poption", () => {
  let oracle, erc20, poption, swap;
  let owner, addr1, addr2, addr3, addrs;
  before(async () => {
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("TestOracle");
    oracle = await Oracle.deploy();
    const Erc20 = await ethers.getContractFactory("TestERC20");
    erc20 = await Erc20.deploy("test", "TST", 18);
    await Promise.all([oracle.deployed(), erc20.deployed()]);
    await erc20.deposit({ value: parseEther("2") });
    await erc20.connect(addr2).deposit({ value: parseEther("2") });
    const Swap = await ethers.getContractFactory("TestSwap");
    swap = await Swap.deploy();
    await swap.deployed();
  });

  it("should be initialized", async () => {
    const Poption = await ethers.getContractFactory("Poption");

    const blockId = await ethers.provider.getBlockNumber();
    const time = await ethers.provider
      .getBlock(blockId)
      .then(({ timestamp }) => timestamp);
    poption = await Poption.deploy(
      erc20.address,
      oracle.address,
      time + 200,
      _.range(100000, 1600001, 100000)
    );
    await poption.deployed();
  });

  it("can mint", async () => {
    const amount = parseEther("1.5");
    await erc20.approve(poption.address, amount);
    estGas(poption.estimateGas.mint(amount));
    await expect(() => poption.mint(amount)).to.changeTokenBalances(
      erc20,
      [poption, owner],
      [amount, amount.mul(-1)]
    );
    expect(await poption.balanceOf(owner.address)).to.eql(
      _.map(_.range(16), (i) => amount)
    );
  });

  it("can mint by other", async () => {
    const amount = parseEther("0.9");
    await erc20.connect(addr2).approve(poption.address, amount);
    estGas(poption.connect(addr2).estimateGas.mint(amount));
    await expect(() =>
      poption.connect(addr2).mint(amount)
    ).to.changeTokenBalances(erc20, [poption, addr2], [amount, amount.mul(-1)]);
    expect(await poption.balanceOf(addr2.address)).to.eql(
      _.map(_.range(16), (i) => amount)
    );
  });

  it("cannot mint with no currency", async () => {
    const amount = parseEther("0.9");
    await erc20.connect(addr3).approve(poption.address, amount);
    await expect(poption.connect(addr3).mint(amount)).be.rejectedWith(
      Error,
      /.*TE.*/
    );
  });

  it("can burn", async () => {
    const amount = parseEther("0.5");
    estGas(poption.estimateGas.burn(amount));
    await expect(() => poption.burn(amount)).to.changeTokenBalances(
      erc20,
      [poption, owner],
      [amount.mul(-1), amount]
    );
    expect(await poption.balanceOf(owner.address)).to.eql(
      _.map(_.range(16), (i) => parseEther("1"))
    );
  });

  it("cannot burn more", async () => {
    const amount = parseEther("2.5");
    await expect(poption.burn(amount)).be.rejectedWith(Error, /.*NEO.*/);
  });

  it("can transfer", async () => {
    readGas(
      await expect(
        poption.transfer(
          addr1.address,
          _.map(_.range(16), (i) => i * 1000000)
        )
      ).to.fulfilled
    );
    estGas(
      poption.estimateGas.transfer(
        addr1.address,
        _.map(_.range(16), (i) => i * 1000000)
      )
    );
    expect(await poption.balanceOf(addr1.address)).to.eql(
      _.map(_.range(16), (i) => BigNumber.from(i * 1000000))
    );
    expect(await poption.balanceOf(owner.address)).to.eql(
      _.map(_.range(16), (i) => parseEther("1").sub(i * 1000000))
    );
  });

  it("cannot transfer", async () => {
    await expect(
      poption.transfer(
        addr1.address,
        _.map(_.range(16), (i) => parseEther("20").mul(i))
      )
    ).be.rejectedWith(Error, /.*NEO.*/);
  });

  xit("can transfer from", async () => {
    const option = _.map(_.range(16), (i) => BigNumber.from(i * 1000000));
    const seed = 1;
    const data = solidityKeccak256(
      ["address", "address", "address", "uint128[16]", "uint64"],
      [poption.address, addr2.address, owner.address, option, seed]
    );
    const sign = await addr2.signMessage(ethers.utils.arrayify(data));

    console.log(sign);
    readGas(
      await expect(
        poption.transferFrom(addr2.address, owner.address, option, seed, sign)
      ).to.fulfilled
    );
    await poption.transfer(addr2.address, option);
    await expect(
      poption.transferFrom(addr2.address, owner.address, option, seed, sign)
    ).to.rejectedWith(Error, "UH");
    await expect(
      poption.transferFrom(addr3.address, owner.address, option, seed, sign)
    ).to.rejectedWith(Error, "NS");
  });

  it("can exercise", async () => {
    await oracle.set(200000);
    await expect(poption.exercise()).be.rejectedWith(Error, /.*NSET.*/);
    await network.provider.send("evm_increaseTime", [300]);
    await network.provider.send("evm_mine");
    await expect(() => poption.exercise()).to.changeTokenBalance(
      erc20,
      owner,
      parseEther("1").sub(1000000)
    );
    await expect(() => poption.connect(addr1).exercise()).to.changeTokenBalance(
      erc20,
      addr1,
      1000000
    );
  });

  xit("cannot deliver or destory before destory time", async () => {
    await expect(poption.deliver([addr2.address], 100)).be.rejectedWith(
      Error,
      /.*DSY.*/
    );
    await expect(poption.destory()).be.rejectedWith(Error, /.*DSY.*/);
  });
  xit("can deliver", async () => {
    await network.provider.send("evm_increaseTime", [200]);
    await network.provider.send("evm_mine");
    await expect(
      poption.connect(addr1).deliver([addr2.address], 100)
    ).be.rejectedWith(Error, /.*NO.*/);
    await expect(() =>
      poption.deliver([addr2.address, swap.address], 100)
    ).to.changeTokenBalance(erc20, addr2, parseEther("0.9").sub(100));
  });

  xit("can destory", async () => {
    await expect(poption.connect(addr1).destory()).be.rejectedWith(
      Error,
      /.*NO.*/
    );
    await expect(() => poption.destory()).to.changeTokenBalance(
      erc20,
      owner,
      100
    );
  });
});
