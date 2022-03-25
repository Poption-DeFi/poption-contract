// SPDX-License-Identifier: BUSL-1.1
/*
 * Test ETC20 class for poption
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;

interface IOracle {
    function get() external view returns (uint128);

    function token0() external view returns (address);

    function token1() external view returns (address);
}
