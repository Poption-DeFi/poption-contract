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
    await expect(swap.toLiquidIn(20)).to.fulfilled;
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
    await erc20.mint(parseEther("2"));
    await erc20.connect(addr2).mint(parseEther("2"));
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
      _.range(100000, 1600001, 100000).slice(0, SLOT_NUM)
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
    expect(await poption.balanceOfAll(owner.address)).to.eql(
      _.map(_.range(SLOT_NUM), (i) => amount)
    );
  });

  it("can mint by other", async () => {
    const amount = parseEther("0.9");
    await erc20.connect(addr2).approve(poption.address, amount);
    estGas(poption.connect(addr2).estimateGas.mint(amount));
    await expect(() =>
      poption.connect(addr2).mint(amount)
    ).to.changeTokenBalances(erc20, [poption, addr2], [amount, amount.mul(-1)]);
    expect(await poption.balanceOfAll(addr2.address)).to.eql(
      _.map(_.range(SLOT_NUM), (i) => amount)
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
    expect(await poption.balanceOfAll(owner.address)).to.eql(
      _.map(_.range(SLOT_NUM), (i) => parseEther("1"))
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
          _.map(_.range(SLOT_NUM), (i) => i * 1000000)
        )
      ).to.fulfilled
    );
    estGas(
      poption.estimateGas.transfer(
        addr1.address,
        _.map(_.range(SLOT_NUM), (i) => i * 1000000)
      )
    );
    expect(await poption.balanceOfAll(addr1.address)).to.eql(
      _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000))
    );
    expect(await poption.balanceOfAll(owner.address)).to.eql(
      _.map(_.range(SLOT_NUM), (i) => parseEther("1").sub(i * 1000000))
    );
  });

  it("cannot transfer", async () => {
    await expect(
      poption.transfer(
        addr1.address,
        _.map(_.range(SLOT_NUM), (i) => parseEther("20").mul(i))
      )
    ).be.rejectedWith(Error, /.*NEO.*/);
  });

  xit("can transfer from", async () => {
    const option = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
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

describe("test erc1155", () => {
  let oracle, erc20, poption, swap;
  let owner, addr1, addr2, addr3, addrs;
  before(async () => {
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("TestOracle");
    oracle = await Oracle.deploy();
    const Erc20 = await ethers.getContractFactory("TestERC20");
    erc20 = await Erc20.deploy("test", "TST", 18);
    await Promise.all([oracle.deployed(), erc20.deployed()]);
    await erc20.mint(parseEther("2"));
    await erc20.connect(addr2).mint(parseEther("2"));
    const Swap = await ethers.getContractFactory("TestSwap");
    swap = await Swap.deploy();
    await swap.deployed();
    const amount = parseEther("0.9");
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
      _.range(100000, 1600001, 100000).slice(0, SLOT_NUM)
    );
    await poption.deployed();

    const amount = parseEther("1.5");
    await erc20.approve(poption.address, amount);
    estGas(poption.estimateGas.mint(amount));
    await expect(() => poption.mint(amount)).to.changeTokenBalances(
      erc20,
      [poption, owner],
      [amount, amount.mul(-1)]
    );
    expect(await poption.balanceOfAll(owner.address)).to.eql(
      _.map(_.range(SLOT_NUM), (i) => amount)
    );
  });

  it("supports Interface", async () => {
    expect(await poption.supportsInterface("0x01ffc9a7"), "erc165").to.be.true;
    expect(await poption.supportsInterface("0xd9b67a26"), "erc1155").to.be.true;
    expect(await poption.supportsInterface("0xdaaaa126")).to.be.false;
  });

  it("can mint", async () => {
    const amount = parseEther("0.9");
    await erc20.connect(addr2).approve(poption.address, amount);
    await poption.connect(addr2).mint(amount);
    expect(await poption.balanceOf(addr2.address, 1)).to.eql(amount);
    expect(
      _.map(
        await poption.balanceOfBatch([addr2.address, addr3.address], [1, 1]),
        (i) => +i
      )
    ).to.eql([+amount, 0]);
  });

  it("can transferSingle", async () => {
    const amount = parseEther("0.9");
    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, addr3.address, 1, amount, "0x")
    ).to.fulfilled;
    expect(
      _.map(
        await poption.balanceOfBatch([addr2.address, addr3.address], [1, 1]),
        (i) => +i
      )
    ).to.eql([0, +amount]);
  });

  it("can transferBatch", async () => {
    const amount = parseEther("0.4");
    const restAmount = parseEther("0.5");
    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          addr3.address,
          [4, 5],
          [amount, amount],
          "0x"
        )
    ).to.fulfilled;
    expect(
      _.map(
        await poption.balanceOfBatch(
          [addr2.address, addr3.address, addr2.address, addr3.address],
          [4, 4, 5, 5]
        ),
        (i) => +i
      )
    ).to.eql([+restAmount, +amount, +restAmount, +amount]);
  });

  it("cannot transferSingle with wrong id", async () => {
    const amount = parseEther("0.3");

    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, addr3.address, 16, amount, "0x")
    ).to.be.rejectedWith(Error, /.*WRONG ID.*/);
  });

  it("cannot transferBatch with wrong id", async () => {
    const amount = parseEther("0.3");

    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          addr3.address,
          [2, 16],
          [amount, amount],
          "0x"
        )
    ).to.be.rejectedWith(Error, /.*WRONG ID.*/);
  });

  it("cannot transferSingle with wrong id", async () => {
    const amount = parseEther("1.3");

    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, addr3.address, 2, amount, "0x")
    ).to.be.rejectedWith(Error, /.*NE BA.*/);
  });

  it("cannot transferBatch with wrong id", async () => {
    const amount1 = parseEther("1.3");
    const amount2 = parseEther("0.3");

    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          addr3.address,
          [2, 3],
          [amount1, amount2],
          "0x"
        )
    ).to.be.rejectedWith(Error, /.*NE BA.*/);
  });

  it("cannot transferBatch with mismatch arrays", async () => {
    const amount = parseEther("0.3");

    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          addr3.address,
          [2, 3, 6],
          [amount, amount],
          "0x"
        )
    ).to.be.rejectedWith(Error, /.*LEN MM.*/);
  });

  it("cannot transferSingle to zero address", async () => {
    const amount = parseEther("0.3");

    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(
          addr2.address,
          ethers.constants.AddressZero,
          2,
          amount,
          "0x"
        )
    ).to.be.rejectedWith(Error, /.*ZERO ADDRESS.*/);
  });

  it("cannot transferBatch without approval", async () => {
    const amount1 = parseEther("0.3");
    const amount2 = parseEther("0.5");

    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          ethers.constants.AddressZero,
          [7, 8],
          [amount1, amount2],
          "0x"
        )
    ).to.be.rejectedWith(Error, /.*ZERO ADDRESS.*/);
  });

  it("can approve All", async () => {
    expect(await poption.isApprovedForAll(addr2.address, addr3.address)).to.eql(
      false
    );
    await expect(poption.connect(addr2).setApprovalForAll(addr3.address, true))
      .to.fulfilled;
    expect(await poption.isApprovedForAll(addr2.address, addr3.address)).to.eql(
      true
    );
  });

  it("can transferSingle by approval", async () => {
    const amount = parseEther("0.3");
    const restAmount = parseEther("0.9").sub(amount);

    await expect(
      poption
        .connect(addr3)
        .safeTransferFrom(addr2.address, addr3.address, 2, amount, "0x")
    ).to.fulfilled;
    expect(
      _.map(
        await poption.balanceOfBatch([addr2.address, addr3.address], [2, 2]),
        (i) => +i
      )
    ).to.eql([+restAmount, +amount]);
  });

  it("can transferFrom by approval", async () => {
    const amount = parseEther("0.4");
    const restAmount = parseEther("0.5");
    await expect(
      poption
        .connect(addr3)
        .safeBatchTransferFrom(
          addr2.address,
          addr3.address,
          [7, 8],
          [amount, restAmount],
          "0x"
        )
    ).to.fulfilled;
    expect(
      _.map(
        await poption.balanceOfBatch(
          [addr2.address, addr3.address, addr2.address, addr3.address],
          [7, 7, 8, 8]
        ),
        (i) => +i
      )
    ).to.eql([+restAmount, +amount, +amount, +restAmount]);
  });

  it("reverts when receiver is not a E1155 receiver", async function () {
    const amount = parseEther("0.1");
    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, erc20.address, 9, amount, "0x")
    ).to.be.rejectedWith(Error, /.*non ERC1155Receiver.*/);
  });

  it("reverts when receiver is not a E1155 receiver", async function () {
    const amount = parseEther("0.1");
    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          erc20.address,
          [8, 9],
          [amount, amount],
          "0x"
        )
    ).to.be.rejectedWith(Error, /.*non ERC1155Receiver.*/);
  });

  const RECEIVER_SINGLE_MAGIC_VALUE = "0xf23a6e61";
  const RECEIVER_BATCH_MAGIC_VALUE = "0xbc197c81";

  it("fulfill when receiver is a E1155 receiver", async function () {
    const Receiver = await ethers.getContractFactory("ERC1155ReceiverMock");
    const receiver = await Receiver.deploy(
      RECEIVER_SINGLE_MAGIC_VALUE,
      false,
      RECEIVER_BATCH_MAGIC_VALUE,
      false
    );
    await receiver.deployed();

    const amount = parseEther("0.1");
    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          receiver.address,
          [8, 9],
          [amount, amount],
          "0x"
        )
    ).to.be.fulfilled;

    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, receiver.address, 9, amount, "0x")
    ).to.be.fulfilled;
  });

  it("reject when receiver rejects", async function () {
    const Receiver = await ethers.getContractFactory("ERC1155ReceiverMock");
    const receiver = await Receiver.deploy(
      RECEIVER_BATCH_MAGIC_VALUE,
      true,
      RECEIVER_SINGLE_MAGIC_VALUE,
      true
    );
    await receiver.deployed();

    const amount = parseEther("0.1");
    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          receiver.address,
          [8, 9],
          [amount, amount],
          "0x"
        )
    ).to.be.rejectedWith(
      Error,
      "ERC1155ReceiverMock: reverting on batch receive"
    );

    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, receiver.address, 9, amount, "0x")
    ).to.be.rejectedWith(Error, "ERC1155ReceiverMock: reverting on receive");
  });

  it("reject when receiver return wrong answer", async function () {
    const Receiver = await ethers.getContractFactory("ERC1155ReceiverMock");
    const receiver = await Receiver.deploy(
      RECEIVER_BATCH_MAGIC_VALUE,
      false,
      RECEIVER_SINGLE_MAGIC_VALUE,
      false
    );
    await receiver.deployed();

    const amount = parseEther("0.1");
    await expect(
      poption
        .connect(addr2)
        .safeBatchTransferFrom(
          addr2.address,
          receiver.address,
          [8, 9],
          [amount, amount],
          "0x"
        )
    ).to.be.rejectedWith(Error, "ERC1155: ERC1155Receiver rejected tokens");

    await expect(
      poption
        .connect(addr2)
        .safeTransferFrom(addr2.address, receiver.address, 9, amount, "0x")
    ).to.be.rejectedWith(Error, "ERC1155: ERC1155Receiver rejected tokens");
  });
});
