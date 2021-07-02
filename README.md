# InitialTwitterOffering

## Introduction

Initial Twitter Offering (ITO) is a Dapplet based on the Mask browser extension. It consists of two components, the browser extension and the Ethereum smart contract. This repo covers the design and the implementation of the smart contract only.

## Overview

ITO is basically a token swap pool that can be initiated by any Ethereum user. Users can transfer an amount of a target token (now supporting ETH and ERC20 tokens) into the pool and set the swap ratios, e.g. {1 ETH: 10000 TOKEN, 1 DAI: 10 TOKEN}. Users can also set the swap limit (ceiling) to control how many tokens to be swapped by a single address, e.g. 10000 TOKEN. After the pool is expired (also set on initiation) or the target token is out of stock, the pool creator can withdraw any target token left and all the swapped tokens. The pool will be destructed after the withdraw.

Participants only need to approve one of the specified tokens according to the `pool ratio` and call the `swap()` function to swap the target token out. The swapped amount is automatically calculated by the smart contract and the users can receive the target token instantly after a successful call of the `swap()`. Pool creator can also set an unlock time for ITO which means to receive the target token participants need to wait after that unlock time by calling `claim()` function.

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

The ITO smart contract adopts the `Proxy Upgrade Pattern` to improve user experience. Hence, the addresses in this section are actually the deployed `TransparentUpgradeableProxy` smart contract addresses.

| Chain | Address |
| ----- | ------- |
| Mainnet | [0xc2CFbF22](https://etherscan.io/address/0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46) |
| Ropsten | [0xBD4c3Cf0](https://ropsten.etherscan.io/address/0xBD4c3Cf084B6F4d25430Ee5d44436e860Cc58Ee4) |
| Rinkeby | [0x0A5A7372](https://rinkeby.etherscan.io/address/0x0A5A7372eDf3349C46ea5E58A887BA7337fdF261) |
| BSC | [0x96c7D011](https://bscscan.com/address/0x96c7D011cdFD467f551605f0f5Fce279F86F4186) |
| BSC-testnet | [0xbc558E76](https://testnet.bscscan.com/address/0xbc558E7683F79FAAE236c1083671396cbB2Ac242) |
| Matic | [0xF9F7C149](https://polygonscan.com/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0) |
| Matic-mumbai | [0x4df24eB0](https://polygon-explorer-mumbai.chainstacklabs.com/address/0x4df24eB095A73CeCDe7c89233CeE1efCc7C1c685) |

### ProxyAdmin

Besides, we also deployed the `ProxyAdmin` to manage the `proxy`.

| Chain | Address |
| ----- | ------- |
| Mainnet | [0x7aa4F9C7](https://etherscan.io/address/0x7aa4F9C72985Da8309aa97894070Dd855E63C544) |
| Ropsten | [0xa01c3cbe](https://ropsten.etherscan.io/address/0xa01c3cbeF7088cb4d22a990E1356F39bce7Ca3f2) |
| Rinkeby | [0x0061E06c](https://rinkeby.etherscan.io/address/0x0061E06c9f640a03C4981f43762d2AE5e03873c5) |
| BSC | [0x83D6b366](https://bscscan.com/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2) |
| BSC-testnet | [0xF7072bB9](https://testnet.bscscan.com/address/0xF7072bB93458250E38C6c4523882C6e2b5fe8ec0) |
| Matic | [0xAb7B1bE4](https://polygonscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B) |
| Matic-mumbai | [0xDB80b907](https://polygon-explorer-mumbai.chainstacklabs.com/address/0xDB80b9076F24EEee87425Fe70eA64222d9bD6A2a) |


## Qualification

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `logQualified()` that returns a boolean indicating if the given address is qualified. Custom qualification contract **SHOULD** implement contract `IQLF` rather than ERC-165 to further ensure the required interface is implemented since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent a malicious attack, you can set a `swap_start_time` in your custom qualification contract, then add accounts who swap before that time to a blacklist, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise, nobody can access your ITO at all. To let Mask browser extension help you check if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_start_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_start_time()` to keep the same with the browser extension code), just copy the implementation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Empty Qualification Contract

| Chain | Address |
| ----- | ------- |
| Mainnet | [0x4dC5f343](https://etherscan.io/address/0x4dC5f343Fe57E4fbDA1B454d125D396A3181272c) |
| Ropsten | [0xd5e6434b](https://ropsten.etherscan.io/address/0xd5e6434bde165062b3d9572DEFd6393c7B3E2902) |
| Rinkeby | [0x8440b99B](https://rinkeby.etherscan.io/address/0x8440b99B1Df5D4B61957c8Ce0a199487Be3De270) |
| BSC | [0xAb7B1bE4](https://bscscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B) |
| BSC-testnet | [0xaaC2362f](https://testnet.bscscan.com/address/0xaaC2362f2DC523E9B37B1EE2eA57110e1Bd63F59) |
| Matic | [0x2cf91AD8](https://polygonscan.com/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77) |
| Matic-mumbai | [0x8AB2579C](https://polygon-explorer-mumbai.chainstacklabs.com/address/0x8AB2579C91E4f1688e1787288d969450BF6d478d) |

## Security Audit

The Solidity code in this repository has been audited by blockchain security experts from SlowMist. If you are interested, here are the audit reports:
- [Audit Report](audits/SlowMist_Audit_Report_English.pdf) 
- [审计报告](audits/SlowMist_Audit_Report_Chinese.pdf) 

## Contribute

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License
InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).