// SPDX-License-Identifier: BUSL-1.1
/*
 * Poption contract
 * Copyright ©2022 by Poption.
 * Author: Hydrogenbear <hydrogenbear@poption.org>
 */
pragma solidity ^0.8.4;
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "./interface/IOracle.sol";
import "./interface/ISwap.sol";
import "./Math.sol";

contract Poption is IERC1155 {
    using Math64x64 for uint128;

    uint128[SLOT_NUM] public slots;
    uint256[] public allIds;
    mapping(address => uint128[SLOT_NUM]) public options;
    mapping(bytes32 => bool) public usedHash;
    mapping(address => mapping(address => bool)) private approval;
    uint128 public totalLockedAsset;

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
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            allIds.push(i);
        }
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

    function balanceOfAll(address addr)
        external
        view
        returns (uint128[SLOT_NUM] memory)
    {
        return options[addr];
    }

    function _safeTokenTransferFrom(
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

    function _safeTokenTransfer(
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
        require(_to != address(0), "T0Addr");
        uint256[] memory value = new uint256[](SLOT_NUM);
        unchecked {
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                uint128 amount = _option[i];
                if (amount > 0) {
                    require(amount <= options[_from][i], "NEO");
                    options[_to][i] += amount;
                    options[_from][i] -= amount;
                    value[i] = amount;
                }
            }
            emit TransferBatch(msg.sender, _from, _to, allIds, value);
        }
    }

    function transfer(address _recipient, uint128[SLOT_NUM] calldata _option)
        external
    {
        _transfer(msg.sender, _recipient, _option);
    }

    function mint(uint128 _assert) public noReentrant {
        _safeTokenTransferFrom(token, msg.sender, address(this), _assert);
        uint256[] memory value = new uint256[](SLOT_NUM);
        for (uint256 i = 0; i < SLOT_NUM; i++) {
            options[msg.sender][i] += _assert;
        }
        totalLockedAsset += _assert;
        emit TransferBatch(msg.sender, address(0), msg.sender, allIds, value);
    }

    function burn(uint128 _assert) public noReentrant {
        uint256[] memory value = new uint256[](SLOT_NUM);
        unchecked {
            for (uint256 i = 0; i < SLOT_NUM; i++) {
                require(_assert <= options[msg.sender][i], "NEO");
                options[msg.sender][i] -= _assert;
                value[i] = _assert;
            }
        }
        _safeTokenTransfer(token, address(msg.sender), uint256(_assert));
        totalLockedAsset -= _assert;
        emit TransferBatch(msg.sender, msg.sender, address(0), allIds, value);
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
        _transfer(marketMaker, msg.sender, _out);
        _transfer(msg.sender, marketMaker, _in);
        ISwap(marketMaker).toSwap(_out, _in);
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
        uint256[] memory value = new uint256[](SLOT_NUM);
        value[settleIdx - 1] = options[msg.sender][settleIdx - 1];
        value[settleIdx] = options[msg.sender][settleIdx];

        options[msg.sender][settleIdx - 1] = 0;
        options[msg.sender][settleIdx] = 0;
        _safeTokenTransfer(token, address(msg.sender), _assert);
        totalLockedAsset -= _assert;
        emit TransferBatch(msg.sender, msg.sender, address(0), allIds, value);
    }

    /** ERC1155 interface */

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function balanceOf(address addr, uint256 i)
        external
        view
        returns (uint256)
    {
        return options[addr][i];
    }

    function balanceOfBatch(
        address[] calldata _accounts,
        uint256[] calldata _ids
    ) external view returns (uint256[] memory) {
        require(_accounts.length == _ids.length, "ERC1155: length mismatch");

        uint256[] memory batchBalances = new uint256[](_accounts.length);

        for (uint256 i = 0; i < _accounts.length; ++i) {
            batchBalances[i] = options[_accounts[i]][_ids[i]];
        }

        return batchBalances;
    }

    function setApprovalForAll(address operator, bool approved) external {
        approval[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(address account, address operator)
        public
        view
        returns (bool)
    {
        return approval[account][operator];
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external {
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "NO APPROVAL"
        );
        require(to != address(0), "ZERO ADDRESS");
        require(id < SLOT_NUM, "WRONG ID");
        require(amount <= options[from][id], "NE BA");
        options[to][id] += uint128(amount);
        unchecked {
            options[from][id] -= uint128(amount);
        }
        emit TransferSingle(msg.sender, from, to, id, amount);
        _doSafeTransferAcceptanceCheck(msg.sender, from, to, id, amount, data);
    }

    /**
     * @dev See {IERC1155-safeBatchTransferFrom}.
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external {
        require(to != address(0), "ZERO ADDRESS");
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "NO APPROVAL"
        );
        require(ids.length == amounts.length, "LEN MM");
        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            require(id < SLOT_NUM, "WRONG ID");
            require(amount <= options[from][id], "NE BA");
            options[to][id] += uint128(amount);
            unchecked {
                options[from][id] -= uint128(amount);
            }
        }
        emit TransferBatch(msg.sender, from, to, ids, amounts);
        _doSafeBatchTransferAcceptanceCheck(
            msg.sender,
            from,
            to,
            ids,
            amounts,
            data
        );
    }

    // Below Code Adapted From openzeppelin-contracts/contracts/token/ERC1155/ERC1155.sol
    function _doSafeTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private {
        if (to.code.length > 0) {
            try
                IERC1155Receiver(to).onERC1155Received(
                    operator,
                    from,
                    id,
                    amount,
                    data
                )
            returns (bytes4 response) {
                if (response != IERC1155Receiver.onERC1155Received.selector) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }

    function _doSafeBatchTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) private {
        if (to.code.length > 0) {
            try
                IERC1155Receiver(to).onERC1155BatchReceived(
                    operator,
                    from,
                    ids,
                    amounts,
                    data
                )
            returns (bytes4 response) {
                if (
                    response != IERC1155Receiver.onERC1155BatchReceived.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non ERC1155Receiver implementer");
            }
        }
    }
}
