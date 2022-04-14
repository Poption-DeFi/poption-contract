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
import "./BlackScholesSwap.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Helper {
    event Create(address poption, address swap);

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

    function deploy(
        IERC20 token,
        address oracle,
        uint256[3] calldata times,
        uint128[16] calldata slots,
        uint128[3] calldata swapArgs,
        bool isCash,
        uint128 amount,
        uint128[16] memory poolInit
    ) external {
        Poption poption = new Poption(address(token), oracle, times[1], slots);
        BlackScholesSwap swap = new BlackScholesSwap(
            msg.sender,
            address(poption),
            times[0],
            times[2],
            swapArgs[0],
            swapArgs[1],
            swapArgs[2],
            isCash
        );
        token.transferFrom(msg.sender, address(this), amount);
        token.approve(address(poption), amount);
        poption.mint(amount);
        poption.transfer(address(swap), poolInit);
        for (uint256 i = 0; i < 16; i++) {
            poolInit[i] = amount - poolInit[i];
        }
        poption.transfer(msg.sender, poolInit);
        swap.init();
        emit Create(address(poption), address(swap));
    }
}
