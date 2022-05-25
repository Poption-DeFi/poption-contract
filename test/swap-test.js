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
const tus = require("../testUtils");
const readGas = tus.readGas;
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

const prepareEnv_ = async (price, slots, decimals, timeDelta) => {
  const signers = await ethers.getSigners();
  const Oracle = await ethers.getContractFactory("TestOracle");
  const oracle = await Oracle.deploy();
  await oracle.set(price);
  const Erc20 = await ethers.getContractFactory("TestERC20");
  const erc20 = await Erc20.deploy("test", "TST", decimals);
  await Promise.all([oracle.deployed(), erc20.deployed()]);
  await Promise.all(
    _.map(signers, (i) => erc20.connect(i).mint(parseEther("3")))
  );
  const Poption = await ethers.getContractFactory("Poption");
  const blockId = await ethers.provider.getBlockNumber();
  const time = await ethers.provider
    .getBlock(blockId)
    .then(({ timestamp }) => timestamp);
  const poption = await Poption.deploy(
    erc20.address,
    oracle.address,
    time + timeDelta,
    _.map(slots, BigNumber.from)
  );
  await poption.deployed();
  await Promise.all(
    _.map(signers, async (i) => {
      const amount = parseEther("3");
      await erc20.connect(i).approve(poption.address, amount);
      return await poption.connect(i).mint(amount);
    })
  );
  return [erc20, oracle, poption];
};

const prepareEnv = async () => {
  return await prepareEnv_("5968887162520422400", slots, 18, 200);
};

const inits = {
  BaseCFMMSwap: async (addr1, poption) => {
    const Swap = await ethers.getContractFactory("BaseCFMMSwap");
    const settleTime = await poption.settleTime();
    return await Swap.deploy(
      addr1.address,
      poption.address,
      +settleTime - 100,
      +settleTime + 100,
      BigNumber.from("0x10200000000000000"),
      BigNumber.from("0x28f5c28f5c29000")
    );
  },
  BlackScholesSwap: async (addr1, poption) => {
    const Swap = await ethers.getContractFactory("BlackScholesSwap");
    const settleTime = await poption.settleTime();
    return await Swap.deploy(
      addr1.address,
      poption.address,
      +settleTime - 100,
      +settleTime + 100,
      BigNumber.from("0x10100000000000000"),
      BigNumber.from("0x28f5c28f5c29000"),
      BigNumber.from("416757209401000000"),
      true
    );
  },
};
_.mapKeys(inits, (getSwap, swapName) => {
  describe(`test ${swapName}`, () => {
    let oracle, erc20, poption, swap;
    let owner, addr1, addr2, addr3, addrs;
    before(async () => {
      const signers = await ethers.getSigners();
      [owner, addr1, addr2, addr3, ...addrs] = signers;
      [erc20, oracle, poption] = await prepareEnv();
    });

    it("can init", async () => {
      swap = await getSwap(addr1, poption);
      await expect(swap.deployed()).to.fulfilled;

      poption.transfer(
        swap.address,
        _.map(_.range(SLOT_NUM), () => parseEther("1.9"))
      );
      await expect(swap.connect(addr1).init()).to.fulfilled;
      await expect(swap.connect(addr1).init()).to.rejectedWith(Error, "INITED");
      expect((await swap.getStatus())[1]).to.eql(
        await poption.balanceOfAll(swap.address)
      );
      expect(await swap.liqPoolShareAll()).to.eql(parseEther("1.9"));
    });

    xit("can swap", async () => {
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 800000));
      const seed = 1;
      const data = solidityKeccak256(
        ["address", "address", "address", "uint128[16]", "uint64"],
        [poption.address, addr2.address, swap.address, _in, seed]
      );
      const sign = await addr2.signMessage(ethers.utils.arrayify(data));

      readGas(
        await expect(swap.connect(addr2).swap(_out, _in, seed, sign)).to
          .fulfilled
      );
      expect((await swap.getStatus())[1]).to.eql(
        await poption.balanceOfAll(swap.address)
      );
      await expect(
        swap.connect(addr1).swap(_out, _in, seed, sign)
      ).be.rejectedWith(Error, /.*NS.*/);
    });

    it("can swap from poption", async () => {
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 800000));

      readGas(
        await expect(poption.connect(addr2).swap(swap.address, _out, _in)).to
          .fulfilled
      );
      expect((await swap.getStatus())[1]).to.eql(
        await poption.balanceOfAll(swap.address)
      );
    });

    it("can mint and swap from poption", async () => {
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 800000));
      await erc20.connect(addr2).mint(2000);
      await erc20.connect(addr2).approve(poption.address, 2000);

      readGas(
        await expect(
          poption.connect(addr2).outSwap(swap.address, _out, _in, 2000, true)
        ).to.fulfilled
      );
      expect((await swap.getStatus())[1]).to.eql(
        await poption.balanceOfAll(swap.address)
      );
    });

    it("can burn swap from poption", async () => {
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 800000));

      readGas(
        await expect(
          poption.connect(addr2).outSwap(swap.address, _out, _in, 2000, false)
        ).to.fulfilled
      );
      expect((await swap.getStatus())[1]).to.eql(
        await poption.balanceOfAll(swap.address)
      );
    });

    it("cannot swap because of reject by trade function", async () => {
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      await expect(
        poption.connect(addr2).swap(swap.address, _out, _in)
      ).be.rejectedWith(Error, /.*PMC.*/);
    });

    it("cannot swap because of reject by not enough liquidity", async () => {
      const _out = await poption.balanceOfAll(swap.address);
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));

      await expect(
        poption.connect(addr2).swap(swap.address, _out, _in)
      ).be.rejectedWith(Error, /.*PLQ.*/);
    });

    it("can add liquidity", async () => {
      const liq = (await swap.getStatus())[1];
      const frac = tus.TWO_F_64.mul(0.25).toFixed(0);
      const _in = _.map(liq, (i) => i.mul(frac).div("0x10000000000000000"));
      const shareAll = await swap.liqPoolShareAll();
      readGas(
        await expect(poption.connect(addr2).liquidIn(swap.address, frac)).to
          .fulfilled
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        _.map(_.zip(liq, _in), ([i, j]) => i.add(j))
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        (
          await swap.getStatus()
        )[1]
      );
      const share = await swap.liqPoolShare(addr2.address);
      expect(+share).to.equal(+tus.BF(+shareAll).mul(0.25));
      expect(shareAll.add(await swap.liqPoolShare(addr2.address))).to.equal(
        await swap.liqPoolShareAll()
      );
    });

    it("can add liquidity from poption", async () => {
      const liq = (await swap.getStatus())[1];
      const frac = tus.TWO_F_64.mul(0.04).toFixed(0);
      const _in = _.map(liq, (i) => i.mul(frac).div("0x10000000000000000"));
      const shareAll = await swap.liqPoolShareAll();
      readGas(
        await expect(poption.connect(addr2).liquidIn(swap.address, frac)).to
          .fulfilled
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        _.map(_.zip(liq, _in), ([i, j]) => i.add(j))
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        (
          await swap.getStatus()
        )[1]
      );
      const share = await swap.liqPoolShare(addr2.address);
      expect(+share).to.equal(+tus.BF(+shareAll).mul(0.24));
      expect(tus.BF(shareAll.toString()).mul(1.04).toFixed(0)).to.equal(
        (await swap.liqPoolShareAll()).toString()
      );
    });

    it("cannot add liquidity for not enough option", async () => {
      const liq = (await swap.getStatus())[1];
      const frac = tus.TWO_F_64.mul(3).toFixed(0);

      await expect(
        poption.connect(addr2).liquidIn(swap.address, frac)
      ).be.rejectedWith(Error, /.*NEO.*/);
    });

    it("can remove liquidity", async () => {
      const share = await swap.liqPoolShare(addr2.address);
      const shareAll = await swap.liqPoolShareAll();
      const shareOut = tus.BF(share.toString()).mul(0.7).toFixed(0);
      const liq = (await swap.getStatus())[1];
      readGas(
        await expect(swap.connect(addr2).liquidOut(shareOut)).to.fulfilled
      );
      await expect(
        _.map(await poption.balanceOfAll(swap.address), (i) =>
          i.toString().slice(0, -1)
        ),
        "E1"
      ).to.eql(
        _.map(liq, (i) =>
          tus
            .BF(i.toString())
            .sub(tus.BF(shareOut).div(shareAll.toString()).mul(i.toString()))
            .toFixed(0)
            .slice(0, -1)
        )
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        (
          await swap.getStatus()
        )[1]
      );
      const share_ = await swap.liqPoolShare(addr2.address);
      expect(share_).to.equal(share.sub(shareOut));
      expect(await swap.liqPoolShareAll()).to.equal(shareAll.sub(shareOut));
    });

    it("read total supply", async () => {
      expect(await swap.totalSupply()).to.eql(await swap.liqPoolShareAll());
    });

    it("read balanceOf", async () => {
      expect(await swap.balanceOf(addr2.address)).to.eql(
        await swap.liqPoolShare(addr2.address)
      );
    });

    it("can transfer", async () => {
      await expect(() =>
        swap.connect(addr2).transfer(addr3.address, 1000)
      ).to.changeTokenBalances(swap, [addr2, addr3], [-1000, 1000]);
    });

    it("cannot transfer From without allowance", async () => {
      await expect(
        swap.connect(addr2).transferFrom(addr3.address, addr2.address, 1000)
      ).to.rejectedWith(Error, "No En Al");
    });

    it("cannot transfer exceed Share", async () => {
      await expect(
        swap
          .connect(addr2)
          .transfer(addr3.address, "0x400000000000000000000000000000000")
      ).to.rejectedWith(Error, "Ex Share");
    });

    it("cannot transfer to 0 addr", async () => {
      await expect(
        swap.connect(addr2).transfer(ethers.constants.AddressZero, 1000)
      ).to.rejectedWith(Error, "T 0 Addr");
    });

    it("cannot give allowance to 0 addr", async () => {
      await expect(
        swap.connect(addr3).approve(ethers.constants.AddressZero, 500)
      ).to.rejectedWith(Error, "A 0 Addr");
    });

    it("can give allowance", async () => {
      await expect(swap.connect(addr3).approve(addr2.address, 500)).to
        .fulfilled;
      expect(+(await swap.allowance(addr3.address, addr2.address))).to.eql(500);
    });

    it("cannot transferFrom more than allowance", async () => {
      await expect(
        swap.connect(addr2).transferFrom(addr3.address, addr2.address, 600)
      ).to.rejectedWith(Error, "No En Al");
    });

    it("can transfer From with allowance", async () => {
      await expect(() =>
        swap.connect(addr2).transferFrom(addr3.address, addr2.address, 500)
      ).to.changeTokenBalances(swap, [addr2, addr3], [500, -500]);
      expect(+(await swap.allowance(addr3.address, addr2.address))).to.eql(0);
    });

    it("can transfer From with unlimited allowance", async () => {
      await expect(
        swap.connect(addr3).approve(addr2.address, ethers.constants.MaxUint256)
      ).to.fulfilled;
      await expect(
        swap.connect(addr2).transferFrom(addr3.address, addr2.address, 600)
      ).to.rejectedWith(Error, "Ex Share");
      await expect(() =>
        swap.connect(addr2).transferFrom(addr3.address, addr2.address, 500)
      ).to.changeTokenBalances(swap, [addr2, addr3], [500, -500]);
      expect(await swap.allowance(addr3.address, addr2.address)).to.eql(
        ethers.constants.MaxUint256
      );
    });

    it("can remove liquidity 2", async () => {
      const _in = _.map(_.range(SLOT_NUM), (i) =>
        BigNumber.from(i * 10000000000000)
      );
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      await poption.connect(addr2).swap(swap.address, _out, _in);

      const share = await swap.liqPoolShare(addr2.address);
      const shareAll = await swap.liqPoolShareAll();
      const shareOut = share.toString();
      readGas(
        await expect(swap.connect(addr2).liquidOut(shareOut)).to.fulfilled
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        (
          await swap.getStatus()
        )[1]
      );
      const share_ = await swap.liqPoolShare(addr2.address);
      expect(+share_).to.equal(0);
      expect(+(await swap.liqPoolShareAll())).to.gt(+shareAll.sub(shareOut));
    });

    it("cannot swap after close time", async () => {
      await network.provider.send("evm_increaseTime", [100]);
      await network.provider.send("evm_mine");
      const _in = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 1000000));
      const _out = _.map(_.range(SLOT_NUM), (i) => BigNumber.from(i * 800000));

      await expect(
        poption.connect(addr2).swap(swap.address, _out, _in)
      ).to.rejectedWith(Error, /.*MCT.*/);
    });

    it("can getWight after settle time 0", async () => {
      await network.provider.send("evm_increaseTime", [101]);
      await network.provider.send("evm_mine");
      await oracle.set(BigNumber.from(slots[0]).sub(10));
      const weight = (await swap.getStatus())[0];
      expect(weight[0]).to.eql(tus.TWO_I_64);
      expect(_.reduce(weight, (a, b) => +a + +b)).to.eql(
        +tus.TWO_I_64.toString()
      );
    });

    it("can getWight after settle time 1", async () => {
      await oracle.set(BigNumber.from(slots[slots.length - 1]).add(10));
      const weight = (await swap.getStatus())[0];
      expect(weight[slots.length - 1]).to.eql(tus.TWO_I_64);
      expect(_.reduce(weight, (a, b) => +a + +b)).to.eql(
        +tus.TWO_I_64.toString()
      );
    });

    it("can getWight after settle time 2", async () => {
      await oracle.set(
        BigNumber.from(slots[+(slots.length / 2).toFixed(0)]).add(10)
      );
      const weight = (await swap.getStatus())[0];
      expect(_.reduce(weight, (a, b) => +a + +b)).to.eql(
        +tus.TWO_I_64.toString()
      );
    });
    it("can getWight after settle ", async () => {
      await poption.settle();
      const weight = (await swap.getStatus())[0];
      expect(_.reduce(weight, (a, b) => +a + +b)).to.eql(
        +tus.TWO_I_64.toString()
      );
    });

    it("can remove liquidity after close time", async () => {
      const share = await swap.liqPoolShare(addr1.address);
      const shareAll = await swap.liqPoolShareAll();
      const shareOut = share.div(2).toString();
      readGas(
        await expect(swap.connect(addr1).liquidOut(shareOut)).to.fulfilled
      );
      await expect(await poption.balanceOfAll(swap.address)).to.eql(
        (
          await swap.getStatus()
        )[1]
      );
      expect(+(await swap.liqPoolShareAll())).to.gte(+shareAll.sub(shareOut));
    });

    it("cannot destory before destory time", async () => {
      await expect(swap.connect(addr1).destroy()).to.rejectedWith(
        Error,
        /.*NDT.*/
      );
    });

    it("cannot destory by not owner", async () => {
      await network.provider.send("evm_increaseTime", [301]);
      await network.provider.send("evm_mine");
      await expect(swap.connect(addr2).destroy()).to.rejectedWith(
        Error,
        /.*OO.*/
      );
    });

    it("can destory by only owner", async () => {
      await network.provider.send("evm_increaseTime", [301]);
      await network.provider.send("evm_mine");

      const [balBefore, balSwap] = await Promise.all([
        poption.balanceOfAll(addr1.address),
        poption.balanceOfAll(swap.address),
      ]);
      await expect(swap.connect(addr1).destroy()).to.fulfilled;
      const balAfter = await poption.balanceOfAll(addr1.address);
      expect(_.map(balAfter, (i) => i.toString())).to.eql(
        _.map(_.zip(balBefore, balSwap), ([i, j]) => i.add(j).toString())
      );
    });
  });
});

describe(`test BlackScholesSwap 2`, () => {
  let oracle, erc20, poption, swap;
  let owner, addr1, addr2, addr3, addrs;
  before(async () => {
    const signers = await ethers.getSigners();
    [owner, addr1, addr2, addr3, ...addrs] = signers;
    [erc20, oracle, poption] = await prepareEnv();
  });

  it("can init", async () => {
    const Swap = await ethers.getContractFactory("BlackScholesSwap");
    const settleTime = await poption.settleTime();
    swap = await Swap.deploy(
      addr1.address,
      poption.address,
      settleTime - 100,
      settleTime + 100,
      BigNumber.from("0x10200000000000000"),
      BigNumber.from("0x28f5c28f5c29000"),
      BigNumber.from("416757209401000000"),
      false
    );
    await expect(swap.deployed()).to.fulfilled;

    poption.transfer(
      swap.address,
      _.map(_.range(SLOT_NUM), () => parseEther("1.9"))
    );
    await expect(swap.connect(addr1).init()).to.fulfilled;
    const status = await swap.getStatus();
    expect(status[1]).to.eql(await poption.balanceOfAll(swap.address));
    expect(await swap.liqPoolShareAll()).to.eql(parseEther("1.9"));
  });

  it("can reweight from spot price change", async () => {
    const oldWeight = (await swap.getStatus())[0];
    await oracle.set(slots[5]);
    const currWeight = (await swap.getStatus())[0];
    expect(oldWeight).not.eql(currWeight);
    expect(+currWeight[5]).to.gt(+currWeight[6]);
    expect(+currWeight[4]).to.gt(+currWeight[7]);
    expect(+currWeight[6]).to.gt(+currWeight[7]);
  });

  it("can reweight from time change", async () => {
    const oldWeight = (await swap.getStatus())[0];
    await network.provider.send("evm_increaseTime", [150]);
    await network.provider.send("evm_mine");
    const currWeight = (await swap.getStatus())[0];
    expect(oldWeight).not.eql(currWeight);
    expect(+currWeight[5]).to.gt(+oldWeight[5]);
  });

  it("can reweight from time change 2", async () => {
    const oldWeight = (await swap.getStatus())[0];
    await network.provider.send("evm_increaseTime", [40]);
    await network.provider.send("evm_mine");
    const currWeight = (await swap.getStatus())[0];
    expect(oldWeight).not.eql(currWeight);
    expect(+currWeight[5]).to.gt(+oldWeight[5]);
  });
});

describe("test BlackScholesSwap 3", () => {
  let oracle, erc20, poption, swap;
  let owner, addr1, addr2, addr3, addrs;
  before(async () => {
    const signers = await ethers.getSigners();
    [owner, addr1, addr2, addr3, ...addrs] = signers;
    [erc20, oracle, poption] = await prepareEnv_(
      "5968887162520422400",
      slots,
      6,
      200
    );
  });

  it("can init", async () => {
    const Swap = await ethers.getContractFactory("BlackScholesSwap");
    const settleTime = await poption.settleTime();
    swap = await Swap.deploy(
      addr1.address,
      poption.address,
      settleTime - 100,
      settleTime + 100,
      BigNumber.from("19553548718132125696"),
      BigNumber.from("0x28f5c28f5c29000"),
      BigNumber.from("316757209401000000"),
      false
    );
    await expect(swap.deployed()).to.fulfilled;

    poption.transfer(
      swap.address,
      _.map(_.range(SLOT_NUM), () => 100000)
    );
    await expect(swap.connect(addr1).init()).to.fulfilled;
    const status = await swap.getStatus();
    expect(status[1]).to.eql(await poption.balanceOfAll(swap.address));
    expect((await swap.liqPoolShareAll()).toString()).to.eql("100000");
  });

  it("can reweight from time change 2", async () => {
    function tradeToInOut(get, give) {
      return [
        _.map(get, (i) => tus.BigFloat.max(tus.BF(i).sub(give), 0).toFixed(0)),
        _.map(get, (i) => tus.BigFloat.max(tus.BF(give).sub(i), 0).toFixed(0)),
      ];
    }
    const want = _.map(_.range(0, 32000, 2000), tus.BF);
    await oracle.set(slots[1]);
    const states = await swap.getStatus();
    [_out, _in] = tradeToInOut(want, 2170);
    await expect(poption.connect(addr2).swap(swap.address, _out, _in)).to
      .fulfilled;
    [_out, _in] = tradeToInOut(want, 2169);
    await expect(
      poption.connect(addr2).swap(swap.address, _out, _in)
    ).to.rejectedWith(Error, /.*PMC.*/);
  });
});

describe("test BlackScholesSwap 4", () => {
  let oracle, erc20, poption, swap;
  let owner, addr1, addr2, addr3, addrs;
  before(async () => {
    const signers = await ethers.getSigners();
    [owner, addr1, addr2, addr3, ...addrs] = signers;
    [erc20, oracle, poption] = await prepareEnv_(
      "5968887162520422400",
      _.map(
        [
          "1000",
          "1200",
          "1400",
          "1600",
          "1800",
          "2000",
          "2200",
          "2400",
          "2600",
          "2800",
          "3000",
          "3200",
          "3400",
          "3600",
          "3800",
          "4000",
        ],
        tus.toInt
      ),
      6,
      197828
    );
  });

  it("can init", async () => {
    const Swap = await ethers.getContractFactory("BlackScholesSwap");
    const settleTime = await poption.settleTime();
    swap = await Swap.deploy(
      addr1.address,
      poption.address,
      settleTime - 100,
      settleTime + 100,
      BigNumber.from(
        tus.toInt(
          "1.0500000000000000000108420217248550443400745280086994171142578125"
        )
      ),
      BigNumber.from("0x28f5c28f5c29000"),
      BigNumber.from(
        tus.toInt(
          "0.0003214723705746387930580476588460214770748279988765716552734375"
        )
      ),
      true
    );
    await expect(swap.deployed()).to.fulfilled;

    poption.transfer(swap.address, [
      "8777004757",
      "8649006632",
      "8242620225",
      "7836233819",
      "7429847413",
      "7023461007",
      "6617074601",
      "6210688194",
      "5804301788",
      "5397915382",
      "4991528976",
      "4585142569",
      "4178756163",
      "3772369757",
      "3365983351",
      "2681208664",
    ]);
    await expect(swap.connect(addr1).init()).to.fulfilled;
    const status = await swap.getStatus();
    expect(status[1]).to.eql(await poption.balanceOfAll(swap.address));
  });

  it("can reweight from time change 2", async () => {
    function tradeToInOut(get, give) {
      return [
        _.map(get, (i) => tus.BigFloat.max(tus.BF(i).sub(give), 0).toFixed(0)),
        _.map(get, (i) => tus.BigFloat.max(tus.BF(give).sub(i), 0).toFixed(0)),
      ];
    }
    const want = [
      "0",
      "-200000000",
      "-400000000",
      "-600000000",
      "-800000000",
      "-1000000000",
      "-1200000000",
      "-1400000000",
      "-1600000000",
      "-1800000000",
      "-2000000000",
      "-2200000000",
      "-2400000000",
      "-2600000000",
      "-2800000000",
      "-3000000000",
    ];
    await oracle.set(
      tus.toInt(
        "2079.54950615921631274277646406201114359646453522145748138427734375"
      )
    );
    const states = await swap.getStatus();
    console.log(_.map(states[0], (i) => tus.toDec(i)));
    console.log(_.map(states[1], (i) => i.toString()));
    console.log(tus.toDec(states[2]));
    const [_out, _in] = tradeToInOut(want, "-1089593786");
    await poption.connect(addr2).swap(swap.address, _out, _in);
  });
});
