# Poption contract

This repository contains the smart contracts for the Poption Protocol.

The product is at https://www.poption.exchange/ . Deployed contracts can also be found there.

## Test

```shell
npx hardhat test
```

Current coverage.

| File                 | % Stmts | % Branch | % Funcs | % Lines | Uncovered Lines |
| -------------------- | ------- | -------- | ------- | ------- | --------------- |
| contracts/           | 99.15   | 85.71    | 98.04   | 99.21   |                 |
| BaseCFMMSwap.sol     | 99.17   | 85.29    | 94.12   | 99.18   | 284             |
| BlackScholesSwap.sol | 97.67   | 90       | 100     | 97.67   | 97              |
| Helper.sol           | 100     | 100      | 100     | 100     |                 |
| Math.sol             | 100     | 100      | 100     | 100     |                 |
| Poption.sol          | 100     | 90       | 100     | 100     |                 |
| UniswapOracle.sol    | 100     | 62.5     | 100     | 100     |                 |
| contracts/interface/ | 100     | 100      | 100     | 100     |                 |
| IOracle.sol          | 100     | 100      | 100     | 100     |                 |
| IPoption.sol         | 100     | 100      | 100     | 100     |                 |
| ISwap.sol            | 100     | 100      | 100     | 100     |                 |
| contracts/test/      | 100     | 93.75    | 100     | 100     |                 |
| TestERC20.sol        | 100     | 91.67    | 100     | 100     |                 |
| TestHelper.sol       | 100     | 100      | 100     | 100     |                 |
| TestMath.sol         | 100     | 100      | 100     | 100     |                 |
| TestOracle.sol       | 100     | 100      | 100     | 100     |                 |
| TestPool.sol         | 100     | 100      | 100     | 100     |                 |
| TestSwap.sol         | 100     | 100      | 100     | 100     |                 |
| All files            | 99.35   | 87.21    | 98.75   | 99.39   |                 |

## Licensing

The project is released in the Business Source License 1.1 (BUSL-1.1), see see [`LICENSE`](./LICENSE).
