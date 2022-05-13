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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract BaseCFMMSwap is ISwap, IERC20Metadata {
    using Math64x64 for uint128;
    using Math64x64 for int128;

    uint128[SLOT_NUM] public slots;
    uint128[SLOT_NUM] public liqPool;
    mapping(address => uint128) public liqPoolShare;
    uint128 public liqPoolShareAll;
    mapping(address => uint128) public valueNoFee;
    mapping(address => mapping(address => uint256)) public allowances;

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
    string public symbol;
    string public name;
    uint8 public decimals;

    event Swap(
        uint128[SLOT_NUM] _in,
        uint128[SLOT_NUM] _out,
        uint128[SLOT_NUM] weight,
        uint128[SLOT_NUM] liqPool
    );

    event Mint(
        address owner,
        uint128 share,
        uint128 shareAll,
        uint128[SLOT_NUM] liqPool
    );

    event Burn(
        address owner,
        uint128 share,
        uint128 shareAll,
        uint128[SLOT_NUM] liqPool
    );

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
        symbol = "";
        name = "";
        decimals = IERC20Metadata(token).decimals();
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
        public
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
        liqPoolShare[owner] += share;
        valueNoFee[owner] = 0x7fffffffffffffffffffffffffffffff;
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
        emit Swap(_in, _out, weight, liqPool);
    }

    function toSwap(
        uint128[SLOT_NUM] calldata _out,
        uint128[SLOT_NUM] calldata _in
    ) external noReentrant onlyPoption {
        require(_isInited && block.timestamp < closeTime, "MCT");
        _toSwap(_out, _in);
    }

    function _toLiquidIn(uint128 _frac, address _sender) internal {
        uint128 priceDivisor = 0;
        uint128 shareAdd = _frac.mul(liqPoolShareAll);
        liqPoolShareAll += shareAdd;
        liqPoolShare[_sender] += shareAdd;
        emit Transfer(address(0), _sender, shareAdd);
        uint128[SLOT_NUM] memory weight = getWeight();
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            priceDivisor += uint128(weight[i]).div(liqPool[i]);
            liqPool[i] += _frac.mul(liqPool[i]);
        }
        valueNoFee[_sender] += _frac.div(priceDivisor);
        emit Mint(_sender, shareAdd, liqPoolShareAll, liqPool);
    }

    function toLiquidIn(uint128 _frac, address _sender)
        external
        onlyPoption
        noReentrant
    {
        _toLiquidIn(_frac, _sender);
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
            emit Transfer(msg.sender, address(0), _share - optShare);
            emit Burn(msg.sender, _share - optShare, liqPoolShareAll, liqPool);
        } else {
            liqPoolShare[msg.sender] -= _share;
            liqPoolShareAll -= _share;
            valueNoFee[msg.sender] -= value;
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                liqPool[i] -= lqRemove[i];
            }
            emit Transfer(msg.sender, address(0), _share);
            emit Burn(msg.sender, _share, liqPoolShareAll, liqPool);
        }
        poption.transfer(msg.sender, lqRemove);
    }

    function destroy() public onlyOwner noReentrant {
        require(block.timestamp > destroyTime, "NDT");
        uint128[SLOT_NUM] memory rest = poption.balanceOfAll(address(this));
        poption.transfer(owner, rest);
        selfdestruct(payable(owner));
    }

    // IERC20 implement
    function totalSupply() public view returns (uint256) {
        return uint256(liqPoolShareAll);
    }

    function balanceOf(address _owner) public view returns (uint256 balance) {
        return uint256(liqPoolShare[_owner]);
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {
        require(from != address(0), "F 0 Addr");
        require(to != address(0), "T 0 Addr");

        uint128 fromShare = liqPoolShare[from];
        require(fromShare >= amount, "Ex Share");
        unchecked {
            liqPoolShare[from] = fromShare - uint128(amount);
        }
        liqPoolShare[to] += uint128(amount);

        emit Transfer(from, to, amount);
    }

    function transfer(address _to, uint256 _value)
        public
        returns (bool success)
    {
        _transfer(msg.sender, _to, _value);
        return true;
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) public returns (bool success) {
        uint256 currentAllowance = allowances[_from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= _value, "No En Al");
            unchecked {
                allowances[_from][msg.sender] = currentAllowance - _value;
                emit Approval(_from, msg.sender, _value);
            }
        }
        _transfer(_from, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value)
        public
        returns (bool success)
    {
        require(_spender != address(0), "A 0 Addr");

        allowances[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _shareOwner, address _spender)
        external
        view
        returns (uint256)
    {
        return allowances[_shareOwner][_spender];
    }
}
