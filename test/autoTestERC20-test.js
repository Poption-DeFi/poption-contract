const { expect } = require("chai");
const { ethers } = require("hardhat");
const parseEther = ethers.utils.parseEther;
const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const { solidity } = require("ethereum-waffle");
chai.use(solidity);
chai.use(chaiAsPromised);

describe("AutoTestERC20", () => {
  describe("Stroy1", () => {
    let mytoken;
    let owner, addr1, addr2, addr3, addrs;
    const defaultAmount = parseEther("100").toString();
    before(async () => {
      const TestERC20 = await ethers.getContractFactory("AutoTestERC20");
      mytoken = await TestERC20.deploy("test", "TST", 18, defaultAmount);
      await mytoken.deployed();
      [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();
    });

    it("should able to get Decimal", async () => {
      expect(await mytoken.decimals()).to.eql(18);
    });

    it("should able to mint", async () => {
      const amount = parseEther("0.3");
      await mytoken.connect(addr3).mint(amount);
      expect(await mytoken.balanceOf(addr3.address)).to.equal(amount);
      expect(await mytoken.totalSupply()).to.eql(amount);
    });

    it("should able to getBalance without mint", async () => {
      expect(await mytoken.balanceOf(addr1.address)).to.equal(defaultAmount);
    });

    it("should able to transfer", async () => {
      await mytoken.connect(addr1).transfer(addr2.address, parseEther("0.2"));
      expect(await mytoken.balanceOf(addr1.address)).to.equal(
        parseEther("99.8")
      );
      expect(await mytoken.totalSupply()).to.eql(parseEther("100.3"));
      expect(await mytoken.balanceOf(addr2.address)).to.equal(
        parseEther("0.2")
      );
    });

    it("should not able to transfer too much", async () => {
      await expect(
        mytoken.connect(addr1).transfer(addr2.address, parseEther("100.2"))
      ).to.be.rejected;
    });

    it("should not able to transfer with zero address", async () => {
      await expect(
        mytoken
          .connect(addr1)
          .transfer(ethers.constants.AddressZero, parseEther("100.2"))
      ).to.be.rejectedWith(Error, /.*transfer to the zero address.*/);
    });

    it("should able to transferFrom", async () => {
      await mytoken.connect(addr2).approve(owner.address, parseEther("0.12"));
      await mytoken
        .connect(owner)
        .transferFrom(addr2.address, addr1.address, parseEther("0.12"));

      expect(await mytoken.balanceOf(addr2.address).valueOf()).to.equal(
        parseEther("0.08").valueOf()
      );
      expect(await mytoken.balanceOf(addr1.address).valueOf()).to.equal(
        parseEther("99.92").valueOf()
      );
    });

    it("should able to transferFrom", async () => {
      await mytoken.connect(addr3).approve(owner.address, parseEther("0.12"));
      await expect(() =>
        mytoken
          .connect(owner)
          .transferFrom(addr3.address, addr2.address, parseEther("0.12"))
      ).to.changeTokenBalances(
        mytoken,
        [addr2, addr3],
        [parseEther("0.12"), parseEther("-0.12")]
      );
    });

    it("should able to transferFrom", async () => {
      await mytoken.connect(addr3).approve(owner.address, parseEther("0.12"));
      await expect(() =>
        mytoken
          .connect(owner)
          .transferFrom(addr3.address, addr2.address, parseEther("0.12"))
      ).to.changeTokenBalances(
        mytoken,
        [addr2, addr3],
        [parseEther("0.12"), parseEther("-0.12")]
      );
    });
  });
});
