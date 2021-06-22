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

| Contract | [Mainnet](https://etherscan.io/) | [Ropsten](https://ropsten.etherscan.io/) | [BSC](https://bscscan.com/) |[BSC-testnet](https://testnet.bscscan.com/) | [Matic](https://matic.network/) | [Matic-mumbai](https://explorer-mumbai.maticvigil.com/) |
|---|---|---|---|---|---|---|
| [ITO](contracts/ito.sol) | [0xxxxxxxx](https://etherscan.io/address/0xxxxxxxx) | [0xBD4c3Cf0](https://ropsten.etherscan.io/address/0xBD4c3Cf084B6F4d25430Ee5d44436e860Cc58Ee4) | [0x96c7D011](https://bscscan.com/address/0x96c7D011cdFD467f551605f0f5Fce279F86F4186) | [0xbc558E76](https://testnet.bscscan.com/address/0xbc558E7683F79FAAE236c1083671396cbB2Ac242) | [0xF9F7C149](https://polygonscan.com/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0) | [0x4df24eB0](https://explorer-mumbai.maticvigil.com/address/0x4df24eB095A73CeCDe7c89233CeE1efCc7C1c685) |


## Qualification

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `ifQualified()` that takes an address as input and returns a boolean indicating if the given address is qualified. Custom qualification contract **SHOULD** implement contract `IQLF` rather than ERC-165 to further ensure required interface is implemented, since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent malicious attack, you can set a `swap_start_time` in your custom qualification contract, then add accounts who swap before that time to a black list, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise nobody can access your ITO at all. To let Mask broswer extension to help you check the if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_start_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_start_time()` to keep the same with the broswer extension code), just copy the implemetation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Empty Qualification Contract

| Contract | [Mainnet](https://etherscan.io/) | [Ropsten](https://ropsten.etherscan.io/) | [BSC](https://bscscan.com/) |[BSC-testnet](https://testnet.bscscan.com/) | [Matic](https://matic.network/) | [Matic-mumbai](https://explorer-mumbai.maticvigil.com/) |
|---|---|---|---|---|---|---|
| [qualification](contracts/qualification.sol) | [0xxxxxxxx](https://etherscan.io/address/0xxxxxxxx) | [0xd5e6434b](https://ropsten.etherscan.io/address/0xd5e6434bde165062b3d9572DEFd6393c7B3E2902) | [0xAb7B1bE4](https://bscscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B) | [0xaaC2362f](https://testnet.bscscan.com/address/0xaaC2362f2DC523E9B37B1EE2eA57110e1Bd63F59) | [0x2cf91AD8](https://polygonscan.com/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77) | [0x8AB2579C](https://explorer-mumbai.maticvigil.com/address/0x8AB2579C91E4f1688e1787288d969450BF6d478d) |



## Contribute

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License
InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).
