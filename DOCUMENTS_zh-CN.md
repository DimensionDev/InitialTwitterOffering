# InitialTwitterOffering

## 简介
Initial Twitter Offering(ITO) 是一个基于 Mask 浏览器插件上的小程序，功能分为两方面，浏览器插件端与以太坊智能合约端，本文档只介绍以太坊智能合约端的设计思想与逻辑，还会描述智能合约中的各个函数与接口。

## 功能设计
ITO 的本质是一个可以由任何以太坊用户创建的代币兑换池（Token Swap Pool），用户可以转入一定量的某一种目标代币，然后设定一系列的兑换比例（现支持 ETH 与 ERC20），例如 {1 ETH: 10000 TOKEN, 1 DAI: 10 TOKEN ，通过引入`IQLF`(在 appendix 中会补充定义) 中的 `qualified` 接口来规定参与兑换的地址的资格，并设定好最高兑换上限（以目标代币 TOKEN 为基础），例如 10000 TOKEN。在设定的截止时间到期或待交换池已经兑光后，交换池的作者可以将剩余代币（如在到期时还有剩余）和所有兑换到的代币提取出来，并将这个交换池销毁。

用户参与只需要基于按照指定`pool id` 的兑换比例，向合约的地址 `approve` 相应的目标代币，并调用合约的 `swap` 函数进行代币兑换，合约将会把相应数量的目标代币直接转给用户，并将兑换的代币从用户的地址转到合约中，待未来被兑换池创建者提取。每个用户只可以兑换一次或不超过兑换上限的代币，由兑换池发起方决定。

## 合约 API 设计
### Structs and Global Variables
```
uint32 nonce;                                      // 内部计数器，仅用于生成随机数
uint256 base_timestamp;                            // 基准时间戳，节约空间，每个新 pool 
                                                   // 只保存 delta
address public contract_creator;                   // 合约创建者
mapping(bytes32 => Pool) pool_by_id;               // pool id -> Pool 的映射
string constant private magic;                     // 仅用于生成随机数
bytes32 private seed;                              // 仅用于生成随机数
address DEFAULT_ADDRESS = 0x0000000000000000000000000000000000000000; //默认黑洞地址

struct Pool {
    uint256 packed1;                          // 目标代币地址(160) 
                                              // sha256(密码)[0:48](48)
                                              // 开始时间 delta(24) 结束时间 delta(24) 
                                              // BIG ENDIAN
    uint256 packed2;                          // 剩余目标代币量(128) 单地址兑换上限(128)
    address creator;                          // 兑换池创建者
    address[] exchange_addrs;                 // 可兑换代币地址数组（DEFAULT 代表 ETH）
    uint256[] exchanged_tokens;               // 已兑换的代币数量数组
    uint256[] ratios;                         // 兑换代币比例
                                              // 长度为 exchange_addr.length * 2 
                                              // [地址1，目标地址，地址2，目标地址...] 
                                              // 其中每个兑换对都应互质
    mapping(address => uint256) swapped_map;  // 给定地址已兑换数量
}
```

### Events
```
// 创建成功
event FillSuccess (
    uint256 total,
    bytes32 id,
    address creator,
    uint256 creation_time,
    address token_address,
    string message
);

// 兑换成功
event SwapSuccess (
    bytes32 id,
    address swapper,
    address from_address,
    address to_address,
    uint256 from_value,
    uint256 to_value
);

// 报销成功
event ClaimSuccess (
    bytes32 id,
    address swapper,
    address from_address,
    address to_address,
    uint256 from_value,
    uint256 to_value
);

// 摧毁成功
event DestructSuccess (
    bytes32 id,
    address token_address,
    uint256 remaining_balance,
    uint256[] exchanged_values
);

// 提款成功
event WithdrawSuccess (
    bytes32 id,
    address token_address,
    uint256 withdraw_balance
);
```

### Functions
Helper Functions:
```
/**
 * _token_addr    目标代币地址         160
 * _hash          sha3-256(密码)       48
 * _start         开始时间的 delta     24
 * _end           结束时间的 delta     24
 * wrap1() 将上述变量塞入一个 32-word block
**/

function wrap1 (address _token_addr, bytes32 _hash, uint256 _start, uint256 _end) internal pure 
                returns (uint256 packed1) {
    uint256 _packed1 = 0;
    _packed1 |= box(0, 160,  uint256(_token_addr));     // token_addr = 160 bits
    _packed1 |= box(160, 48, uint256(_hash) >> 208);    // hash = 48 bits (safe?)
    _packed1 |= box(208, 24, _start);                   // start_time = 24 bits 
    _packed1 |= box(232, 24, _end);                     // expiration_time = 24 bits
    return _packed1;
}
```

```
/**
 * _total_token    目标代币剩余总量     128
 * _limit          单地址兑换上限        128
 * wrap2() 将上述变量塞入一个 32-word block
**/

function wrap2 (uint256 _total_tokens, uint256 _limit) internal pure returns (uint256 packed2) {
    uint256 _packed2 = 0;
    _packed2 |= box(0, 128, _total_tokens);             // total_tokens = 128 bits ~= 3.4e38
    _packed2 |= box(128, 128, _limit);                  // limit = 128 bits
    return _packed2;
}
```

```
/**
 * position      开始位置
 * size          变量大小
 * data          数据
 * box() 将输入数据 data 位移至指定位置 position 并返回，并由 validRange() 函数确保输入数据不会超过 size 大小 
**/

function box (uint16 position, uint16 size, uint256 data) internal pure returns (uint256 boxed) {
    require(validRange(size, data), "Value out of range BOX");
    return data << (256 - size - position);
}
```

```
/**
 * base          待提取变量
 * position      提取位置
 * size          提取大小
 * unbox() 将输入变量 base 中指定位置 position 开始大小为 size 的数值提取出来并返回
**/

function unbox (uint256 base, uint16 position, uint16 size) internal pure returns (uint256 unboxed) {
    require(validRange(256, base), "Value out of range UNBOX");
    return (base << position) >> (256 - size);
}
```

```
/**
 * size          变量大小
 * data          数据
 * validRange() 判断输入数据 data 的大小不超过 size
**/

function validRange (uint16 size, uint256 data) internal pure returns(bool) { 
    if (data > 2 ** uint256(size) - 1) {
        return false;
    }
    return true;
}
```

```
/**
 * _box          待修改变量
 * position      位置
 * size          大小
 * data          待写入变量
 * rewriteBox() 将输入数据 data 替换变量 _box 中从位置 position 开始大小为 size 的数据，并返回修改好的变量 _base 
**/

function rewriteBox (uint256 _box, uint16 position, uint16 size, uint256 data) 
internal pure returns (uint256 boxed) {
    uint256 _boxData = box(position, size, data);
    uint256 _mask = box(position, size, uint256(-1) >> (256 - size));
    _box = (_box & ~_mask) | _boxData;
    return _box;
}
```

```
/**
 * token_address      ERC20 代币地址
 * sender_address     发送方地址
 * recipient_address  接收方地址
 * amount             转账总额
 * transfer_token() 将 amount 个 token_address Token 从 sender_address 转到 recipient_address 
**/
function transfer_token (address token_address, address sender_address,
                         address recipient_address, uint256 amount) internal {
    require(IERC20(token_address).balanceOf(sender_address) >= amount, "Balance not enough");
    IERC20(token_address).approve(sender_address, amount);
    IERC20(token_address).transferFrom(sender_address, recipient_address, amount);
}
```

```
/**
 * a          待转换地址
 * toBytes() 将输入地址 a 转换为 bytes
**/

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
```

Core Functions:
```
/**
 * _hash               sha3-256(密码)
 * _start              开始时间的 delta，真实时间为 base_timestamp + _start
 * _end                结束时间的 delta，真实时间为 base_timestamp + _end
 * name                兑换池创建者的名字，不会保存在合约中，只会在 Fill_Success 中保存
 * message             兑换池创建者的消息，不会保存在合约中，只会在 Fill_Success 中保存
 * _exchange_addrs     兑换的代币地址数组（DEFAULT 代表 ETH，支持 ETH 和 ERC20）
 * _ratios             兑换比例
 * _token_addr         目标代币地址
 * _total_tokens       目标代币总量
 * _limit              单地址可兑换目标代币上限
 * fill_pool() 将兑换池的参数在合约中初始化，并将相应的目标代币转入合约中
**/

function fill_pool (bytes32 _hash, uint256 _start, uint256 _end, string memory name, string memory message,
                    address[] memory _exchange_addrs, uint256[] memory _ratios,
                    address _token_addr, uint256 _total_tokens, uint256 _limit)
public payable {
    nonce ++;
    require(_start < _end, "Start time should be earlier than end time.");
    require(_limit <= _total_tokens, "Limit needs to be less than or equal to the total supply");
    require(_total_tokens < 2**128, "No more than 2^128 tokens(incluidng decimals) allowed");
    require(IERC20(_token_addr).allowance(msg.sender, address(this)) >= _total_tokens, "Insuffcient allowance");
    require(_ratios.length == 2 * _exchange_addrs.length, "Size of ratios = 2 * size of exchange_addrs");
    
    // pool id 随机生成
    bytes32 _id = keccak256(abi.encodePacked(msg.sender, now, nonce, seed));
    // 初始化兑换池
    Pool storage pool = pool_by_id[_id];
    // 兑换池参数
    pool.packed1 = wrap1(_token_addr, _hash, _start, _end);         // 256 bytes
    pool.packed2 = wrap2(_total_tokens, _limit);                    // 256 bytes
    pool.creator = msg.sender;                                      // 160 bytes
    pool.exchange_addrs = _exchange_addrs;                          // 160 bytes
    // 将各个代币的已兑换数量初始化为 0
    for (uint256 i = 0; i < _exchange_addrs.length; i++) {
        if (_exchange_addrs[i] != DEFAULT_ADDRESS) {
            require(IERC20(_exchange_addrs[i]).totalSupply() > 0, "Not Valid ERC20");
        }
        pool.exchanged_tokens.push(0); 
    }
    // 确保兑换比例都是互质的
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
    // 确保参数都合法后，转入目标代币
    IERC20(_token_addr).transferFrom(msg.sender, address(this), _total_tokens);

    emit FillSuccess(_total_tokens, _id, msg.sender, now, _token_addr, name, message);
}
```

```
/**
 * id                   兑换池 id
 * verification         sha3-256(sha3-256(密码)[:48]+兑换者的地址)
 * _recipient           代币接受者的地址
 * validation           sha3-256(兑换者的地址)
 * _exchange_addr_i     兑换代币的在 pool.exchange_addrs 中的 index
 * input_total          兑换代币的数量（输入）
 * swap() 针对某一个兑换池 id，基于用户输入的代币地址 pool.exchange_addrs[_exchange_addr_i] 与数量 input_total，
 * 计算用户可以兑换的目标代币数量，并将输入代币转入合约，并将目标代币转到用户指定的地址 _recipient
**/

// It takes the unhashed password and a hashed random seed generated from the user
function swap (bytes32 id, bytes32 verification, address _recipient, 
               bytes32 validation, uint256 _exchange_addr_i, uint256 input_total) 
public payable returns (uint256 swapped) {
    // 取出 pool
    Pool storage pool = pool_by_id[id];
    address payable recipient = address(uint160(_recipient));
    // 确保在合法时间内
    require (unbox(pool.packed1, 208, 24) + base_timestamp < now, "Not started.");
    require (unbox(pool.packed1, 232, 24) + base_timestamp > now, "Expired.");
    // 验证身份
    require (verification == keccak256(abi.encodePacked(unbox(pool.packed1, 160, 48), msg.sender)), 
             'Wrong Password');
    require (validation == keccak256(toBytes(msg.sender)), "Validation Failed");
    // 剩余目标代币数量
    uint256 total_tokens = unbox(pool.packed2, 0, 128);
    
    // 输入代币地址
    address exchange_addr = pool.exchange_addrs[_exchange_addr_i];
    // 取出兑换比例
    uint256 ratioA = pool.ratios[_exchange_addr_i*2];
    uint256 ratioB = pool.ratios[_exchange_addr_i*2 + 1];
    // 若是 ETH，赠确保转入的 ETH 等于 input_total
    if (exchange_addr == DEFAULT_ADDRESS) {
        require(msg.value == input_total, 'No enough ether.');
    } else {
    // 若是 ERC20，确保 allowance 足够
        uint256 allowance = IERC20(exchange_addr).allowance(msg.sender, address(this));
        require(allowance >= input_total, 'No enough allowance.');
    }
    
    // 计算可兑换代币数量
    uint256 swapped_tokens;
    // 先乘后除 基本可以确保不会溢出
    swapped_tokens = SafeMath.div(SafeMath.mul(input_total, ratioB), ratioA);       // 2^256=10e77 >> 10e18 * 10e18
    require(swapped_tokens > 0, "Better not draw water with a sieve");

    // Don't be greedy
    uint256 limit = unbox(pool.packed2, 128, 128);
    // 如果可兑换代币数量大于上限 那么只能兑换上限个代币 不会退回超额部分 Don't be greedy!
    if (swapped_tokens > limit) {
        swapped_tokens = limit;
    } else if (swapped_tokens > total_tokens) {
    // 如果可兑换代币大于兑换池剩余代币数 那么只能兑换剩余代币 并退回超出部分
        swapped_tokens = total_tokens;
        input_total = SafeMath.div(SafeMath.mul(swapped_tokens, ratioB), ratioA);   // same
    }
    // 再次确保不会超出上限 其实是废话
    require(swapped_tokens <= limit);                                               // make sure
    // 记录并更新该代币已经兑换数
    pool.exchanged_tokens[_exchange_addr_i] = SafeMath.add(pool.exchanged_tokens[_exchange_addr_i], input_total);

    // Penalize greedy attackers by placing duplication check at the very last
    // 如果已经兑换过 那么将不被允许再次参与 放到最下侧来惩罚贪婪的人
    require (pool.swapped_map[_recipient] == 0, "Already swapped");
    
    // 将剩余代币量记录并更新在合约中
    pool.packed2 = rewriteBox(pool.packed2, 0, 128, SafeMath.sub(total_tokens, swapped_tokens));
    // 记录该地址兑换代币的数量
    pool.swapped_map[_recipient] = swapped_tokens;

    // Transfer the token after state changing
    // 将兑换代币转入合约
    if (exchange_addr != DEFAULT_ADDRESS) {
        IERC20(exchange_addr).transferFrom(msg.sender, address(this), input_total);
    }
    // 将已兑换目标代币转到目标地址
    transfer_token(address(unbox(pool.packed1, 0, 160)), address(this), recipient, swapped_tokens);

    // Swap success event
    emit SwapSuccess(id, recipient, exchange_addr, address(unbox(pool.packed1, 0, 160)), 
                      input_total, swapped_tokens);
    return swapped_tokens;
}
```

```
/**
 * id            兑换池 id
 * check_availability() 返回该兑换池 id 的 可兑换代币地址数组、剩余代币数量、是否开始、是否结束、合约函数请求者已经兑换的代币数量与各兑换代币已兑换数量数组
**/

// Returns 0. exchange_addrs in the given pool 1. remaining tokens 2. if expired 3. if swapped
function check_availability (bytes32 id) external view returns (address[] memory exchange_addrs, uint256 remaining, 
                                                                bool started, bool expired, uint256 swapped,
                                                                uint256[] memory exchanged_tokens) {
    Pool storage pool = pool_by_id[id];
    return (
        pool.exchange_addrs,                                    // exchange_addrs
        unbox(pool.packed2, 0, 128),                            // remaining
        now > unbox(pool.packed1, 208, 24) + base_timestamp,    // started
        now > unbox(pool.packed1, 232, 24) + base_timestamp,    // expired
        pool.swapped_map[msg.sender],                           // swapped number 
        pool.exchanged_tokens                                   // exchanged tokens
    );
}
```

```
/**
 * id            兑换池 id
 * destruct() 在验证该合约函数请求者确实是兑换池 id 的创建者并确保该兑换池已经结束或兑换完成之后，将剩余代币（如果还有剩余）与已转入的兑换代币转回给合约创建者，
 * 并将（几乎）所有变量清零，以获得 gas refund
**/

function destruct (bytes32 id) public {
    Pool storage pool = pool_by_id[id];
    require(msg.sender == pool.creator, "Only the pool creator can destruct.");

    address token_address = address(unbox(pool.packed1, 0, 160));
    uint256 expiration = unbox(pool.packed1, 232, 24) + base_timestamp;
    uint256 remaining_tokens = unbox(pool.packed2, 0, 128);
    require(expiration <= now || remaining_tokens == 0, "Not expired yet");

    if (remaining_tokens != 0) {
        transfer_token(token_address, address(this), msg.sender, remaining_tokens);
    }

    for (uint256 i = 0; i < pool.exchange_addrs.length; i++){
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
```    
