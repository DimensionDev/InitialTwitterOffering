# InitialTwitterOffering

## Introduction

Initial Twitter Offering (ITO) is a Dapplet based on the Mask browser extension. It consists of two components, the browser extension and the Ethereum smart contract. This repo covers the design and the implementation of the smart contract only.

## Overview

ITO is basically a token swap pool that can be initiated by any Ethereum user. Users can transfer an amount of a target token (now supporting ETH and ERC20 tokens) into the pool and set the swap ratios, e.g. {1 ETH: 10000 TOKEN, 1 DAI: 10 TOKEN}. Users can also set the swap limit (ceiling) to control how many tokens to be swapped by a single address, e.g. 10000 TOKEN. After the pool is expired (also set on initiation) or the target token is out of stock, the pool creator can withdraw any target token left and all the swapped tokens. The pool will be destructed after the withdraw.

Participants only need to approve one of the specified tokens according to the `pool ratio` and call the `swap()` function to swap the target token out. The swapped amount is automatically calculated by the smart contract and the users can receive the target token instantly after a successful call of the `swap()`. Pool creator can also set an unlock time for ITO which means to receive the target token participants need to wait after that unlock time by calling `claim()` function.

## Getting Started

This is a standard truffle project.
To install:

```bash
npm ci
```

To build the project:

```bash
npm run compile
```

To test the project:

```bash
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

| Chain            | Address                    |
| ---------------- | -------------------------- |
| Mainnet          | [0xc2CFbF22][ito-c2cfbf22] |
| Ropsten          | [0xBD4c3Cf0][ito-bd4c3cf0] |
| BSC              | [0x96c7D011][ito-96c7d011] |
| Matic            | [0xF9F7C149][ito-f9f7c149] |
| Rinkeby-Arbitrum | [0x9b3649eC][ito-9b3649eC] |
| Arbitrum         | [0x71834a3F][ito-71834a3F] |

[ito-c2cfbf22]: https://etherscan.io/address/0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46
[ito-bd4c3cf0]: https://ropsten.etherscan.io/address/0xBD4c3Cf084B6F4d25430Ee5d44436e860Cc58Ee4
[ito-96c7d011]: https://bscscan.com/address/0x96c7D011cdFD467f551605f0f5Fce279F86F4186
[ito-f9f7c149]: https://polygonscan.com/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0
[ito-9b3649eC]: https://rinkeby-explorer.arbitrum.io/address/0x9b3649eC8C9f68484acC76D437B145a4e58Bf2A2
[ito-71834a3F]: https://explorer.arbitrum.io/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9

### Implementation block number (required by frontend developers)

| Chain            | v1.0                               | v1.01                               |
| ---------------- | ---------------------------------- | ----------------------------------- |
| Mainnet          | [12689616][mainnet-block-12689616] | [12766513][mainnet-block-12766513]  |
| Ropsten          | [10468221][ropsten-block-10468221] | [10572050][ropsten-block-10572050]  |
| BSC              | [8508077][bsc-block-8508077]       | [8885927][bsc-block-8885927]        |
| Matic            | [16002769][polygon-block-16002769] | [16516643][polygon-block-16516643 ] |
| Rinkeby-Arbitrum | N/A                                | [708696][rinkeby-arbitrum-708696 ]  |
| Arbitrum         | N/A                                | [102022][arbitrum-102022 ]          |

[mainnet-block-12689616]: https://etherscan.io/block/12689616
[ropsten-block-10468221]: https://ropsten.etherscan.io/block/10468221
[bsc-block-8508077]: https://bscscan.com/block/8508077
[polygon-block-16002769 ]: https://polygonscan.com/block/16002769

[mainnet-block-12766513]: https://etherscan.io/block/12766513
[ropsten-block-10572050]: https://ropsten.etherscan.io/block/10572050
[bsc-block-8885927]: https://bscscan.com/block/8885927
[polygon-block-16516643]: https://polygonscan.com/block/16516643
[rinkeby-arbitrum-708696]: https://rinkeby-explorer.arbitrum.io/block/708696
[arbitrum-102022]: https://explorer.arbitrum.io/block/102022

### ProxyAdmin

Besides, we also deployed the `ProxyAdmin` to manage the `proxy`.

| Chain        | Address                      |
| ------------ | ---------------------------- |
| Mainnet      | [0x7aa4F9C7][proxy-7aa4f9c7] |
| Ropsten      | [0xa01c3cbe][proxy-a01c3cbe] |
| Rinkeby      | [0x0061E06c][proxy-0061e06c] |
| BSC          | [0x83D6b366][proxy-83d6b366] |
| BSC-testnet  | [0xF7072bB9][proxy-f7072bb9] |
| Matic        | [0xAb7B1bE4][proxy-ab7b1be4] |
| Matic-mumbai | [0xDB80b907][proxy-db80b907] |

[proxy-7aa4f9c7]: https://etherscan.io/address/0x7aa4F9C72985Da8309aa97894070Dd855E63C544
[proxy-a01c3cbe]: https://ropsten.etherscan.io/address/0xa01c3cbeF7088cb4d22a990E1356F39bce7Ca3f2
[proxy-0061e06c]: https://rinkeby.etherscan.io/address/0x0061E06c9f640a03C4981f43762d2AE5e03873c5
[proxy-83d6b366]: https://bscscan.com/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2
[proxy-f7072bb9]: https://testnet.bscscan.com/address/0xF7072bB93458250E38C6c4523882C6e2b5fe8ec0
[proxy-ab7b1be4]: https://polygonscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B
[proxy-db80b907]: https://polygon-explorer-mumbai.chainstacklabs.com/address/0xDB80b9076F24EEee87425Fe70eA64222d9bD6A2a

## Qualification

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `logQualified()` that returns a boolean indicating if the given address is qualified. Custom qualification contract **SHOULD** implement contract `IQLF` rather than ERC-165 to further ensure the required interface is implemented since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent a malicious attack, you can set a `swap_start_time` in your custom qualification contract, then add accounts who swap before that time to a blacklist, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise, nobody can access your ITO at all. To let Mask browser extension help you check if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_start_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_start_time()` to keep the same with the browser extension code), just copy the implementation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Empty Qualification Contract

| Chain            | Address                     |
| ---------------- | --------------------------- |
| Mainnet          | [0x4dC5f343][iqlf-4dc5f343] |
| Ropsten          | [0xd5e6434b][iqlf-d5e6434b] |
| Rinkeby          | [0x8440b99B][iqlf-8440b99b] |
| BSC              | [0xAb7B1bE4][iqlf-ab7b1be4] |
| BSC-testnet      | [0xaaC2362f][iqlf-aac2362f] |
| Matic            | [0x2cf91AD8][iqlf-2cf91ad8] |
| Matic-mumbai     | [0x8AB2579C][iqlf-8ab2579c] |
| Rinkeby-Arbitrum | [0xEbd753E6][iqlf-Ebd753E6] |
| Arbitrum         | [0x913975af][iqlf-913975af] |

[iqlf-4dc5f343]: https://etherscan.io/address/0x4dC5f343Fe57E4fbDA1B454d125D396A3181272c
[iqlf-d5e6434b]: https://ropsten.etherscan.io/address/0xd5e6434bde165062b3d9572DEFd6393c7B3E2902
[iqlf-8440b99b]: https://rinkeby.etherscan.io/address/0x8440b99B1Df5D4B61957c8Ce0a199487Be3De270
[iqlf-ab7b1be4]: https://bscscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B
[iqlf-aac2362f]: https://testnet.bscscan.com/address/0xaaC2362f2DC523E9B37B1EE2eA57110e1Bd63F59
[iqlf-2cf91ad8]: https://polygonscan.com/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77
[iqlf-8ab2579c]: https://polygon-explorer-mumbai.chainstacklabs.com/address/0x8AB2579C91E4f1688e1787288d969450BF6d478d
[iqlf-Ebd753E6]: https://rinkeby-explorer.arbitrum.io/address/0xEbd753E66649C824241E63894301BA8Db5DBF5Bb
[iqlf-913975af]: https://explorer.arbitrum.io/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c

## Security Audit

The Solidity code in this repository has been audited by blockchain security experts from SlowMist. If you are interested, here are the audit reports:

- [Audit Report](audits/SlowMist_Audit_Report_English.pdf)
- [审计报告](audits/SlowMist_Audit_Report_Chinese.pdf)

## Contribute

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License

InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).
