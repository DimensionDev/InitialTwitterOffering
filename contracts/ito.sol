pragma solidity 0.6.2;
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract HappyTokenPool {

    struct Pool {
        uint256 packed1;            // exp(48) total_tokens(80) hash(64) id(64) BIG ENDIAN
        uint256 packed2;            // total_number(16) claimed(16) creator(64) token_addr(160)
        address[] exchange_addrs;
        uint256[] ratios;
        mapping(address => bool) claimed_map;
    }

    event FillSuccess(
        uint total,
        bytes32 id,
        address creator,
        uint creation_time,
        address token_address
    );

    event ClaimSuccess(
        bytes32 id,
        address claimer,
        uint claimed_value,
        address token_address
    );

    event RefundSuccess(
        bytes32 id,
        address token_address,
        uint remaining_balance
    );

    uint32 nonce;
    address public contract_creator;
    mapping(bytes32 => Pool) pool_by_id;
    string constant private magic = "Former NBA Commissioner David St"; // 32 bytes
    bytes32 private seed;

    constructor() public {
        contract_creator = msg.sender;
        seed = keccak256(abi.encodePacked(magic, now, contract_creator));
    }

    function fill_pool (bytes32 _hash, uint _number, uint _duration, 
                        address[] memory _exchange_addrs, uint256[] memory _ratios,
                        address _token_addr, uint _total_tokens, uint _limit)
    public payable {
        nonce ++;
        require(_total_tokens >= _number, "Number of total tokens needs to be larger than number of splits");
        require(_limit < _total_tokens, "Limit needs to be less than the total supply");

        require(IERC20(_token_addr).allowance(msg.sender, address(this)) >= _total_tokens, "Insuffcient allowance");
        require(_ratios.length == 2 * _exchange_addrs.length, "Size of ratios = 2 * size of exchange_addrs")
        transfer_token(_token_addr, msg.sender, address(this), _total_tokens);

        bytes32 _id = keccak256(abi.encodePacked(msg.sender, now, nonce, seed));
        Pool storage pool = pool_by_id[_id];
        pool.packed1 = wrap1(_hash, _total_tokens, _duration);
        pool.packed2 = wrap2(_token_addr, _limit);
        pool.exchange_addrs = _exchange_addrs;
        pool.ratios = _ratios;
        emit FillSuccess(_total_tokens, _id, msg.sender, now, _token_addr);
    }

    // It takes the unhashed password and a hashed random seed generated from the user
    function claim(bytes32 id, string memory password, address _recipient, bytes32 validation, address exchange_addr) 
    public payable returns (uint claimed) {

        Pool storage pool = pool_by_id[id];
        address payable recipient = address(uint160(_recipient));
        require (unbox(pool.packed1, 208, 48) > now, "Expired");
        uint remaining = unbox(pool.packed1, 240, 16);
        require (claimed_number < total_number, "Out of Stock");
        require (uint256(keccak256(bytes(password))) >> 128 == unbox(pool.packed1, 0, 128), "006");
        require (validation == keccak256(toBytes(msg.sender)), "007");

        uint claimed_tokens;
        uint total_tokens = unbox(pool.packed1, 128, 80);

        for(uint i = 0; i < pool.exchange_addrs.length; i ++) {
            uint allowance = IERC20(pool.exchange_addrs[i]).allowance(msg.sender, address(this));
            claimed_tokens += allowance * pool.ratios[i*2] / pool.ratios[i*2 + 1];   // TODO SAFEMATH
        }

        // Penalize greedy attackers by placing duplication check at the very last
        require (pool.claimed_map[_recipient] == false, "005");

        pool.claimed_map[_recipient] = true;
        pool.packed2 = rewriteBox(pool.packed2, 224, 16, claimed_number + 1);


        // Transfer the red packet after state changing
        transfer_token(address(unbox(pool.packed2, 0, 160)), address(this), recipient, claimed_tokens);

        // Claim success event
        emit ClaimSuccess(id, recipient, claimed_tokens, address(unbox(pool.packed2, 0, 160)));
        return claimed_tokens;
    }

    // Returns 1. remaining value 2. total number of red packets 3. claimed number of red packets
    function check_availability(bytes32 id) external view returns (address token_address, uint balance, uint total, 
                                                                    uint claimed, bool expired, bool ifclaimed) {
        Pool storage pool = pool_by_id[id];
        uint256 sender_hash = (uint256(keccak256(abi.encodePacked(msg.sender))) >> 192);
        uint256 number = unbox(pool.packed2, 224, 8);
        return (address(unbox(pool.packed2, 0, 160)), 
                unbox(pool.packed1, 128, 80), 
                unbox(pool.packed2, 232, 8),
                unbox(pool.packed2, 224, 8), 
                now > unbox(pool.packed1, 208, 48), 
                pool.claimed_map[msg.sender]);
    }

    function destruct(bytes32 id) public {
        Pool storage pool = pool_by_id[id];
        require(uint256(keccak256(abi.encodePacked(msg.sender)) >> 192) == unbox(pool.packed2, 160, 64), "011");
        require(unbox(pool.packed1, 208, 48) <= now, "012");

        uint256 remaining_tokens = unbox(pool.packed1, 128, 80);
        address token_address = address(unbox(pool.packed2, 0, 160));

        IERC20(token_address).approve(msg.sender, remaining_tokens);
        transfer_token(token_address, address(this), msg.sender, remaining_tokens);

        emit RefundSuccess(id, token_address, remaining_tokens);
        pool.packed1 = rewriteBox(pool.packed1, 128, 80, 0);
        // Gas Refund
        pool.packed1 = 0;
        pool.packed2 = 0;
    }

     // One cannot send tokens to this contract after constructor anymore
     //function () external payable {
     //}


    // helper functions
    function wrap1 (bytes32 _hash, uint _total_tokens, uint _duration) internal view returns (uint256 packed1) {
        uint256 _packed1 = 0;
        _packed1 |= box(0, 128, uint256(_hash) >> 128); // hash = 128 bits (NEED TO CONFIRM THIS)
        _packed1 |= box(128, 80, _total_tokens);        // total tokens = 80 bits = ~10^24.1 = ~10^6 18 decimals
        _packed1 |= box(208, 48, (now + _duration));    // expiration_time = 48 bits (to the end of the world)
        return _packed1;
    }

    function wrap2 (address _token_addr, uint _limit) internal view returns (uint256 packed2) {
        uint256 _packed2 = 0;
        _packed2 |= box(0, 160, uint256(_token_addr));  // token_address = 160 bits
        _packed2 |= box(160, 64, (uint256(keccak256(abi.encodePacked(msg.sender))) >> 192));  // creator.hash = 64 bit
        _packed2 |= box(224, 32, _limit);                     // limit = 32 bits
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

    function validRange(uint16 size, uint256 data) public pure returns(bool) { 
        return data < 2 ** uint256(size);
    }

    function rewriteBox(uint256 _box, uint16 position, uint16 size, uint256 data) 
    internal pure returns (uint256 boxed) {
        uint256 _boxData = box(position, size, data);
        uint256 _mask = box(position, size, uint256(-1) >> (256 - size));
        _box = (_box & ~_mask) | _boxData;
        return _box;
    }

    function transfer_token(address token_address, address sender_address,
                            address recipient_address, uint amount) internal {
        require(IERC20(token_address).balanceOf(sender_address) >= amount, "010");
        IERC20(token_address).approve(sender_address, amount);
        IERC20(token_address).transferFrom(sender_address, recipient_address, amount);
    }
    
    // A boring wrapper
    function random(bytes32 _seed, uint32 nonce_rand) internal view returns (uint rand) {
        return uint(keccak256(abi.encodePacked(nonce_rand, msg.sender, _seed, now))) + 1 ;
    }
    
    // https://ethereum.stackexchange.com/questions/884/how-to-convert-an-address-to-bytes-in-solidity
    // 695 gas consumed
    function toBytes(address a) public pure returns (bytes memory b) {
        assembly {
            let m := mload(0x40)
            a := and(a, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
            mstore(0x40, add(m, 52))
            b := m
        }
    }
}
