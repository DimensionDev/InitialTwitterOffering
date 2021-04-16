# InitialTwitterOffering

## Introduction

Initial Twitter Offering (ITO) is a Dapplet based on the Mask broswer extension. It consists of two components, the browser extension and the Ethereum smart contract. This repo covers the design and the implementation of the smart contract only.

## Overview

ITO is basically a token swap pool that can be initiated by any Ethereum user. Users can transfer an amount of a target token (now supporting ETH and ERC20) into the pool and set the swap ratios, e.g. {1 ETH: 10000 TOKEN, 1 DAI: 10 TOKEN}. Users can also set the swap limit (ceiling) to control how many tokens to be swapped by a single address, e.g. 10000 TOKEN. After the pool is expired (also set on initiation) or the target token is out of stock, the pool creator can withdraw any target token left and all the swapped tokens. The pool will be destructed after the withdrawl.

Participants only need to approve one of the specified token according to the pool ratio and call the `swap()` function to swap the target token out. The swapped amount is automatically calculated by the smart contract and the users can received the target token instantly after a successful call of the `swap()`. Pool creator can also set an unlock time for ITO which means to receive the target token participants need to wait after that unlock time by calling `claim()` function.

## Getting Started

This is a standard truffle project.
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

## Contract Address

### ITO Contract

| Chain | Address |
| ----- | ------- |
| Mainnet | [0x7aEa34bE68171c6898164f3986Db03964CCa49B7](https://etherscan.io/address/0x7aEa34bE68171c6898164f3986Db03964CCa49B7) |
| Ropsten | [0xDF0e910DcC73bdC8f4c332A4C12545928683221f](https://ropsten.etherscan.io/address/0xDF0e910DcC73bdC8f4c332A4C12545928683221f) |
| Rinkeby | [0x7751b8c715d1Df74D181C86aE01801330211f370](https://rinkeby.etherscan.io/address/0x7751b8c715d1Df74D181C86aE01801330211f370) |
| Kovan | N/A |
| Görli | N/A |

## Qualification

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `ifQualified()` that takes an address as input and returns a boolean indicating if the given address is qualified. Custom qualification contract **SHOULD** implement contract `IQLF` rather than ERC-165 to further ensure required interface is implemented, since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent malicious attack, you can set a `swap_start_time` in your custom qualification contract, then add accounts who swap before that time to a black list, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise nobody can access your ITO at all. To let Mask broswer extension to help you check the if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_creation_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_creation_time` to keep the same with the broswer extension code), just copy the implemetation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Empty Qualification Contract

| Chain | Address |
| ----- | ------- |
| Mainnet | [0x919931df4c9e943612ef565b334791e26dc26b3f](https://etherscan.io/address/0x919931df4c9e943612ef565b334791e26dc26b3f) |
| Ropsten | [0x0ac13391f146604a9d32521e536b97b2fe1c5f90](https://ropsten.etherscan.io/address/0x0ac13391f146604a9d32521e536b97b2fe1c5f90) |
| Rinkeby | [0x88AA0AB3B7cDE263073e1cBa1D06473adeC1b38E](https://rinkeby.etherscan.io/address/0x88AA0AB3B7cDE263073e1cBa1D06473adeC1b38E) |
| Kovan | N/A |
| Görli | N/A |


## Contribute

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License
InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).
