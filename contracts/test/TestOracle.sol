// SPDX-License-Identifier: BUSL-1.1
/*
 * Poption contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

import "../interface/IOracle.sol";

contract TestOracle is IOracle {
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

    function source() external pure returns (address) {
        return address(0);
    }

    function token0Symbol() external pure returns (string memory) {
        return "";
    }

    function token1Symbol() external pure returns (string memory) {
        return "";
    }

    function symbol() external pure returns (string memory) {
        return "TestORC";
    }
}
