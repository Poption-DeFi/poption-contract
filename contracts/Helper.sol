// SPDX-License-Identifier: BUSL-1.1
/*
 * Poption contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;

import "./interface/IOracle.sol";
import "./interface/ISwap.sol";
import "./Poption.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract Helper {
    function hiPoption(address poption)
        external
        view
        returns (
            string memory symbol0,
            string memory symbol1,
            bool isAsset,
            uint256 settleTime
        )
    {
        IOracle oracle = Poption(poption).oracle();
        address token = Poption(poption).token();
        address token0 = oracle.token0();
        address token1 = oracle.token1();
        symbol0 = IERC20Metadata(token0).symbol();
        symbol1 = IERC20Metadata(token1).symbol();
        isAsset = token == token0;
        settleTime = Poption(poption).settleTime();
    }
}
