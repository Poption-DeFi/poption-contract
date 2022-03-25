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

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function mint(uint256 value) public {
        _mint(msg.sender, value);
    }

    function withdraw(uint256 amount) public {
        _burn(msg.sender, amount);
        (bool success, bytes memory data) = msg.sender.call{value: amount}("");
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "Hydivergence: TRANSFER_FAILED_0"
        );
    }
}

contract TestERC20V2 is ERC20 {
    uint8 private _dec;
    mapping(address => uint256) private _balances;
    mapping(address => bool) public touched;
    uint256 private _default;

    constructor(
        string memory name,
        string memory symbol,
        uint8 dec_,
        uint256 default_
    ) ERC20(name, symbol) {
        _dec = dec_;
        _default = default_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _dec;
    }

    function mint(uint256 value) public {
        _mint(msg.sender, value);
    }

    function balanceOf(address account)
        public
        view
        virtual
        override
        returns (uint256)
    {
        if (touched[account]) {
            return _balances[account];
        } else {
            return _default;
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, amount);
        if (from != address(0) && !touched[from]) {
            touched[from] = true;
            _balances[from] = _default;
        }

        if (!touched[to]) {
            touched[to] = true;
        }

        uint256 fromBalance = _balances[from];
        require(
            fromBalance >= amount,
            "ERC20: transfer amount exceeds balance"
        );
        unchecked {
            _balances[from] = fromBalance - amount;
        }
        _balances[to] += amount;

        emit Transfer(from, to, amount);

        _afterTokenTransfer(from, to, amount);
    }
}
