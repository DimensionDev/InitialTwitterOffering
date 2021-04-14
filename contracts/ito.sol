// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
**/

pragma solidity >= 0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./IQLF.sol";

contract HappyTokenPool {

    struct Pool {
        uint256 packed1;            // qualification_address(160) the smart contract address to verify qualification
                                    // hash(40) start_time_delta(28) 
                                    // expiration_time_delta(28) BIG ENDIAN
        uint256 packed2;            // total_tokens(128) limit(128)
        uint48  unlock_time;        // unlock_time + base_timestamp = real_time
        address creator;
        address token_address;      // the target token address
        address[] exchange_addrs;   // a list of ERC20 addresses for swapping
        uint128[] exchanged_tokens; // a list of amounts of swapped tokens
        uint128[] ratios;           // a list of swap ratios
                                    // length = 2 * exchange_addrs.length
                                    // [address1, target, address2, target, ...]
                                    // e.g. [1, 10]
                                    // represents 1 tokenA to swap 10 target token
                                    // note: each ratio pair needs to be coprime
        mapping(address => uint256) swapped_map;      // swapped amount of an address
    }

    struct Packed {
        uint256 packed1;
        uint256 packed2;
    }

    // swap pool filling success event
    event FillSuccess (
        uint256 total,
        bytes32 id,
        address creator,
        uint256 creation_time,
        address token_address,
        bytes32[] message
    );

    // swap success event
    event SwapSuccess (
        bytes32 id,
        address swapper,
        address from_address,
        address to_address,
        uint256 from_value,
        uint256 to_value
    );

    // claim success event
    event ClaimSuccess (
        bytes32 id,
        address claimer,
        uint256 timestamp,
        uint256 to_value,
        address token_address
    );

    // swap pool destruct success event
    event DestructSuccess (
        bytes32 id,
        address token_address,
        uint256 remaining_balance,
        uint128[] exchanged_values
    );

    // single token withdrawl from a swap pool success even
    event WithdrawSuccess (
        bytes32 id,
        address token_address,
        uint256 withdraw_balance
    );

    modifier creatorOnly {
        require(msg.sender == contract_creator, "Contract Creator Only");
        _;
    }

    using SafeERC20 for IERC20;
    uint32 nonce;
    uint224 base_timestamp;                 // timestamp = base_timestamp + delta to save gas
    address public contract_creator;
    mapping(bytes32 => Pool) pool_by_id;    // maps an id to a Pool instance
    string constant private magic = "Anthony Quinn Warner, 63, was identified as the bomber. Warner, \
    a 63-year-old described by one neighbor as a loner, died when his recreational vehicle exploded \
    on 2nd Avenue North in the city's downtown. The blast injured at least eight people and damaged-";
    bytes32 private seed;
    address DEFAULT_ADDRESS = 0x0000000000000000000000000000000000000000;       // a universal address

    constructor() {
        contract_creator = msg.sender;
        seed = keccak256(abi.encodePacked(magic, block.timestamp, contract_creator));
        base_timestamp = 1616976000;                                    // 00:00:00 03/30/2021 GMT(UTC+0)
    }

    /**
     * @dev 
     * fill_pool() creates a swap pool with specific parameters from input
     * _hash                sha3-256(password)
     * _start               start time delta, real start time = base_timestamp + _start
     * _end                 end time delta, real end time = base_timestamp + _end
     * message              swap pool creation message, only stored in FillSuccess event
     * _exchange_addrs      swap token list (0x0 for ETH, only supports ETH and ERC20 now)
     * _ratios              swap pair ratio list
     * _unlock_time         unlock time delta real unlock time = base_timestamp + _unlock_time
     * _token_addr          swap target token address
     * _total_tokens        target token total swap amount
     * _limit               target token single swap limit
     * _qualification       the qualification contract address based on IQLF to determine qualification
     * This function takes the above parameters and creates the pool. _total_tokens of the target token
     * will be successfully transferred to this contract securely on a successful run of this function.
    **/
    function fill_pool (bytes32 _hash, uint256 _start, uint256 _end, bytes32[] memory message,
                        address[] memory _exchange_addrs, uint128[] memory _ratios, uint256 _unlock_time,
                        address _token_addr, uint256 _total_tokens, uint256 _limit, address _qualification)
    public payable {
        nonce ++;
        require(_start < _end, "Start time should be earlier than end time.");
        require(_end < _unlock_time || _unlock_time == 0, "End time should be earlier than unlock time");
        require(_limit <= _total_tokens, "Limit needs to be less than or equal to the total supply");
        require(_total_tokens < 2 ** 128, "No more than 2^128 tokens(incluidng decimals) allowed");
        require(IERC20(_token_addr).allowance(msg.sender, address(this)) >= _total_tokens, "Insuffcient allowance");
        require(_exchange_addrs.length > 0, "Exchange token addresses need to be set");
        require(_ratios.length == 2 * _exchange_addrs.length, "Size of ratios = 2 * size of exchange_addrs");

        bytes32 _id = keccak256(abi.encodePacked(msg.sender, block.timestamp, nonce, seed));
        Pool storage pool = pool_by_id[_id];
        pool.packed1 = wrap1(_qualification, _hash, _start, _end);      // 256 bytes    detail in wrap1()
        pool.packed2 = wrap2(_total_tokens, _limit);                    // 256 bytes    detail in wrap2()
        pool.unlock_time = uint48(_unlock_time);                        // 48  bytes    unlock_time 0 -> unlocked
        pool.creator = msg.sender;                                      // 160 bytes    pool creator
        pool.exchange_addrs = _exchange_addrs;                          // 160 bytes    target token
        pool.token_address = _token_addr;                               // 160 bytes    target token address

        // Init each token swapped amount to 0
        for (uint256 i = 0; i < _exchange_addrs.length; i++) {
            if (_exchange_addrs[i] != DEFAULT_ADDRESS) {
                // TODO: Is there a better way to validate an ERC20?
                require(IERC20(_exchange_addrs[i]).totalSupply() > 0, "Not a valid ERC20");
            }
            pool.exchanged_tokens.push(0); 
        }

        // Make sure each ratio is co-prime to prevent overflow
        for (uint256 i = 0; i < _ratios.length; i+= 2) {
            uint256 divA = SafeMath.div(_ratios[i], _ratios[i+1]);      // Non-zero checked by SafteMath.div
            uint256 divB = SafeMath.div(_ratios[i+1], _ratios[i]);      // Non-zero checked by SafteMath.div
            
            if (_ratios[i] == 1) {
                require(divB == _ratios[i+1]);
            } else if (_ratios[i+1] == 1) {
                require(divA == _ratios[i]);
            } else {
                // if a and b are co-prime, then a / b * b != a and b / a * a != b
                require(divA * _ratios[i+1] != _ratios[i]);
                require(divB * _ratios[i] != _ratios[i+1]);
            }
        }
        pool.ratios = _ratios;                                          // 256 * k
        IERC20(_token_addr).safeTransferFrom(msg.sender, address(this), _total_tokens);

        emit FillSuccess(_total_tokens, _id, msg.sender, block.timestamp, _token_addr, message);
    }

    /**
     * @dev
     * swap() allows users to swap tokens in a swap pool
     * id                   swap pool id
     * verification         sha3-256(sha3-256(password)[:40]+swapper_address)
     * _recipient           swapped token recipient
     * validation           sha3-256(swapper_address)
     * exchange_addr_i     the index of the exchange address of the list
     * input_total          the input amount of the specific token
     * This function is called by the swapper who approves the specific ERC20 or directly transfer the ETH
     * first and wants to swap the desired amount of the target token. The swapped amount is calculated
     * based on the pool ratio. After swap successfully, the same account can not swap the same pool again.
    **/

    function swap (bytes32 id, bytes32 verification, address, 
                   bytes32 validation, uint256 exchange_addr_i, uint128 input_total) 
    public payable returns (uint256 swapped) {

        Pool storage pool = pool_by_id[id];
        Packed memory packed = Packed(pool.packed1, pool.packed2);
        require (
            IQLF(address(uint160(unbox(packed.packed1, 0, 160)))).logQualified() == true, "Not Qualified"
        );
        require (unbox(packed.packed1, 200, 28) + base_timestamp < block.timestamp, "Not started.");
        require (unbox(packed.packed1, 228, 28) + base_timestamp > block.timestamp, "Expired.");
        // sha3(sha3(passowrd)[:40] + msg.sender) so that the raw password will never appear in the contract
        require (verification == keccak256(abi.encodePacked(unbox(packed.packed1, 160, 40), msg.sender)), 
                 'Wrong Password');
        // sha3(msg.sender) to protect from front runs (but this is kinda naive since the contract is open sourced)
        require (validation == keccak256(abi.encodePacked(msg.sender)), "Validation Failed");

        uint256 total_tokens = unbox(packed.packed2, 0, 128);
        // revert if the pool is empty
        require (total_tokens > 0, "Out of Stock");

        address exchange_addr = pool.exchange_addrs[exchange_addr_i];
        uint256 ratioA = pool.ratios[exchange_addr_i*2];
        uint256 ratioB = pool.ratios[exchange_addr_i*2 + 1];
        // check if the input is enough for the desired transfer
        if (exchange_addr == DEFAULT_ADDRESS) {
            require(msg.value == input_total, 'No enough ether.');
        } else {
            uint256 allowance = IERC20(exchange_addr).allowance(msg.sender, address(this));
            require(allowance >= input_total, 'No enough allowance.');
        }

        uint256 swapped_tokens;
        // this calculation won't be overflow thanks to the SafeMath and the co-prime test
        swapped_tokens = SafeMath.div(SafeMath.mul(input_total, ratioB), ratioA);       // 2^256=10e77 >> 10e18 * 10e18
        require(swapped_tokens > 0, "Better not draw water with a sieve");

        uint256 limit = unbox(packed.packed2, 128, 128);
        if (swapped_tokens > limit) {
            // don't be greedy - you can only get at most limit tokens
            swapped_tokens = limit;
            input_total = uint128(SafeMath.div(SafeMath.mul(limit, ratioA), ratioB));           // Update input_total
        } else if (swapped_tokens > total_tokens) {
            // if the left tokens are not enough
            swapped_tokens = total_tokens;
            input_total = uint128(SafeMath.div(SafeMath.mul(total_tokens, ratioA), ratioB));    // Update input_total
            // return the eth
            if (exchange_addr == DEFAULT_ADDRESS)
                payable(msg.sender).transfer(msg.value - input_total);
        }
        require(swapped_tokens <= limit);                                                       // make sure again
        pool.exchanged_tokens[exchange_addr_i] = uint128(SafeMath.add(pool.exchanged_tokens[exchange_addr_i], 
                                                                      input_total));            // update exchanged

        // penalize greedy attackers by placing duplication check at the very last
        require (pool.swapped_map[msg.sender] == 0, "Already swapped");

        // update the remaining tokens and swapped token mapping
        pool.packed2 = rewriteBox(packed.packed2, 0, 128, SafeMath.sub(total_tokens, swapped_tokens));
        pool.swapped_map[msg.sender] = swapped_tokens;

        // transfer the token after state changing
        // ETH comes with the tx, but ERC20 does not - INPUT
        if (exchange_addr != DEFAULT_ADDRESS) {
            IERC20(exchange_addr).safeTransferFrom(msg.sender, address(this), input_total);
        }

        // Swap success event
        emit SwapSuccess(id, msg.sender, exchange_addr, pool.token_address, input_total, swapped_tokens);

        // if unlock_time == 0, transfer the swapped tokens to the recipient address (msg.sender) - OUTPUT
        // if not, claim() needs to be called to get the token
        if (pool.unlock_time == 0) {
            transfer_token(pool.token_address, address(this), msg.sender, swapped_tokens);
            emit ClaimSuccess(id, msg.sender, block.timestamp, swapped_tokens, pool.token_address);
        }
            
        return swapped_tokens;
    }

    /**
     * check_availability() returns a bunch of pool info given a pool id
     * id                    swap pool id
     * this function returns 1. exchange_addrs that can be used to determine the index
     *                       2. remaining target tokens
     *                       3. if started
     *                       4. if ended
     *                       5. swapped amount of the query address
     *                       5. exchanged amount of each token
    **/

    function check_availability (bytes32 id) external view 
        returns (address[] memory exchange_addrs, uint256 remaining, 
                 bool started, bool expired, bool unlocked, uint256 unlock_time,
                 uint256 swapped, uint128[] memory exchanged_tokens) {
        Pool storage pool = pool_by_id[id];
        return (
            pool.exchange_addrs,                                                // exchange_addrs 0x0 means destructed
            unbox(pool.packed2, 0, 128),                                        // remaining
            block.timestamp > unbox(pool.packed1, 200, 28) + base_timestamp,    // started
            block.timestamp > unbox(pool.packed1, 228, 28) + base_timestamp,    // expired
            block.timestamp > pool.unlock_time + base_timestamp,                // unlocked
            pool.unlock_time + base_timestamp,                                  // unlock_time
            pool.swapped_map[msg.sender],                                       // swapped number 
            pool.exchanged_tokens                                               // exchanged tokens
        );
    }

    function claim(bytes32[] memory ito_ids) public {
        uint256 claimed_amount;
        for (uint256 i = 0; i < ito_ids.length; i++) {
            Pool storage pool = pool_by_id[ito_ids[i]];
            if (pool.unlock_time + base_timestamp > block.timestamp)
                continue;
            claimed_amount = pool.swapped_map[msg.sender];
            if (claimed_amount == 0)
                continue;
            pool.swapped_map[msg.sender] = 0;
            transfer_token(pool.token_address, address(this), msg.sender, claimed_amount);

            emit ClaimSuccess(ito_ids[i], msg.sender, block.timestamp, claimed_amount, pool.token_address);
        }
    }

    function setUnlockTime(bytes32 id, uint256 _unlock_time) public {
        Pool storage pool = pool_by_id[id];
        require(pool.creator == msg.sender, "Pool Creator Only");
        pool.unlock_time = uint48(_unlock_time);
    }

    /**
     * destruct() destructs the given pool given the pool id
     * id                    swap pool id
     * this function can only be called by the pool creator. after validation, it transfers all the remaining token 
     * (if any) and all the swapped tokens to the pool creator. it will then destruct the pool by reseting almost 
     * all the variables to zero to get the gas refund.
     * note that this function may not work if a pool needs to transfer over ~200 tokens back to the address due to 
     * the block gas limit. we have another function withdraw() to help the pool creator to withdraw a single token 
    **/

    function destruct (bytes32 id) public {
        Pool storage pool = pool_by_id[id];
        require(msg.sender == pool.creator, "Only the pool creator can destruct.");

        uint256 expiration = unbox(pool.packed1, 228, 28) + base_timestamp;
        uint256 remaining_tokens = unbox(pool.packed2, 0, 128);
        // only after expiration or the pool is empty
        require(expiration <= block.timestamp || remaining_tokens == 0, "Not expired yet");

        // if any left in the pool
        if (remaining_tokens != 0) {
            transfer_token(pool.token_address, address(this), msg.sender, remaining_tokens);
        }
        
        // transfer the swapped tokens accordingly
        // note this loop may exceed the block gas limit so if >200 exchange_addrs this may not work
        for (uint256 i = 0; i < pool.exchange_addrs.length; i++) {
            if (pool.exchanged_tokens[i] > 0) {
                // ERC20
                if (pool.exchange_addrs[i] != DEFAULT_ADDRESS)
                    transfer_token(pool.exchange_addrs[i], address(this), msg.sender, pool.exchanged_tokens[i]);
                // ETH
                else
                    payable(msg.sender).transfer(pool.exchanged_tokens[i]);
            }
        }
        emit DestructSuccess(id, pool.token_address, remaining_tokens, pool.exchanged_tokens);

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

    /**
     * withdraw() transfers out a single token after a pool is expired or empty 
     * id                    swap pool id
     * addr_i                withdraw token index
     * this function can only be called by the pool creator. after validation, it transfers the addr_i th token 
     * out to the pool creator address.
    **/

    function withdraw (bytes32 id, uint256 addr_i) public {
        Pool storage pool = pool_by_id[id];
        require(msg.sender == pool.creator, "Only the pool creator can withdraw.");

        uint256 withdraw_balance = pool.exchanged_tokens[addr_i];
        require(withdraw_balance > 0, "None of this token left");
        uint256 expiration = unbox(pool.packed1, 228, 28) + base_timestamp;
        uint256 remaining_tokens = unbox(pool.packed2, 0, 128);
        // only after expiration or the pool is empty
        require(expiration <= block.timestamp || remaining_tokens == 0, "Not expired yet");
        address token_address = pool.exchange_addrs[addr_i];

        // ERC20
        if (token_address != DEFAULT_ADDRESS)
            transfer_token(token_address, address(this), msg.sender, withdraw_balance);
        // ETH
        else
            payable(msg.sender).transfer(withdraw_balance);
        // clear the record
        pool.exchanged_tokens[addr_i] = 0;
        emit WithdrawSuccess(id, token_address, withdraw_balance);
    }

    // helper functions TODO: migrate this to a helper file

    /**
     * _qualification the smart contract address to verify qualification      160
     * _hash          sha3-256(password)                                      40
     * _start         start time delta                                        28
     * _end           end time  delta                                         28
     * wrap1() inserts the above variables into a 32-word block
    **/

    function wrap1 (address _qualification, bytes32 _hash, uint256 _start, uint256 _end) internal pure 
                    returns (uint256 packed1) {
        uint256 _packed1 = 0;
        _packed1 |= box(0, 160,  uint256(uint160(_qualification)));     // _qualification = 160 bits
        _packed1 |= box(160, 40, uint256(_hash) >> 216);                // hash = 40 bits (safe?)
        _packed1 |= box(200, 28, _start);                               // start_time = 28 bits 
        _packed1 |= box(228, 28, _end);                                 // expiration_time = 28 bits
        return _packed1;
    }

    /**
     * _total_tokens   target remaining         128
     * _limit          single swap limit        128
     * wrap2() inserts the above variables into a 32-word block
    **/

    function wrap2 (uint256 _total_tokens, uint256 _limit) internal pure returns (uint256 packed2) {
        uint256 _packed2 = 0;
        _packed2 |= box(0, 128, _total_tokens);             // total_tokens = 128 bits ~= 3.4e38
        _packed2 |= box(128, 128, _limit);                  // limit = 128 bits
        return _packed2;
    }

    /**
     * position      position in a memory block
     * size          data size
     * data          data
     * box() inserts the data in a 256bit word with the given position and returns it
     * data is checked by validRange() to make sure it is not over size 
    **/

    function box (uint16 position, uint16 size, uint256 data) internal pure returns (uint256 boxed) {
        require(validRange(size, data), "Value out of range BOX");
        assembly {
            // data << position
            boxed := shl(position, data)
        }
    }

    /**
     * position      position in a memory block
     * size          data size
     * base          base data
     * unbox() extracts the data out of a 256bit word with the given position and returns it
     * base is checked by validRange() to make sure it is not over size 
    **/

    function unbox (uint256 base, uint16 position, uint16 size) internal pure returns (uint256 unboxed) {
        require(validRange(256, base), "Value out of range UNBOX");
        assembly {
            // (((1 << size) - 1) & base >> position)
            unboxed := and(sub(shl(size, 1), 1), shr(position, base))

        }
    }

    /**
     * size          data size
     * data          data
     * validRange()  checks if the given data is over the specified data size
    **/

    function validRange (uint16 size, uint256 data) internal pure returns(bool ifValid) { 
        assembly {
            // 2^size > data or size ==256
            ifValid := or(eq(size, 256), gt(shl(size, 1), data))
        }
    }

    /**
     * _box          32byte data to be modified
     * position      position in a memory block
     * size          data size
     * data          data to be inserted
     * rewriteBox() updates a 32byte word with a data at the given position with the specified size
    **/

    function rewriteBox (uint256 _box, uint16 position, uint16 size, uint256 data) 
                        internal pure returns (uint256 boxed) {
        assembly {
            // mask = ~((1 << size - 1) << position)
            // _box = (mask & _box) | ()data << position)
            boxed := or( and(_box, not(shl(position, sub(shl(size, 1), 1)))), shl(position, data))
        }
    }

    /**
     * token_address      ERC20 address
     * sender_address     sender address
     * recipient_address  recipient address
     * amount             transfer amount
     * transfer_token() transfers a given amount of ERC20 from the sender address to the recipient address
    **/
   
    function transfer_token (address token_address, address sender_address,
                             address recipient_address, uint256 amount) internal {
        require(IERC20(token_address).balanceOf(sender_address) >= amount, "Balance not enough");
        IERC20(token_address).safeTransfer(recipient_address, amount);
    }
    
}
