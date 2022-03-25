// SPDX-License-Identifier: BUSL-1.1
/*
 * Base CFMM class for poption
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

import "./Math.sol";
import "./Poption.sol";
import "./interface/IOracle.sol";

contract BaseCFMMSwap {
    using Math64x64 for uint128;
    using Math64x64 for int128;
    uint256 constant SLOT_NUM = 16;

    uint128[SLOT_NUM] public slots;
    uint128[SLOT_NUM] public liqPool;
    mapping(address => uint128) public liqPoolShare;
    uint128 public liqPoolShareAll;
    mapping(address => uint128) public valueNoFee;

    address public immutable oracle;
    Poption public immutable poption;
    address public immutable owner;
    uint256 public immutable closeTime;
    uint256 public immutable settleTime;
    uint256 public immutable destoryTime;

    bool internal locked;
    uint128 public feeRate;
    uint128 public l2FeeRate;

    bool public isOpen;

    constructor(
        address _owner,
        address _poption,
        uint256 _closeTime,
        uint256 _destoryTime,
        uint128 _feeRate,
        uint128 _l2FeeRate
    ) {
        owner = _owner;
        poption = Poption(_poption);
        address token;
        uint256 _settleTime;
        (token, oracle, _settleTime, slots) = Poption(_poption).getState();
        require(_closeTime < _settleTime && _settleTime < _destoryTime, "TCK");
        closeTime = _closeTime;
        settleTime = _settleTime;
        destoryTime = _destoryTime;
        feeRate = _feeRate;
        l2FeeRate = _l2FeeRate;
    }

    modifier noReentrant() {
        require(!locked, "RE");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "OO");
        _;
    }

    modifier onlyPoption() {
        require(msg.sender == address(poption), "OP");
        _;
    }

    modifier marketOpen() {
        if (isOpen && (block.timestamp > closeTime)) {
            isOpen = false;
        }
        require(isOpen, "MC");
        _;
    }

    function getWeight()
        internal
        view
        virtual
        returns (uint128[SLOT_NUM] memory weight)
    {
        if (block.timestamp < settleTime) {
            weight = [
                uint128(0x1000000000000000),
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000,
                0x1000000000000000
            ];
        } else {
            weight = getWeightAfterSettle(IOracle(oracle).get());
        }
    }

    function _init() internal {
        uint128[SLOT_NUM] memory _option = poption.balanceOf(address(this));
        uint128 share;
        for (uint256 i; i < SLOT_NUM; i++) {
            require(_option[i] > 100, "TL");
            liqPool[i] = _option[i];
            share += _option[i];
        }
        share = share / uint128(SLOT_NUM);
        liqPoolShare[msg.sender] += share;
        valueNoFee[msg.sender] = 0x7fffffffffffffffffffffffffffffff;
        liqPoolShareAll += share;
        isOpen = true;
    }

    function init() external virtual onlyOwner noReentrant {
        _init();
    }

    function getStatus()
        external
        view
        returns (
            uint128[SLOT_NUM] memory,
            uint128[SLOT_NUM] memory,
            uint128
        )
    {
        return (getWeight(), liqPool, feeRate);
    }

    function tradeFunction(uint128[16] memory liq, uint128[16] memory w)
        internal
        pure
        returns (int128 res)
    {
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            res += liq[i].ln().mul(int128(w[i]));
        }
    }

    function getWeightAfterSettle(uint128 price)
        internal
        view
        returns (uint128[SLOT_NUM] memory weight)
    {
        if (poption.isSettled()) {
            uint8 i = poption.settleIdx();

            weight = [uint128(0), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            weight[i] = 0x10000000000000000;
        } else {
            if (price <= slots[0]) {
                weight[0] = 0x10000000000000000;
            } else {
                weight[0] = 0;
            }
            for (uint256 i = 1; i < SLOT_NUM - 1; i++) {
                if ((slots[i - 1] < price) && (slots[i] >= price)) {
                    weight[i] = 0x10000000000000000;
                } else {
                    weight[i] = 0;
                }
            }
            if (price > slots[SLOT_NUM - 1]) {
                weight[SLOT_NUM - 1] = 0x10000000000000000;
            } else {
                weight[SLOT_NUM - 1] = 0;
            }
        }
    }

    function _toSwap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) private {
        uint128[SLOT_NUM] memory weight = getWeight();
        int256 const_now = tradeFunction(liqPool, weight);
        uint128[SLOT_NUM] memory lp_to;
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            uint128 outi = _out[i].mul(feeRate);
            require(liqPool[i] > outi, "PLQ");
            lp_to[i] = liqPool[i] + _in[i].div(feeRate) - outi;
        }
        int256 const_to = tradeFunction(lp_to, weight);
        require(const_to >= const_now, "PMC");
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            liqPool[i] = liqPool[i] + _in[i] - _out[i];
        }
    }

    function toSwap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) external noReentrant onlyPoption {
        _toSwap(_out, _in);
    }

    /** not good sign
    function swap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in,
        uint64 _seed,
        bytes calldata _signature
    ) external noReentrant marketOpen {
        _toSwap(_out, _in);
        poption.transfer(msg.sender, _out);
        poption.transferFrom(msg.sender, address(this), _in, _seed, _signature);
    }
   */

    function destory() public onlyOwner noReentrant {
        require(block.timestamp > destoryTime);
        uint128[SLOT_NUM] memory rest = poption.balanceOf(address(this));
        poption.transfer(owner, rest);
        selfdestruct(payable(owner));
    }

    function _toLiquidIn(uint128 frac, address msgSender) private {
        uint128 priceDivisor = 0;
        uint128 shareAdd = frac.mul(liqPoolShareAll);
        liqPoolShareAll += shareAdd;
        liqPoolShare[msgSender] += shareAdd;
        uint128[SLOT_NUM] memory weight = getWeight();
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            priceDivisor += uint128(weight[i]).div(liqPool[i]);
            liqPool[i] += frac.mul(liqPool[i]);
        }
        valueNoFee[msgSender] += frac.div(priceDivisor);
    }

    function toLiquidIn(uint128 frac, address sender)
        external
        onlyPoption
        noReentrant
    {
        _toLiquidIn(frac, sender);
    }

    /**
    function liquidIn(
        uint128 frac,
        uint64 _seed,
        bytes calldata _signature
    ) external noReentrant {
        uint128[SLOT_NUM] memory option;
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            option[i] = frac.mul(liqPool[i]);
        }
        poption.transferFrom(
            msg.sender,
            address(this),
            option,
            _seed,
            _signature
        );
        _toLiquidIn(frac, msg.sender);
    }
       */

    function liquidOut(uint128 _share) public noReentrant {
        uint128 share = liqPoolShare[msg.sender];
        require(share >= _share, "NES");
        uint128 priceDivisor = 0;
        uint128[SLOT_NUM] memory lqRemove;
        uint128 frac = _share.div(liqPoolShareAll);
        uint128[SLOT_NUM] memory weight = getWeight();
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            lqRemove[i] = frac.mul(liqPool[i]);
            priceDivisor += weight[i].div(liqPool[i]);
        }
        uint128 value = frac.div(priceDivisor);
        if (value > valueNoFee[msg.sender]) {
            uint128 optShare = _share.mul(
                (value - valueNoFee[msg.sender]).mul(l2FeeRate).div(value)
            );
            uint128 optFrac = optShare.div(liqPoolShareAll);
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                lqRemove[i] = lqRemove[i] - optFrac.mul(liqPool[i]);
                liqPool[i] -= lqRemove[i];
            }
            liqPoolShare[owner] += optShare;
            liqPoolShare[msg.sender] -= _share;
            liqPoolShareAll -= _share - optShare;
            valueNoFee[msg.sender] = 0;
        } else {
            liqPoolShare[msg.sender] -= _share;
            liqPoolShareAll -= _share;
            valueNoFee[msg.sender] -= value;
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                liqPool[i] -= lqRemove[i];
            }
        }
        poption.transfer(msg.sender, lqRemove);
    }

    function setFeeRate(uint128 _feeRate) external onlyOwner {
        feeRate = _feeRate;
    }
}
