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
import "./SlotNum.sol";
import "./BlackScholesSwap.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PoptionDeployer {
    function deploy(
        address _token,
        address _oracle,
        uint256 _settleTime,
        uint128[SLOT_NUM] memory slots_
    ) external returns (Poption) {
        return new Poption(_token, _oracle, _settleTime, slots_);
    }
}

contract Helper {
    PoptionDeployer poptionDeployer;
    event Create(address indexed poption, address indexed swap);

    constructor(PoptionDeployer _poptionDeployer) {
        poptionDeployer = _poptionDeployer;
    }

    function displayPoption(address poption)
        external
        view
        returns (
            string memory symbol0,
            string memory symbol1,
            string memory tokenSymbol,
            uint256 settleTime
        )
    {
        IOracle oracle = Poption(poption).oracle();
        address token = Poption(poption).token();
        symbol0 = oracle.token0Symbol();
        symbol1 = oracle.token1Symbol();
        tokenSymbol = IERC20Metadata(token).symbol();
        settleTime = Poption(poption).settleTime();
    }

    function deploy(
        IERC20 token,
        address oracle,
        uint256[3] calldata times,
        uint128[SLOT_NUM] calldata slots,
        uint128[3] calldata swapArgs,
        bool isCash,
        uint128 amount,
        uint128[SLOT_NUM] memory poolInit
    ) external {
        Poption poption = poptionDeployer.deploy(
            address(token),
            oracle,
            times[1],
            slots
        );

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
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            poolInit[i] = amount - poolInit[i];
        }
        poption.transfer(msg.sender, poolInit);
        swap.init();
        emit Create(address(poption), address(swap));
    }
}
