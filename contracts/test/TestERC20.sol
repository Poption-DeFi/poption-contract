// SPDX-License-Identifier: BUSL-1.1
/*
 * Test ETC20 class for poption
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    uint8 private dec;

    constructor(
        string memory name,
        string memory symbol,
        uint8 dec_
    ) ERC20(name, symbol) {
        dec = dec_;
    }

    function decimals() public view virtual override returns (uint8) {
        return dec;
    }

    function mint(uint256 value) public {
        _mint(msg.sender, value);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}
