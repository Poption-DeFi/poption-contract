module.exports = {
  artifacts: {
    IERC20Metadata: require("./artifacts/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol/IERC20Metadata.json"),
    Poption: require("./artifacts/contracts/Poption.sol/Poption.json"),
    BaseCFMMSwap: require("./artifacts/contracts/BaseCFMMSwap.sol/BaseCFMMSwap.json"),
    BlackScholesSwap: require("./artifacts/contracts/BlackScholesSwap.sol/BlackScholesSwap.json"),
    UniswapOracle: require("./artifacts/contracts/UniswapOracle.sol/UniswapOracle.json"),
    IOracle: require("./artifacts/contracts/interface/IOracle.sol/IOracle.json"),
    Helper: require("./artifacts/contracts/Helper.sol/Helper.json"),
  },
};
