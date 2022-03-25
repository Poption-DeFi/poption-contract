// SPDX-License-Identifier: BUSL-1.1
/*
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;

interface IPoption {
    function balanceOf(address addr) external view returns (uint128[16] memory);

    function transfer(address _recipient, uint128[16] calldata _option)
        external;

    function mint(uint128 _assert) external;

    function burn(uint128 _assert) external;

    function exercise() external;
}
