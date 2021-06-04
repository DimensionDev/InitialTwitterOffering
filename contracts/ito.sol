// SPDX-License-Identifier: MIT

/**
 * @author          Yisi Liu
 * @contact         yisiliu@gmail.com
 * @author_time     01/06/2021
 * @maintainer      Hancheng Zhou, Yisi Liu
 * @maintain_time   04/15/2021
**/

pragma solidity >= 0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./IQLF.sol";

contract HappyTokenPool {
    struct Packed1 {
        address qualification_addr;
        uint40 password;
    }

    struct Packed2 {
        uint128 total_tokens;
        uint128 limit;
    }

    struct Packed3 {
        address token_address;
        uint32 start_time;
        uint32 end_time;
        uint32 unlock_time;
    }

    struct Pool {
        Packed1 packed1;
        Packed2 packed2;
        Packed3 packed3;

        address creator;
        address[] exchange_addrs;   // a list of ERC20 addresses for swapping
        uint128[] exchanged_tokens; // a list of amounts of swapped tokens
        uint128[] ratios;           // a list of swap ratios
                                    // length = 2 * exchange_addrs.length
                                    // [address1, target, address2, target, ...]
                                    // e.g. [1, 10]
                                    // represents 1 tokenA to swap 10 target token
                                    // note: each ratio pair needs to be coprime
        // Change: ABI compatible with existing contract
        // Add more states, like swapped, claimed, etc
        mapping(address => uint256) swapped_map;      // swapped amount of an address
    }

    // Change: ABI NOT compatible with existing contract
    // Using indexed event
    // swap pool filling success event
    event FillSuccess (
        address indexed creator,
        bytes32 indexed id,
        uint256 total,
        uint256 creation_time,
        address token_address,
        string message
    );

    // swap success event
    event SwapSuccess (
        bytes32 indexed id,
        address indexed swapper,
        address from_address,
        address to_address,
        uint256 from_value,
        uint256 to_value
    );

    // claim success event
    event ClaimSuccess (
        bytes32 indexed id,
        address indexed claimer,
        uint256 timestamp,
        uint256 to_value,
        address token_address
    );

    // swap pool destruct success event
    event DestructSuccess (
        bytes32 indexed id,
        address indexed token_address,
        uint256 remaining_balance,
        uint128[] exchanged_values
    );

    // single token withdrawl from a swap pool success even
    event WithdrawSuccess (
        bytes32 indexed id,
        address indexed token_address,
        uint256 withdraw_balance
    );

    using SafeERC20 for IERC20;
    uint32 nonce;
    uint224 base_time;                 // timestamp = base_time + delta to save gas
    mapping(bytes32 => Pool) pool_by_id;    // maps an id to a Pool instance
    string constant private magic = "Prince Philip, Queen Elizabeth II's husband, has died aged 99, \
    Buckingham Palace has announced. A statement issued by the palace just after midday spoke of the \
    Queen's deep sorrow following his death at Windsor Castle on Friday morning. The Duke of Edinbur";
    bytes32 private seed;
    address constant DEFAULT_ADDRESS = address(0);       // a universal address

    constructor() {
        seed = keccak256(abi.encodePacked(magic, block.timestamp, msg.sender));
        base_time = 1616976000;                                    // 00:00:00 03/30/2021 GMT(UTC+0)
    }

    /**
     * @dev 
     * fill_pool() creates a swap pool with specific parameters from input
     * _hash                sha3-256(password)
     * _start               start time delta, real start time = base_time + _start
     * _end                 end time delta, real end time = base_time + _end
     * message              swap pool creation message, only stored in FillSuccess event
     * _exchange_addrs      swap token list (0x0 for ETH, only supports ETH and ERC20 now)
     * _ratios              swap pair ratio list
     * _unlock_time         unlock time delta real unlock time = base_time + _unlock_time
     * _token_addr          swap target token address
     * _total_tokens        target token total swap amount
     * _limit               target token single swap limit
     * _qualification       the qualification contract address based on IQLF to determine qualification
     * This function takes the above parameters and creates the pool. _total_tokens of the target token
     * will be successfully transferred to this contract securely on a successful run of this function.
    **/
    function fill_pool (bytes32 _hash, uint256 _start, uint256 _end, string memory message,
                        address[] memory _exchange_addrs, uint128[] memory _ratios, uint256 _unlock_time,
                        address _token_addr, uint256 _total_tokens, uint256 _limit, address _qualification)
    public payable {
        nonce ++;
        require(_start < _end, "Start time should be earlier than end time.");
        require(_end < _unlock_time || _unlock_time == 0, "End time should be earlier than unlock time");
        require(_limit <= _total_tokens, "Limit needs to be less than or equal to the total supply");
        require(_total_tokens < 2 ** 128, "No more than 2^128 tokens(incluidng decimals) allowed");
        require(_exchange_addrs.length > 0, "Exchange token addresses need to be set");
        require(_ratios.length == 2 * _exchange_addrs.length, "Size of ratios = 2 * size of exchange_addrs");

        bytes32 _id = keccak256(abi.encodePacked(msg.sender, block.timestamp, nonce, seed));
        Pool storage pool = pool_by_id[_id];
        pool.packed1 = Packed1(_qualification, uint40(uint256(_hash) >> 216));
        pool.packed2 = Packed2(uint128(_total_tokens), uint128(_limit));
        pool.packed3 = Packed3(_token_addr, uint32(_start), uint32(_end), uint32(_unlock_time));
        pool.creator = msg.sender;
        pool.exchange_addrs = _exchange_addrs;

        // Init each token swapped amount to 0
        for (uint256 i = 0; i < _exchange_addrs.length; i++) {
            if (_exchange_addrs[i] != DEFAULT_ADDRESS) {
                // TODO: Is there a better way to validate an ERC20?
                require(IERC20(_exchange_addrs[i]).totalSupply() > 0, "Not a valid ERC20");
            }
            pool.exchanged_tokens.push(0); 
        }

        pool.ratios = _ratios;                                          // 256 * k
        IERC20(_token_addr).safeTransferFrom(msg.sender, address(this), _total_tokens);

        emit FillSuccess(msg.sender, _id, _total_tokens, block.timestamp, _token_addr, message);
    }

    /**
     * @dev
     * swap() allows users to swap tokens in a swap pool
     * id                   swap pool id
     * verification         sha3-256(sha3-256(password)[:40]+swapper_address)
     * validation           sha3-256(swapper_address)
     * exchange_addr_i     the index of the exchange address of the list
     * input_total          the input amount of the specific token
     * This function is called by the swapper who approves the specific ERC20 or directly transfer the ETH
     * first and wants to swap the desired amount of the target token. The swapped amount is calculated
     * based on the pool ratio. After swap successfully, the same account can not swap the same pool again.
    **/

    function swap (bytes32 id, bytes32 verification, 
                   bytes32 validation, uint256 exchange_addr_i, uint128 input_total) 
    public payable returns (uint256 swapped) {

        Pool storage pool = pool_by_id[id];
        Packed1 memory packed1 = pool.packed1;
        Packed2 memory packed2 = pool.packed2;
        Packed3 memory packed3 = pool.packed3;
        require (
            IQLF(packed1.qualification_addr).logQualified(msg.sender, uint256(packed3.start_time + base_time)) == true, 
            "Not Qualified"
        );
        require (packed3.start_time + base_time < block.timestamp, "Not started.");
        require (packed3.end_time + base_time > block.timestamp, "Expired.");
        // sha3(sha3(passowrd)[:40] + msg.sender) so that the raw password will never appear in the contract
        require (verification == keccak256(abi.encodePacked(uint256(packed1.password), msg.sender)), 
                 'Wrong Password');
        // sha3(msg.sender) to protect from front runs (but this is kinda naive since the contract is open sourced)
        require (validation == keccak256(abi.encodePacked(msg.sender)), "Validation Failed");

        // revert if the pool is empty
        require (packed2.total_tokens > 0, "Out of Stock");

        address exchange_addr = pool.exchange_addrs[exchange_addr_i];
        uint256 ratioA = pool.ratios[exchange_addr_i*2];
        uint256 ratioB = pool.ratios[exchange_addr_i*2 + 1];
        // check if the input is enough for the desired transfer
        if (exchange_addr == DEFAULT_ADDRESS) {
            require(msg.value == input_total, 'No enough ether.');
        }

        uint128 swapped_tokens = SafeCast.toUint128(SafeMath.div(SafeMath.mul(input_total, ratioB), ratioA));
        require(swapped_tokens > 0, "Better not draw water with a sieve");

        if (swapped_tokens > packed2.limit) {
            // don't be greedy - you can only get at most limit tokens
            swapped_tokens = packed2.limit;
            input_total = SafeCast.toUint128(SafeMath.div(SafeMath.mul(packed2.limit, ratioA), ratioB));           // Update input_total
        } else if (swapped_tokens > packed2.total_tokens ) {
            // if the left tokens are not enough
            swapped_tokens = packed2.total_tokens;
            input_total = SafeCast.toUint128(SafeMath.div(SafeMath.mul(packed2.total_tokens , ratioA), ratioB));    // Update input_total
            // return the eth
            if (exchange_addr == DEFAULT_ADDRESS)
                payable(msg.sender).transfer(msg.value - input_total);
        }
        require(swapped_tokens <= packed2.limit);                                                       // make sure again
        pool.exchanged_tokens[exchange_addr_i] = SafeCast.toUint128(SafeMath.add(pool.exchanged_tokens[exchange_addr_i], 
                                                                      input_total));            // update exchanged

        // penalize greedy attackers by placing duplication check at the very last
        require (pool.swapped_map[msg.sender] == 0, "Already swapped");

        // update the remaining tokens and swapped token mapping
        pool.packed2.total_tokens = SafeCast.toUint128(SafeMath.sub(packed2.total_tokens, swapped_tokens));
        pool.swapped_map[msg.sender] = swapped_tokens;

        // transfer the token after state changing
        // ETH comes with the tx, but ERC20 does not - INPUT
        if (exchange_addr != DEFAULT_ADDRESS) {
            IERC20(exchange_addr).safeTransferFrom(msg.sender, address(this), input_total);
        }

        // Swap success event
        emit SwapSuccess(id, msg.sender, exchange_addr, packed3.token_address, input_total, swapped_tokens);

        // if unlock_time == 0, transfer the swapped tokens to the recipient address (msg.sender) - OUTPUT
        // if not, claim() needs to be called to get the token
        if (packed3.unlock_time == 0) {
            IERC20(packed3.token_address).safeTransfer(msg.sender, swapped_tokens);
            emit ClaimSuccess(id, msg.sender, block.timestamp, swapped_tokens, packed3.token_address);
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
        Packed3 memory packed3 = pool.packed3;
        return (
            pool.exchange_addrs,                                                // exchange_addrs 0x0 means destructed
            pool.packed2.total_tokens,                                          // remaining
            block.timestamp > packed3.start_time + base_time,                   // started
            block.timestamp > packed3.end_time + base_time,                     // expired
            block.timestamp > packed3.unlock_time + base_time,                  // unlocked
            packed3.unlock_time + base_time,                                    // unlock_time
            pool.swapped_map[msg.sender],                                       // swapped number 
            pool.exchanged_tokens                                               // exchanged tokens
        );
    }

    function claim(bytes32[] memory ito_ids) public {
        for (uint256 i = 0; i < ito_ids.length; i++) {
            Pool storage pool = pool_by_id[ito_ids[i]];
            Packed3 memory packed3 = pool.packed3;
            if (packed3.unlock_time == 0)
                continue;
            if (packed3.unlock_time + base_time > block.timestamp)
                continue;
            uint256 claimed_amount = pool.swapped_map[msg.sender];
            if (claimed_amount == 0)
                continue;
            pool.swapped_map[msg.sender] = 0;
            IERC20(packed3.token_address).safeTransfer(msg.sender, claimed_amount);
            emit ClaimSuccess(ito_ids[i], msg.sender, block.timestamp, claimed_amount, packed3.token_address);
        }
    }

    // Change: NOT ABI compatible with existing contract
    // `uint256 _unlock_time` -> uint32 _unlock_time
    function setUnlockTime(bytes32 id, uint256 _unlock_time) public {
        Pool storage pool = pool_by_id[id];
        uint32 packed3_unlock_time = pool.packed3.unlock_time;
        require(_unlock_time < ~uint32(0) , "invalid unlock time");
        require(pool.creator == msg.sender, "Pool Creator Only");
        require(block.timestamp < (packed3_unlock_time + base_time), "Too Late");
        require(packed3_unlock_time != 0, "Not eligible when unlock_time is 0");
        require(_unlock_time != 0, "Cannot set to 0");
        pool.packed3.unlock_time = uint32(_unlock_time);
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
        Packed3 memory packed3 = pool.packed3;
        require(msg.sender == pool.creator, "Only the pool creator can destruct.");

        uint256 expiration = pool.packed3.end_time + base_time;
        uint256 remaining_tokens = pool.packed2.total_tokens;
        // only after expiration or the pool is empty
        require(expiration <= block.timestamp || remaining_tokens == 0, "Not expired yet");

        // if any left in the pool
        if (remaining_tokens != 0) {
            IERC20(packed3.token_address).safeTransfer(msg.sender, remaining_tokens);
        }
        
        // transfer the swapped tokens accordingly
        // note this loop may exceed the block gas limit so if >200 exchange_addrs this may not work
        for (uint256 i = 0; i < pool.exchange_addrs.length; i++) {
            if (pool.exchanged_tokens[i] > 0) {
                // ERC20
                if (pool.exchange_addrs[i] != DEFAULT_ADDRESS)
                    IERC20(pool.exchange_addrs[i]).safeTransfer(msg.sender, pool.exchanged_tokens[i]);
                // ETH
                else
                    payable(msg.sender).transfer(pool.exchanged_tokens[i]);
            }
        }
        emit DestructSuccess(id, packed3.token_address, remaining_tokens, pool.exchanged_tokens);

        // Gas Refund
        pool.packed1 = Packed1(DEFAULT_ADDRESS, 0);
        pool.packed2 = Packed2(0, 0);
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
        uint256 expiration = pool.packed3.end_time + base_time;
        uint256 remaining_tokens = pool.packed2.total_tokens;
        // only after expiration or the pool is empty
        require(expiration <= block.timestamp || remaining_tokens == 0, "Not expired yet");
        address token_address = pool.exchange_addrs[addr_i];

        // clear the record
        pool.exchanged_tokens[addr_i] = 0;

        // ERC20
        if (token_address != DEFAULT_ADDRESS)
            IERC20(token_address).safeTransfer(msg.sender, withdraw_balance);
        // ETH
        else
            payable(msg.sender).transfer(withdraw_balance);
        emit WithdrawSuccess(id, token_address, withdraw_balance);
    }
}
