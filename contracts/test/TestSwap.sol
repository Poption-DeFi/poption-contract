// SPDX-License-Identifier: BUSL-1.1
/*
 * Poption contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;
import "../interface/ISwap.sol";

contract TestSwap is ISwap {
    bool public value;

    constructor() {
        value = false;
    }

    function set(bool _value) external {
        value = _value;
    }

    function toLiquidIn(uint128, address) external {
        require(value, "RJ");
    }

    function toSwap(uint128[16] calldata, uint128[16] calldata) external {
        require(value, "RJ");
    }
}
