// SPDX-License-Identifier: BUSL-1.1
/*
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

interface ISwap {
    function toSwap(uint128[16] calldata _out, uint128[16] calldata _in)
        external;

    function toLiquidIn(uint128 frac, address sender) external;
}
