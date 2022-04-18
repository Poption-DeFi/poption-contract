// SPDX-License-Identifier: BUSL-1.1
/*
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

import "../SlotNum.sol";

interface ISwap {
    function toSwap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) external;

    function toLiquidIn(uint128 frac, address sender) external;
}
