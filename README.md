# Initial Twitter Offering

## Introduction

Initial Twitter Offering (ITO) is a Dapplet based on the Mask broswer extension. It consists of two components, the browser extension and the Ethereum smart contract. This repo covers the design and the implementation of the smart contract only.

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting_started)
3. [ITO Contract API Reference](#api_reference)
4. [Contract Addresses](#contract_addresses)
5. [Qualification](#qualification)
6. [Contribute](#contribute)
7. [License](#license)

## Overview <a name="overview"></a>

ITO is a token swap pool that can be initiated by any Ethereum user, i.e. the pool creator. The pool creator can transfer an amount of a target token (now supporting ETH and ERC20) into the pool and set the swap ratios, e.g. {1 ETH: 10000 TOKEN, 1 DAI: 10 TOKEN}. 

A swap limit (ceiling) is also set to control the maximum number of tokens to be swapped by a single address, e.g. 10000 TOKEN. After the pool becomes expired (also set on initiation) or the target token is out of stock, the pool creator can withdraw any target token left and all the swapped tokens. The pool will be destructed after the withdrawal.

Participants can only use one of the token exchange pairs according to the pool swap ratio and call the `swap()` function to swap the target token out. The swapped amount is automatically calculated by the smart contract and the users will receive their tokens in one of the following scenarios:
1. <b>If pool does not have unlock time:</b>
The target token is instantly transferred to the participant's address.
2. <b>If pool creator has set an unlock time:</b>
Participants need to wait until the unlock time, then call the `claim()` function to receive the pool tokens.

## Getting Started <a name="getting_started"></a>

This is a standard Hardhat project.

To install:
```
npm i
```
To build the project:
```
npm run compile
```

To test the project:
```
npm test
```

To debug:
```solidity
//...
import "hardhat/console.sol";

function debug_param (address _token_addr) public {
    console.log('_token_addr', _token_addr);
}
```

## ITO Contract API Reference <a name="api_reference"></a>
### Functions
#### Main Functions
1. `fill_pool()` - creates a swap pool with specific parameters from the input.
2. `swap()` - allows users to swap tokens in a swap pool.
3. `check_availability()` - returns a pool's details given a pool ID.
4. `claim()` - lets participant claim the swapped tokens from a list of pools.
5. `setUnlockTime()` - sets the time delta from base time in which the pool will unlock.
6. `destruct()` - destructs the given pool given the pool id.
7. `withdraw()` - transfers out all tokens of a single ERC20 type to pool creator after a pool becomes expired or empty.
```solidity
fill_pool( _hash, _start, _end, message, _exchange_addrs, _ratios, 
    _unlock_time, _token_addr, _total_tokens, _limit, _qualification)
swap(id, verification, validation, exchange_addr_i, input_total)
check_availability(id)
claim(ito_ids)
setUnlockTime(id, _unlock_time)
destruct(id)
withdraw(id, addr_i)
```

#### Helper Functions
1. `wrap1()` - inserts variables `_qualification`, `_hash`, `_start` and `_end` into a 32-byte block.
2. `wrap2()` - inserts variables `_total_tokens_` and `_limit_` into a 32-byte block.
3. `box()` - inserts the data in a 256-bit block with the given position and returns it.
4. `unbox()` - extracts the data out of a 256-bit block with the given position and returns it.
5. `validRange()` - checks if the given data is over the specified data size, returns `true` if valid.
6. `rewriteBox()` - updates a 256-bit block with a data at the given position with the specified size.
7. `transfer_token()` - transfers a given amount of ERC20 tokens from the sender's address to the recipient's address.
```solidity
wrap1(_qualification, _hash, _start, _end)
wrap2(_total_tokens, _limit)
box(position, size, data)
unbox(base, position, size)
validRange(size, data)
rewriteBox(_box, position, size, data)
transfer_token(token_address, sender_address, recipient_address, amount)
```

### Events
```solidity
FillSuccess (total, id, creator, creation_time, token_address, message)
SwapSuccess (id, swapper, from_address, to_address, from_value, to_value)
ClaimSuccess (id, claimer, timestamp, to_value, token_address)
DestructSuccess (id, token_address, remaining_balance, exchanged_values)
WithdrawSuccess (id, token_address, withdraw_balance)
```

## Contract Addresses <a name="contract_addresses"></a>

### ITO Contract

| Chain | Address |
| ----- | ------- |
| Mainnet | [0x198457da5e7f7b7fd916006837417dcf663f692d](https://etherscan.io/address/0x198457da5e7f7b7fd916006837417dcf663f692d) |
| Ropsten | [0x9003aed6d33604617da90e084b081ec65f18e786](https://ropsten.etherscan.io/address/0x9003aed6d33604617da90e084b081ec65f18e786) |
| Rinkeby | [0x7751b8c715d1Df74D181C86aE01801330211f370](https://rinkeby.etherscan.io/address/0x7751b8c715d1Df74D181C86aE01801330211f370) |
| Kovan | N/A |
| Görli | N/A |

## Qualification <a name="qualifiation"></a>

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `ifQualified()` that takes an address as input and returns a boolean indicating if the given address is qualified. Custom qualification contracts **SHOULD** implement contract `IQLF` rather than just ERC-165 to further ensure required interface is implemented, since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent malicious attack, you can set a `set_start_time` in your custom qualification contract, then add accounts who swap before that time to a black list, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise nobody can access your ITO at all. To let Mask broswer extension to help you check the if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_start_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_start_time()` to keep the same with the broswer extension code), just copy the implemetation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Empty Qualification Contract

| Chain | Address |
| ----- | ------- |
| Mainnet | [0x989252d4853db438235fbd9c946afc4cca6e21f1](https://etherscan.io/address/0x989252d4853db438235fbd9c946afc4cca6e21f1) |
| Ropsten | [0xbe3dd217479d93ed76457f01c98296c5235f3054](https://ropsten.etherscan.io/address/0xbe3dd217479d93ed76457f01c98296c5235f3054) |
| Rinkeby | [0x88AA0AB3B7cDE263073e1cBa1D06473adeC1b38E](https://rinkeby.etherscan.io/address/0x88AA0AB3B7cDE263073e1cBa1D06473adeC1b38E) |
| Kovan | N/A |
| Görli | N/A |


## Contribute <a name="contribute"></a>

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License <a name="license"></a>
InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).
