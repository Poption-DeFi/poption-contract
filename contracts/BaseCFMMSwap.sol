// SPDX-License-Identifier: BUSL-1.1
/*
 * Base CFMM class for poption
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

import "./Math.sol";
import "./Poption.sol";
import "./SlotNum.sol";
import "./interface/IOracle.sol";
import "./interface/ISwap.sol";

contract BaseCFMMSwap is ISwap {
    using Math64x64 for uint128;
    using Math64x64 for int128;

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
    uint256 public immutable destroyTime;

    bool internal locked;
    uint128 public feeRate;
    uint128 public l2FeeRate;

    bool internal _isInited;

    constructor(
        address _owner,
        address _poption,
        uint256 _closeTime,
        uint256 _destroyTime,
        uint128 _feeRate,
        uint128 _l2FeeRate
    ) {
        owner = _owner;
        poption = Poption(_poption);
        address token;
        uint256 _settleTime;
        (token, oracle, _settleTime, slots) = Poption(_poption).getState();
        require(_closeTime < _settleTime && _settleTime < _destroyTime, "TCK");
        closeTime = _closeTime;
        settleTime = _settleTime;
        destroyTime = _destroyTime;
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

    function getWeight()
        internal
        view
        virtual
        returns (uint128[SLOT_NUM] memory weight)
    {
        if (block.timestamp < settleTime) {
            unchecked {
                for (uint256 i = 0; i < SLOT_NUM; i++) {
                    weight[i] = uint128(Math64x64.ONE / SLOT_NUM);
                }
            }
        } else {
            weight = getWeightAfterSettle();
        }
    }

    function _init() internal {
        uint128[SLOT_NUM] memory _option = poption.balanceOfAll(address(this));
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
    }

    function init() external virtual noReentrant {
        require(!_isInited, "INITED");
        _isInited = true;
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

    function tradeFunction(
        uint128[SLOT_NUM] memory liq,
        uint128[SLOT_NUM] memory w
    ) internal pure returns (int128 res) {
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            res += liq[i].ln().mul(int128(w[i]));
        }
    }

    function getWeightAfterSettle()
        internal
        view
        returns (uint128[SLOT_NUM] memory weight)
    {
        uint8 settleIdx;
        uint128 settleWeight0;
        uint128 settleWeight1;
        if (poption.isSettled()) {
            settleIdx = poption.settleIdx();
            settleWeight0 = poption.settleWeight0();
            settleWeight1 = poption.settleWeight1();
        } else {
            uint128 price = IOracle(oracle).get();
            if (price <= slots[0]) {
                settleIdx = 1;
                settleWeight0 = 0x010000000000000000;
                settleWeight1 = 0;
            } else if (price >= slots[SLOT_NUM - 1]) {
                settleIdx = uint8(SLOT_NUM - 1);
                settleWeight0 = 0;
                settleWeight1 = 0x010000000000000000;
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
        uint128 p0 = settleWeight0.mul(liqPool[settleIdx - 1]);
        uint128 p1 = settleWeight1.mul(liqPool[settleIdx]);
        weight[settleIdx - 1] = p0.div(p0 + p1);
        weight[settleIdx] = p1.div(p0 + p1);
    }

    function _toSwap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) internal {
        uint128[SLOT_NUM] memory weight = getWeight();
        int256 constNow = tradeFunction(liqPool, weight);
        uint128[SLOT_NUM] memory lpTo;
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            uint128 outi = _out[i].mul(feeRate);
            require(liqPool[i] > outi, "PLQ");
            lpTo[i] = liqPool[i] + _in[i].div(feeRate) - outi;
        }
        int256 constTo = tradeFunction(lpTo, weight);
        require(constTo >= constNow, "PMC");
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            liqPool[i] = liqPool[i] + _in[i] - _out[i];
        }
    }

    function toSwap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) external noReentrant onlyPoption {
        require(_isInited && block.timestamp < closeTime, "MCT");
        _toSwap(_out, _in);
    }

    function destroy() public onlyOwner noReentrant {
        require(block.timestamp > destroyTime, "NDT");
        uint128[SLOT_NUM] memory rest = poption.balanceOfAll(address(this));
        poption.transfer(owner, rest);
        selfdestruct(payable(owner));
    }

    function _toLiquidIn(uint128 frac, address msgSender) internal {
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
