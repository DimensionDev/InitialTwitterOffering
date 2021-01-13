/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity >= 0.6.0;
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./IQLF.sol";

contract HappyTokenPool {

    struct Pool {
        uint256 packed1;            // total_address(160) hash(48) start_time_delta(24) 
                                    // expiration_time_delta(24) BIG ENDIAN
        uint256 packed2;            // total_tokens(128) limit(128)
        address creator;
        address qualification;
        address[] exchange_addrs;
        uint128[] exchanged_tokens;
        uint128[] ratios;
        mapping(address => uint256) swapped_map;
    }

    event FillSuccess (
        uint256 total,
        bytes32 id,
        address creator,
        uint256 creation_time,
        address token_address,
        string name,
        string message
    );

    event SwapSuccess (
        bytes32 id,
        address swapper,
        address from_address,
        address to_address,
        uint256 from_value,
        uint256 to_value
    );

    event DestructSuccess (
        bytes32 id,
        address token_address,
        uint256 remaining_balance,
        uint128[] exchanged_values
    );

    event WithdrawSuccess (
        bytes32 id,
        address token_address,
        uint256 withdraw_balance
    );

    using SafeERC20 for IERC20;
    uint32 nonce;
    uint256 base_timestamp;
    address public contract_creator;
    mapping(bytes32 => Pool) pool_by_id;
    string constant private magic = "Anthony Quinn Warner, 63, was identified as the bomber. Warner, \
    a 63-year-old described by one neighbor as a loner, died when his recreational vehicle exploded \
    on 2nd Avenue North in the city's downtown. The blast injured at least eight people and damaged-";
    bytes32 private seed;
    address DEFAULT_ADDRESS = 0x0000000000000000000000000000000000000000;

    constructor() public {
        contract_creator = msg.sender;
        seed = keccak256(abi.encodePacked(magic, block.timestamp, contract_creator));
        base_timestamp = 1609372800;                                    // 00:00:00 01/01/2021 GMT(UTC+0)
    }

    function fill_pool (bytes32 _hash, uint256 _start, uint256 _end, string memory name, string memory message,
                        address[] memory _exchange_addrs, uint128[] memory _ratios,
                        address _token_addr, uint256 _total_tokens, uint256 _limit, address _qualification)
    public payable {
        nonce ++;
        require(_start < _end, "Start time should be earlier than end time.");
        require(_limit <= _total_tokens, "Limit needs to be less than or equal to the total supply");
        require(_total_tokens < 2 ** 128, "No more than 2^128 tokens(incluidng decimals) allowed");
        require(IERC20(_token_addr).allowance(msg.sender, address(this)) >= _total_tokens, "Insuffcient allowance");
        require(_exchange_addrs.length > 0, "Exchange token addresses need to be set");
        require(_ratios.length == 2 * _exchange_addrs.length, "Size of ratios = 2 * size of exchange_addrs");

        bytes32 _id = keccak256(abi.encodePacked(msg.sender, block.timestamp, nonce, seed));
        Pool storage pool = pool_by_id[_id];
        pool.packed1 = wrap1(_token_addr, _hash, _start, _end);         // 256 bytes
        pool.packed2 = wrap2(_total_tokens, _limit);                    // 256 bytes
        pool.creator = msg.sender;                                      // 160 bytes
        pool.exchange_addrs = _exchange_addrs;                          // 160 bytes
        pool.qualification = _qualification;                            // 160 bytes
        for (uint256 i = 0; i < _exchange_addrs.length; i++) {
            if (_exchange_addrs[i] != DEFAULT_ADDRESS) {
                require(IERC20(_exchange_addrs[i]).totalSupply() > 0, "Not a valid ERC20");
            }
            pool.exchanged_tokens.push(0); 
        }

        for (uint256 i = 0; i < _ratios.length; i+= 2) {
            uint256 divA = SafeMath.div(_ratios[i], _ratios[i+1]);      // Non-zero checked by SafteMath.div
            uint256 divB = SafeMath.div(_ratios[i+1], _ratios[i]);
            
            if (_ratios[i] == 1) {
                require(divB == _ratios[i+1]);
            } else if (_ratios[i+1] == 1) {
                require(divA == _ratios[i]);
            } else {
                require(divA * _ratios[i+1] != _ratios[i]);
                require(divB * _ratios[i] != _ratios[i+1]);
            }
        }
        pool.ratios = _ratios;                                          // 256 * k
        IERC20(_token_addr).safeTransferFrom(msg.sender, address(this), _total_tokens);

        emit FillSuccess(_total_tokens, _id, msg.sender, block.timestamp, _token_addr, name, message);
    }

    // It takes the unhashed password and a hashed random seed generated from the user
    function swap (bytes32 id, bytes32 verification, address _recipient, 
                   bytes32 validation, uint256 exchange_addr_i, uint128 input_total) 
    public payable returns (uint256 swapped) {

        Pool storage pool = pool_by_id[id];
        address payable recipient = address(uint160(_recipient));
        require (IQLF(pool.qualification).ifQualified(msg.sender) == true, "Not Qualified");
        require (unbox(pool.packed1, 208, 24) + base_timestamp < block.timestamp, "Not started.");
        require (unbox(pool.packed1, 232, 24) + base_timestamp > block.timestamp, "Expired.");
        require (verification == keccak256(abi.encodePacked(unbox(pool.packed1, 160, 48), msg.sender)), 
                 'Wrong Password');
        require (validation == keccak256(toBytes(msg.sender)), "Validation Failed");

        uint256 total_tokens = unbox(pool.packed2, 0, 128);
        require (total_tokens > 0, "Out of Stock");

        address exchange_addr = pool.exchange_addrs[exchange_addr_i];
        uint256 ratioA = pool.ratios[exchange_addr_i*2];
        uint256 ratioB = pool.ratios[exchange_addr_i*2 + 1];
        if (exchange_addr == DEFAULT_ADDRESS) {
            require(msg.value == input_total, 'No enough ether.');
        } else {
            uint256 allowance = IERC20(exchange_addr).allowance(msg.sender, address(this));
            require(allowance >= input_total, 'No enough allowance.');
        }

        uint256 swapped_tokens;
        swapped_tokens = SafeMath.div(SafeMath.mul(input_total, ratioB), ratioA);       // 2^256=10e77 >> 10e18 * 10e18
        require(swapped_tokens > 0, "Better not draw water with a sieve");

        // Don't be greedy
        uint256 limit = unbox(pool.packed2, 128, 128);
        if (swapped_tokens > limit) {
            swapped_tokens = limit;
            input_total = uint128(SafeMath.div(SafeMath.mul(limit, ratioA), ratioB));  // Update
        } else if (swapped_tokens > total_tokens) {
            swapped_tokens = total_tokens;
            input_total = uint128(SafeMath.div(SafeMath.mul(total_tokens, ratioA), ratioB));  // Update
        }
        require(swapped_tokens <= limit);                                               // make sure
        pool.exchanged_tokens[exchange_addr_i] = uint128(SafeMath.add(pool.exchanged_tokens[exchange_addr_i], input_total));

        // Penalize greedy attackers by placing duplication check at the very last
        require (pool.swapped_map[_recipient] == 0, "Already swapped");

        pool.packed2 = rewriteBox(pool.packed2, 0, 128, SafeMath.sub(total_tokens, swapped_tokens));
        pool.swapped_map[_recipient] = swapped_tokens;

        // Transfer the token after state changing
        // ETH comes with the tx, ERC20 does not
        if (exchange_addr != DEFAULT_ADDRESS) {
            IERC20(exchange_addr).safeTransferFrom(msg.sender, address(this), input_total);
        }
        transfer_token(address(unbox(pool.packed1, 0, 160)), address(this), recipient, swapped_tokens);

        // Swap success event
        emit SwapSuccess(id, recipient, exchange_addr, address(unbox(pool.packed1, 0, 160)), 
                          input_total, swapped_tokens);
        return swapped_tokens;
    }

    // Returns 0. exchange_addrs in the given pool 1. remaining tokens 2. if expired 3. if swapped
    function check_availability (bytes32 id) external view returns (address[] memory exchange_addrs, uint256 remaining, 
                                                                    bool started, bool expired, uint256 swapped,
                                                                    uint128[] memory exchanged_tokens) {
        Pool storage pool = pool_by_id[id];
        return (
            pool.exchange_addrs,                                    // exchange_addrs if 0x0 then destructed
            unbox(pool.packed2, 0, 128),                            // remaining
            block.timestamp > unbox(pool.packed1, 208, 24) + base_timestamp,    // started
            block.timestamp > unbox(pool.packed1, 232, 24) + base_timestamp,    // expired
            pool.swapped_map[msg.sender],                           // swapped number 
            pool.exchanged_tokens                                   // exchanged tokens
        );
    }

    function destruct (bytes32 id) public {
        Pool storage pool = pool_by_id[id];
        require(msg.sender == pool.creator, "Only the pool creator can destruct.");

        address token_address = address(unbox(pool.packed1, 0, 160));
        uint256 expiration = unbox(pool.packed1, 232, 24) + base_timestamp;
        uint256 remaining_tokens = unbox(pool.packed2, 0, 128);
        require(expiration <= block.timestamp || remaining_tokens == 0, "Not expired yet");

        if (remaining_tokens != 0) {
            transfer_token(token_address, address(this), msg.sender, remaining_tokens);
        }

        for (uint256 i = 0; i < pool.exchange_addrs.length; i++) {
            if (pool.exchanged_tokens[i] > 0) {
                if (pool.exchange_addrs[i] != DEFAULT_ADDRESS)
                    transfer_token(pool.exchange_addrs[i], address(this), msg.sender, pool.exchanged_tokens[i]);
                else
                    msg.sender.transfer(pool.exchanged_tokens[i]);
            }
        }
        emit DestructSuccess(id, token_address, remaining_tokens, pool.exchanged_tokens);

        // Gas Refund
        pool.packed1 = 0;
        pool.packed2 = 0;
        pool.creator = DEFAULT_ADDRESS;
        for (uint256 i = 0; i < pool.exchange_addrs.length; i++) {
            pool.exchange_addrs[i] = DEFAULT_ADDRESS;
            pool.exchanged_tokens[i] = 0;
            pool.ratios[i*2] = 0;
            pool.ratios[i*2+1] = 0;
        }
    }

    function withdraw (bytes32 id, uint256 addr_i) public {
        Pool storage pool = pool_by_id[id];
        require(msg.sender == pool.creator, "Only the pool creator can withdraw.");

        uint256 withdraw_balance = pool.exchanged_tokens[addr_i];
        require(withdraw_balance > 0, "None of this token left");
        uint256 expiration = unbox(pool.packed1, 232, 24) + base_timestamp;
        uint256 remaining_tokens = unbox(pool.packed2, 0, 128);
        require(expiration <= block.timestamp || remaining_tokens == 0, "Not expired yet");
        address token_address = pool.exchange_addrs[addr_i];

        if (token_address != DEFAULT_ADDRESS)
            transfer_token(token_address, address(this), msg.sender, withdraw_balance);
        else
            msg.sender.transfer(withdraw_balance);
        pool.exchanged_tokens[addr_i] = 0;
        emit WithdrawSuccess(id, token_address, withdraw_balance);
    }

    // helper functions
    function wrap1 (address _token_addr, bytes32 _hash, uint256 _start, uint256 _end) internal pure 
                    returns (uint256 packed1) {
        uint256 _packed1 = 0;
        _packed1 |= box(0, 160,  uint256(_token_addr));     // token_addr = 160 bits
        _packed1 |= box(160, 48, uint256(_hash) >> 208);    // hash = 48 bits (safe?)
        _packed1 |= box(208, 24, _start);                   // start_time = 24 bits 
        _packed1 |= box(232, 24, _end);                     // expiration_time = 24 bits
        return _packed1;
    }

    function wrap2 (uint256 _total_tokens, uint256 _limit) internal pure returns (uint256 packed2) {
        uint256 _packed2 = 0;
        _packed2 |= box(0, 128, _total_tokens);             // total_tokens = 128 bits ~= 3.4e38
        _packed2 |= box(128, 128, _limit);                  // limit = 128 bits
        return _packed2;
    }

    function box (uint16 position, uint16 size, uint256 data) internal pure returns (uint256 boxed) {
        require(validRange(size, data), "Value out of range BOX");
        return data << (256 - size - position);
    }

    function unbox (uint256 base, uint16 position, uint16 size) internal pure returns (uint256 unboxed) {
        require(validRange(256, base), "Value out of range UNBOX");
        return (base << position) >> (256 - size);
    }

    function validRange (uint16 size, uint256 data) internal pure returns(bool) { 
        if (data > 2 ** uint256(size) - 1) {
            return false;
        }
        return true;
    }

    function rewriteBox (uint256 _box, uint16 position, uint16 size, uint256 data) 
    internal pure returns (uint256 boxed) {
        uint256 _boxData = box(position, size, data);
        uint256 _mask = box(position, size, uint256(-1) >> (256 - size));
        _box = (_box & ~_mask) | _boxData;
        return _box;
    }

    function transfer_token (address token_address, address sender_address,
                             address recipient_address, uint256 amount) internal {
        require(IERC20(token_address).balanceOf(sender_address) >= amount, "Balance not enough");
        IERC20(token_address).safeTransfer(recipient_address, amount);
    }
    
    // https://ethereum.stackexchange.com/questions/884/how-to-convert-an-address-to-bytes-in-solidity
    // 695 gas consumed
    function toBytes (address a) internal pure returns (bytes memory b) {
        assembly {
            let m := mload(0x40)
            a := and(a, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
            mstore(0x40, add(m, 52))
            b := m
        }
    }
}
