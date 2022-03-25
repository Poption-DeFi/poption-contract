const Decimal = require("decimal.js");
const _ = require("lodash");

const { BigNumber } = require("ethers");

const BigFloat = Decimal.clone({
  precision: 150,
  toExpNeg: -150,
  toExpPos: 150,
});

const BF = (x) => new BigFloat(x);
const TWO_F_128 = new BigFloat("340282366920938463463374607431768211456");
const TWO_F_64 = new BigFloat("18446744073709551616");
const TWO_I_128 = BigNumber.from("340282366920938463463374607431768211456");
const TWO_I_64 = BigNumber.from("18446744073709551616");

module.exports = {
  BigFloat: BigFloat,
  BF: BF,
  TWO_I_64: TWO_I_64,
  TWO_I_128: TWO_I_128,
  TWO_F_64: TWO_F_64,
  TWO_F_128: TWO_F_128,
};
