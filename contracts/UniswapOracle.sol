// SPDX-License-Identifier: BUSL-1.1
/*
 * Oracle fetch info from Uniswap V3 pool
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */

pragma solidity ^0.8.4;

import "./Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interface/IOracle.sol";

contract UniswapOracle is IOracle {
    using Math64x64 for uint128;
    using Math64x64 for int128;
    address public immutable source;
    uint256 public divisor;
    uint256 public inverse;
    string public token0Symbol;
    string public token1Symbol;

    string public symbol;

    bytes4 private constant SELECTOR_SLOT0 =
        bytes4(keccak256(bytes("slot0()")));
    bytes4 private constant SELECTOR_TOKEN0 =
        bytes4(keccak256(bytes("token0()")));
    bytes4 private constant SELECTOR_TOKEN1 =
        bytes4(keccak256(bytes("token1()")));

    constructor(
        address _source,
        uint256 _divisor,
        bool _inverse
    ) {
        source = _source;
        (bool success, bytes memory data) = _source.staticcall(
            abi.encodeWithSelector(SELECTOR_TOKEN0)
        );
        require(success, "TK");
        address token0_ = abi.decode(data, (address));
        (success, data) = _source.staticcall(
            abi.encodeWithSelector(SELECTOR_TOKEN1)
        );
        require(success, "TK");
        address token1_ = abi.decode(data, (address));
        divisor = _divisor;
        if (_inverse) {
            token0Symbol = IERC20Metadata(token1_).symbol();
            token1Symbol = IERC20Metadata(token0_).symbol();
            inverse = 1;
        } else {
            token0Symbol = IERC20Metadata(token0_).symbol();
            token1Symbol = IERC20Metadata(token1_).symbol();
            inverse = 0;
        }
        symbol = string(
            abi.encodePacked("ORA-u-", token0Symbol, "/", token1Symbol)
        );
    }

    function get() external view returns (uint128) {
        return _getPrice();
    }

    function _getPrice() private view returns (uint128 r) {
        (bool success, bytes memory data) = source.staticcall(
            abi.encodeWithSelector(SELECTOR_SLOT0)
        );
        require(success, "GP");
        uint160 sqrtPriceX96 = abi.decode(data, (uint160));
        assembly {
            let x := shr(32, sqrtPriceX96)
            x := div(mul(x, x), sload(divisor.slot))
            if sload(inverse.slot) {
                x := div(0x100000000000000000000000000000000, x)
            }
            r := x
        }
    }
}
