pragma solidity 0.6.2;
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract HappyTokenPool {

    struct Pool {
        uint256 packed1;            // exp(48) total_tokens(80) hash(64) id(64) BIG ENDIAN
        uint256 packed2;            // total_number(16) claimed(16) creator(64) token_addr(160)
        address creator;
        address[] exchange_addrs;
        uint256[] exchanged_tokens;
        uint256[] ratios;
        mapping(address => uint256) claimed_map;
    }

    event FillSuccess (
        uint total,
        bytes32 id,
        address creator,
        uint creation_time,
        address token_address,
        string name,
        string message
    );

    event ClaimSuccess (
        bytes32 id,
        address claimer,
        uint claimed_value,
        address token_address
    );

    event RefundSuccess (
        bytes32 id,
        address token_address,
        uint remaining_balance
    );

    event Test (
        uint256 a
    );

    uint32 nonce;
    uint256 base_timestamp;
    address public contract_creator;
    mapping(bytes32 => Pool) pool_by_id;
    string constant private magic = "Former NBA Commissioner David St"; // 32 bytes
    bytes32 private seed;

    constructor() public {
        contract_creator = msg.sender;
        seed = keccak256(abi.encodePacked(magic, now, contract_creator));
        base_timestamp = 1606780800;
    }

    function fill_pool (bytes32 _hash, uint _start, uint _end, string memory name, string memory message,
                        address[] memory _exchange_addrs, uint256[] memory _ratios,
                        address _token_addr, uint _total_tokens, uint _limit)
    public payable {
        nonce ++;
        require(_limit <= _total_tokens, "Limit needs to be less than the total supply");
        require(IERC20(_token_addr).allowance(msg.sender, address(this)) >= _total_tokens, "Insuffcient allowance");
        require(_ratios.length == 2 * _exchange_addrs.length, "Size of ratios = 2 * size of exchange_addrs");

        bytes32 _id = keccak256(abi.encodePacked(msg.sender, now, nonce, seed));
        Pool storage pool = pool_by_id[_id];
        pool.packed1 = wrap1(_token_addr, _hash, _start, _end);         // 256 bytes
        pool.packed2 = wrap2(_total_tokens, _limit);                    // 256 bytes
        pool.creator = msg.sender;                                      // 160 bytes
        pool.exchange_addrs = _exchange_addrs;                          // 160 bytes
        for (uint8 i = 0; i < _exchange_addrs.length; i++){
            pool.exchanged_tokens.push(0); 
        }
        pool.ratios = _ratios;                                          // 256 * k
        IERC20(_token_addr).transferFrom(msg.sender, address(this), _total_tokens);

        emit FillSuccess(_total_tokens, _id, msg.sender, now, _token_addr, name, message);
    }

    // It takes the unhashed password and a hashed random seed generated from the user
    function claim (bytes32 id, string memory password, address _recipient, 
                   bytes32 validation, uint256 _exchange_addr_i, uint256 input_total) 
    public payable returns (uint claimed) {

        Pool storage pool = pool_by_id[id];
        address payable recipient = address(uint160(_recipient));
        require (unbox(pool.packed1, 208, 24) + base_timestamp < now, "Not started.");
        require (unbox(pool.packed1, 232, 24) + base_timestamp > now, "Expired.");
        require (uint256(keccak256(bytes(password))) >> 208 == unbox(pool.packed1, 160, 48), "Wrong Password");
        require (validation == keccak256(toBytes(msg.sender)), "Validation Failed");

        uint claimed_tokens;
        uint total_tokens = unbox(pool.packed2, 0, 128);

        address exchange_addr = pool.exchange_addrs[_exchange_addr_i];
        uint256 ratioA = pool.ratios[_exchange_addr_i*2];
        uint256 ratioB = pool.ratios[_exchange_addr_i*2 + 1];
        emit Test(input_total);
        if (exchange_addr == 0x0000000000000000000000000000000000000000) {
            require(msg.value == input_total, 'No enough ether.');
        } else {
            uint allowance = IERC20(exchange_addr).allowance(msg.sender, address(this));
            require(allowance == input_total, 'No enough allowance.');
        }
        claimed_tokens = SafeMath.mul(SafeMath.div(input_total, ratioB), ratioA);

        // Don't be greedy
        uint256 limit = unbox(pool.packed2, 128, 128);
        if (claimed_tokens > limit) {
            claimed_tokens = limit;
        }
        require(claimed_tokens <= limit);
        pool.exchanged_tokens[_exchange_addr_i] += input_total;

        // Penalize greedy attackers by placing duplication check at the very last
        require (pool.claimed_map[_recipient] == 0, "Already Claimed");

        pool.packed2 = rewriteBox(pool.packed2, 0, 128, total_tokens - claimed_tokens);
        pool.claimed_map[_recipient] = claimed_tokens;

        // Transfer the token after state changing
        if (exchange_addr != 0x0000000000000000000000000000000000000000) {
            IERC20(exchange_addr).transferFrom(msg.sender, address(this), input_total);
        }
        transfer_token(address(unbox(pool.packed1, 0, 160)), address(this), recipient, claimed_tokens);

        // Claim success event
        emit ClaimSuccess(id, recipient, claimed_tokens, address(unbox(pool.packed1, 0, 160)));
        return claimed_tokens;
    }

    // Returns 0. exchange_addrs in the given pool 1. remaining tokens 2. if expired 3. if claimed
    function check_availability (bytes32 id) external view returns (address[] memory exchange_addrs, uint remaining, 
                                                                    bool started, bool expired, uint claimed,
                                                                    uint256[] memory exchanged_tokens) {
        Pool storage pool = pool_by_id[id];
        return (
            pool.exchange_addrs,                                    // exchange_addrs
            unbox(pool.packed2, 0, 128),                            // remaining
            now < unbox(pool.packed1, 208, 24) + base_timestamp,    // started
            now > unbox(pool.packed1, 232, 24) + base_timestamp,    // expired
            pool.claimed_map[msg.sender],                           // claimed number 
            pool.exchanged_tokens                                   // exchanged tokens
        );
    }

    function destruct (bytes32 id) public {
        Pool storage pool = pool_by_id[id];
        require(msg.sender == pool.creator, "Only the pool creator can destruct.");
        require(unbox(pool.packed1, 208, 24) + base_timestamp <= now, "Not expired yet");

        uint256 remaining_tokens = unbox(pool.packed2, 128, 128);
        address token_address = address(unbox(pool.packed1, 0, 160));

        transfer_token(token_address, address(this), msg.sender, remaining_tokens);

        for (uint i = 0; i < pool.exchange_addrs.length; i++){
            if (pool.exchanged_tokens[i] > 0) {
                if (pool.exchange_addrs[i] != 0x0000000000000000000000000000000000000000)
                    transfer_token(pool.exchange_addrs[i], address(this), msg.sender, pool.exchanged_tokens[i]);
                else
                    msg.sender.transfer(pool.exchanged_tokens[i]);
            }
        }
        emit RefundSuccess(id, token_address, remaining_tokens);

        // Gas Refund
        pool.packed1 = 0;
        pool.packed2 = 0;
        pool.creator = 0x0000000000000000000000000000000000000000;
        for (uint i = 0; i < pool.exchange_addrs.length; i++) {
            pool.exchange_addrs[i] = 0x0000000000000000000000000000000000000000;
            pool.exchanged_tokens[i] = 0;
            pool.ratios[i*2] = 0;
            pool.ratios[i*2+1] = 0;
        }
    }

    // helper functions
    function wrap1 (address _token_addr, bytes32 _hash, uint _start, uint _end) internal pure 
                    returns (uint256 packed1) {
        uint256 _packed1 = 0;
        _packed1 |= box(160, 48, uint256(_hash) >> 208);    // hash = 128 bits (NEED TO CONFIRM THIS)
        _packed1 |= box(0, 160,  uint256(_token_addr));     // token_addr = 160 bits
        _packed1 |= box(208, 24, _start);                   // start_time = 24 bits 
        _packed1 |= box(232, 24, _end);                     // expiration_time = 24 bits
        return _packed1;
    }

    function wrap2 (uint _total_tokens, uint _limit) internal pure returns (uint256 packed2) {
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
                            address recipient_address, uint amount) internal {
        require(IERC20(token_address).balanceOf(sender_address) >= amount, "010");
        IERC20(token_address).approve(sender_address, amount);
        IERC20(token_address).transferFrom(sender_address, recipient_address, amount);
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
