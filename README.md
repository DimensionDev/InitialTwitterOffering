# InitialTwitterOffering

## Introduction

Initial Twitter Offering (ITO) is a Dapplet based on the Mask broswer extension. It consists of two components, the browser extension and the Ethereum smart contract. This repo covers the design and the implementation of the smart contract only.

## Overview

ITO is basically a token swap pool that can be initiated by any Ethereum user. Users can transfer an amount of a target token (now supporting ETH and ERC20) into the pool and set the swap ratios, e.g. {1 ETH: 10000 TOKEN, 1 DAI: 10 TOKEN}. Another smart contract interface `IQLF` (described in the appendix) is also introduced to provide an API `ifQualified()` that takes an address as input and returns a boolean indicating if the given address is qualified. Users can also set the swap limit (ceiling) to control how many tokens to be swapped by a single address, e.g. 10000 TOKEN. After the pool is expired (also set on initiation) or the target token is out of stock, the pool creator can withdraw any target token left and all the swapped tokens. The pool will be destructed after the withdrawl.

Participants only need to approve one of the specified token according to the pool ratio and call the `swap()` function to swap the target token out. The swapped amount is automatically calculated by the smart contract and the users can received the target token instantly after a successful call of the `swap()`.

## Getting Started

This is a standard truffle project.
To install:
```
npm i
```
To build the project:
```
truffle build
```

To test the project:
```
npm install chai ganache-cli
truffle test
```

To debug:
```
truffle debug [TX_ID]
```

## Contract Address

### ITO Contract

| Chain | Address |
| ----- | ------- |
| Mainnet | [0xaaea10a15129c9f064685b4185ec2a0d69e34957](https://etherscan.io/address/0xaaea10a15129c9f064685b4185ec2a0d69e34957) |
| Ropsten | [0x8fA0f77597AeAAC87c1fDca5f5314B4E825FE1c4](https://ropsten.etherscan.io/address/0x8fA0f77597AeAAC87c1fDca5f5314B4E825FE1c4) |
| Rinkeby | [0x62C7e68a14C3692fb26a13637d3b399A47c50107](https://rinkeby.etherscan.io/address/0x62C7e68a14C3692fb26a13637d3b399A47c50107) |
| Kovan | N/A |
| Görli | N/A |

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