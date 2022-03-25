// SPDX-License-Identifier: BUSL-1.1
/*
 * Poption contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

contract TestOracle {
    uint128 public value;

    constructor() {
        value = 1;
    }

    function get() external view returns (uint128) {
        return value;
    }

    function set(uint128 _x) public {
        value = _x;
    }
}
