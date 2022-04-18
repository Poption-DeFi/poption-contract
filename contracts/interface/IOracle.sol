// SPDX-License-Identifier: BUSL-1.1
/*
 * Test ETC20 class for poption
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;

interface IOracle {
    function source() external view returns (address);

    function get() external view returns (uint128);

    function token0Symbol() external view returns (string memory);

    function token1Symbol() external view returns (string memory);

    function symbol() external view returns (string memory);
}
