// SPDX-License-Identifier: BUSL-1.1
/*
 * Poption contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interface/IOracle.sol";
import "./interface/ISwap.sol";
import "./Math.sol";

contract Poption {
    using Math64x64 for uint128;
    uint256 public constant SLOT_NUM = 16;

    uint128[SLOT_NUM] public slots;
    mapping(address => uint128[SLOT_NUM]) public options;
    mapping(bytes32 => bool) public usedHash;

    IOracle public immutable oracle;
    uint256 public immutable settleTime;
    address public immutable token;
    bytes4 private constant SELECTOR_TRANSFERFROM =
        bytes4(keccak256(bytes("transferFrom(address,address,uint256)")));
    bytes4 private constant SELECTOR_TRANSFER =
        bytes4(keccak256(bytes("transfer(address,uint256)")));
    bool internal locked;

    bool public isSettled;
    uint8 public settleIdx;
    uint128 public settleWeight0;
    uint128 public settleWeight1;

    event Transfer(address indexed sender, address indexed recipient);

    constructor(
        address _token,
        address _oracle,
        uint256 _settleTime,
        uint128[SLOT_NUM] memory slots_
    ) {
        token = _token;
        oracle = IOracle(_oracle);
        settleTime = _settleTime;
        slots = slots_;
    }

    function getState()
        external
        view
        returns (
            address,
            address,
            uint256,
            uint128[SLOT_NUM] memory
        )
    {
        return (token, address(oracle), settleTime, slots);
    }

    modifier noReentrant() {
        require(!locked, "REEN");
        locked = true;
        _;
        locked = false;
    }

    function settle() public {
        unchecked {
            if ((!isSettled) && (block.timestamp > settleTime)) {
                uint128 price = oracle.get();
                isSettled = true;
                if (price <= slots[0]) {
                    settleIdx = 1;
                    settleWeight0 = 1;
                    settleWeight1 = 0;
                } else if (price >= slots[SLOT_NUM - 1]) {
                    settleIdx = uint8(SLOT_NUM - 1);
                    settleWeight0 = 0;
                    settleWeight1 = 1;
                } else {
                    uint8 h = uint8(SLOT_NUM - 1);
                    uint8 l = 0;
                    settleIdx = (h + l) >> 1;
                    while (h > l) {
                        if (slots[settleIdx] >= price) {
                            h = settleIdx;
                        } else {
                            l = settleIdx + 1;
                        }
                        settleIdx = (h + l) >> 1;
                    }
                    uint128 delta = slots[settleIdx] - slots[settleIdx - 1];
                    settleWeight0 = (slots[settleIdx] - price).div(delta);
                    settleWeight1 = (price - slots[settleIdx - 1]).div(delta);
                }
            }
            require(isSettled, "NSET");
        }
    }

    function balanceOf(address addr)
        external
        view
        returns (uint128[SLOT_NUM] memory)
    {
        return options[addr];
    }

    function _safeTransferFrom(
        address token_,
        address from_,
        address to_,
        uint256 value_
    ) private {
        (bool success, bytes memory data) = token_.call(
            abi.encodeWithSelector(SELECTOR_TRANSFERFROM, from_, to_, value_)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TE"
            // transfer error
        );
    }

    function _safeTransfer(
        address token_,
        address to_,
        uint256 value_
    ) private {
        (bool success, bytes memory data) = token_.call(
            abi.encodeWithSelector(SELECTOR_TRANSFER, to_, value_)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "TE"
            // transfer error
        );
    }

    function _transfer(
        address _from,
        address _to,
        uint128[SLOT_NUM] memory _option
    ) private {
        unchecked {
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                require(_option[i] <= options[_from][i], "NEO");
                options[_to][i] += _option[i];
                options[_from][i] -= _option[i];
            }
            emit Transfer(_from, _to);
        }
    }

    function transfer(address _recipient, uint128[SLOT_NUM] calldata _option)
        external
        noReentrant
    {
        _transfer(msg.sender, _recipient, _option);
    }

    function mint(uint128 _assert) public noReentrant {
        _safeTransferFrom(token, msg.sender, address(this), _assert);
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            options[msg.sender][i] += _assert;
        }
        emit Transfer(address(0), msg.sender);
    }

    function burn(uint128 _assert) public noReentrant {
        unchecked {
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                require(_assert <= options[msg.sender][i], "NEO");
                options[msg.sender][i] -= _assert;
            }
        }
        _safeTransfer(token, address(msg.sender), uint256(_assert));
        emit Transfer(msg.sender, address(0));
    }

    function outSwap(
        address marketMaker,
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in,
        uint128 _assert,
        bool _isMint
    ) external {
        if (_isMint) {
            mint(_assert);
        }
        swap(marketMaker, _out, _in);
        if (!_isMint) {
            burn(_assert);
        }
    }

    function swap(
        address marketMaker,
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) public noReentrant {
        ISwap(marketMaker).toSwap(_out, _in);
        _transfer(marketMaker, msg.sender, _out);
        _transfer(msg.sender, marketMaker, _in);
    }

    function liquidIn(address marketMaker, uint128 frac) external noReentrant {
        uint128[SLOT_NUM] memory option;
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            option[i] = options[marketMaker][i].mul(frac);
        }
        _transfer(msg.sender, marketMaker, option);
        ISwap(marketMaker).toLiquidIn(frac, msg.sender);
    }

    function exercise() external {
        exerciseTail(0);
    }

    function exerciseTail(uint128 tail) public noReentrant {
        settle();
        uint128 _assert = options[msg.sender][settleIdx - 1].mul(
            settleWeight0
        ) +
            options[msg.sender][settleIdx].mul(settleWeight1) -
            tail;
        options[msg.sender][settleIdx - 1] = 0;
        options[msg.sender][settleIdx] = 0;
        _safeTransfer(token, address(msg.sender), _assert);
    }
}
