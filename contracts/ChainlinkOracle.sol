// SPDX-License-Identifier: BUSL-1.1
/*
 * Chainlink Oracle contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./interface/IOracle.sol";

contract ChainlinkOracle is IOracle {
    address public immutable source;
    string public token0Symbol;
    string public token1Symbol;
    string public symbol;
    uint256 public fact;

    /**
     * Network: Kovan
     * Aggregator: ETH/USD
     * Address: 0x9326BFA02ADD2366b30bacB125260Af641031331
     */
    constructor(
        address _source,
        string memory token0Symbol_,
        string memory token1Symbol_
    ) {
        source = _source;

        require(
            keccak256(abi.encodePacked(token0Symbol_, " / ", token1Symbol_)) ==
                keccak256(
                    abi.encodePacked(
                        AggregatorV3Interface(source).description()
                    )
                ),
            "Matched Symbol"
        );
        token0Symbol = token0Symbol_;
        token1Symbol = token1Symbol_;
        uint8 decimals = AggregatorV3Interface(source).decimals();

        fact = 1;
        uint256 f_ = 10;
        for (uint8 i = decimals; i > 0; i >>= 1) {
            if (i & 1 == 1) {
                fact *= f_;
            }
            f_ *= f_;
        }
        symbol = string(
            abi.encodePacked("ORA-c-", token0Symbol, "/", token1Symbol)
        );
    }

    function get() external view returns (uint128) {
        (
            ,
            /*uint80 roundID*/
            int256 price, /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/
            ,
            ,

        ) = AggregatorV3Interface(source).latestRoundData();
        return uint128((uint256(price) << 64) / fact);
    }

    function priceTimestamp() external view returns (uint128, uint256) {
        (
            ,
            /*uint80 roundID*/
            int256 price, /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/
            ,
            uint256 timeStamp,

        ) = AggregatorV3Interface(source).latestRoundData();
        return (uint128((uint256(price) << 64) / fact), timeStamp);
    }
}
