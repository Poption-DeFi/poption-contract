// SPDX-License-Identifier: BUSL-1.1
/*
 * Black-Scholes based CFMM class for poption
 * Copyright ©2022 by Poption.org.
 * Author: Poption <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;

import "./Math.sol";
import "./Poption.sol";
import "./BaseCFMMSwap.sol";
import "./interface/IOracle.sol";

contract BlackScholesSwap is BaseCFMMSwap {
    using Math64x64 for uint128;
    using Math64x64 for int128;
    uint128 public volatility;
    int128[SLOT_NUM] public lnSlots;
    bool public isCash;

    constructor(
        address _owner,
        address _poption,
        uint256 _closeTime,
        uint256 _destoryTime,
        uint128 _feeRate,
        uint128 _l2FeeRate,
        uint128 _volatility,
        bool _isCash
    )
        BaseCFMMSwap(
            _owner,
            _poption,
            _closeTime,
            _destoryTime,
            _feeRate,
            _l2FeeRate
        )
    {
        volatility = _volatility;
        isCash = _isCash;
    }

    function init() external override noReentrant {
        require(!_isInited, "INITED");
        _isInited = true;
        super._init();
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            lnSlots[i] = slots[i].ln();
        }
    }

    function getWeight()
        public
        view
        override
        returns (uint128[SLOT_NUM] memory weight)
    {
        if (block.timestamp < settleTime) {
            uint128 price = IOracle(oracle).get();
            int128 std = int128(
                volatility.mul(
                    (uint128((settleTime - block.timestamp) << 64)).sqrt()
                )
            );
            int128 lnPriceDivStd = price.ln().div(std);
            int128 bias0;
            int128 bias1;
            uint128 scale;
            if (isCash) {
                bias0 = lnPriceDivStd - std / 2;
                bias1 = lnPriceDivStd + std / 2;
                scale = price;
            } else {
                bias0 = lnPriceDivStd + std / 2;
                bias1 = lnPriceDivStd + (std * 3) / 2;
                scale = price.mul(uint128(std.mul(std)).exp());
            }
            uint256 i;
            int128 x = lnSlots[0].div(std);
            uint128 a0 = Math64x64.normCdf(x - bias0);
            uint128 t0 = Math64x64.normCdf(x - bias1).mul(scale);
            weight[0] = a0;
            for (i = 1; i < SLOT_NUM; i++) {
                x = lnSlots[i].div(std);
                uint128 a1 = Math64x64.normCdf(x - bias0);
                uint128 t1 = Math64x64.normCdf(x - bias1).mul(scale);
                uint128 gap = slots[i] - slots[i - 1];
                uint128 aa = (a1 - a0).mul(slots[i]) + t0;
                if (aa < t1) {
                    weight[i - 1] += 0;
                } else {
                    weight[i - 1] += (aa - t1).div(gap);
                }
                aa = (a1 - a0).mul(slots[i - 1]) + t0;
                if (aa > t1) {
                    weight[i] = 0;
                } else {
                    weight[i] = (t1 - aa).div(gap);
                }
                a0 = a1;
                t0 = t1;
            }
            weight[SLOT_NUM - 1] += 0x10000000000000000 - a0;
        } else {
            weight = getWeightAfterSettle();
        }
    }
}
