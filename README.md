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

| Chain            | Address                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mainnet          | [0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46](https://etherscan.io/address/0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46)                          |
| Ropsten          | [0xcdE281B32b629f2e89E5953B674E1E507e6dabcF](https://ropsten.etherscan.io/address/0xcdE281B32b629f2e89E5953B674E1E507e6dabcF)                  |
| Rinkeby          | [0xBe62f1805C43559cC62f9326103354080588B158](https://rinkeby.etherscan.io/address/0xBe62f1805C43559cC62f9326103354080588B158)                  |
| BSC              | [0x96c7D011cdFD467f551605f0f5Fce279F86F4186](https://bscscan.com/address/0x96c7D011cdFD467f551605f0f5Fce279F86F4186)                           |
| BSC-testnet      | [0xbc558E7683F79FAAE236c1083671396cbB2Ac242](https://testnet.bscscan.com/address/0xbc558E7683F79FAAE236c1083671396cbB2Ac242)                   |
| Matic            | [0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0](https://polygonscan.com/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0)                       |
| Rinkeby-Arbitrum | [0x9b3649eC8C9f68484acC76D437B145a4e58Bf2A2](https://rinkeby-explorer.arbitrum.io/address/0x9b3649eC8C9f68484acC76D437B145a4e58Bf2A2)          |
| Arbitrum         | [0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9](https://explorer.arbitrum.io/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9)                  |
| xDai             | [0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c](https://blockscout.com/xdai/mainnet/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c/contracts) |
| Goerli           | [0x3475255Fa26434B680DAe20D6469222C135f33Ea](https://goerli.etherscan.io/address/0x3475255Fa26434B680DAe20D6469222C135f33Ea)                   |
| Fantom           | [0x981be454a930479d92C91a0092D204b64845A5D6](https://ftmscan.com/address/0x981be454a930479d92C91a0092D204b64845A5D6)                           |
| Celo             | [0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B](https://explorer.celo.org/address/0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B/transactions)        |
| Avalanche        | [0x02Ea0720254F7fa4eca7d09A1b9C783F1020EbEF](https://snowtrace.io/address/0x02Ea0720254F7fa4eca7d09A1b9C783F1020EbEF)                          |
| Kovan-optimistic | [0x88edAC7aEDEeAfaD15439010B0bdC0D067763571](https://kovan-optimistic.etherscan.io/address/0x88edAC7aEDEeAfaD15439010B0bdC0D067763571)         |
| Optimistic       | [0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9](https://optimistic.etherscan.io/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9)               |
| Aurora           | [0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77](https://explorer.mainnet.aurora.dev/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77/transactions) |
| Fuse             | [0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0](https://explorer.fuse.io/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0/transactions)            |
| Boba             | [0x981be454a930479d92C91a0092D204b64845A5D6](https://blockexplorer.boba.network/address/0x981be454a930479d92C91a0092D204b64845A5D6/transactions)  |
| Moonriver        | [0x981be454a930479d92C91a0092D204b64845A5D6](https://moonriver.moonscan.io/address/0x981be454a930479d92C91a0092D204b64845A5D6)            |
| cfx_test         | [0x83D6b366f21e413f214EB077D5378478e71a5eD2](https://evmtestnet.confluxscan.net/address/0x83d6b366f21e413f214eb077d5378478e71a5ed2)            |
| cfx              | [0x066804d9123bf2609ed4a4a40b1177a9c5a9ed51](https://evm.confluxscan.net/address/0x066804d9123bf2609ed4a4a40b1177a9c5a9ed51)                   |
| Harmony          | [0x5B966f3a32Db9C180843bCb40267A66b73E4f022](https://explorer.harmony.one/address/0x5b966f3a32db9c180843bcb40267a66b73e4f022)                   |
| Harmony_test     | [0x578a7Fee5f0D8CEc7d00578Bf37374C5b95C4b98](https://explorer.pops.one/address/0x578a7fee5f0d8cec7d00578bf37374c5b95c4b98)                   |

### Implementation block number (required by frontend developers)

| Chain            | v1.0                               | v1.01                               |
| ---------------- | ---------------------------------- | ----------------------------------- |
| Mainnet          | [12689616][mainnet-block-12689616] | [12766513][mainnet-block-12766513]  |
| Ropsten          | [10468221][ropsten-block-10468221] | [10572050][ropsten-block-10572050]  |
| BSC              | [8508077][bsc-block-8508077]       | [8885927][bsc-block-8885927]        |
| Matic            | [16002769][polygon-block-16002769] | [16516643][polygon-block-16516643 ] |
| Rinkeby-Arbitrum | N/A                                | [708696][rinkeby-arbitrum-708696 ]  |
| Arbitrum         | N/A                                | [102022][arbitrum-102022 ]          |
| xDai             | N/A                                | [17865755][xdai-17865755 ]          |
| Goerli           | N/A                                | [6028660][goerli-6028660 ]          |
| Fantom           | N/A                                | [25071597][fantom-25071597 ]        |
| Celo             | N/A                                | [10406511][celo-10406511 ]          |
| Avalanche        | N/A                                | [8289892][avalanche-8289892 ]       |
| Kovan-optimistic | N/A                                | [47716][kovan-optimistic-47716 ]    |
| Optimistic       | N/A                                | [8994][optimistic-8994 ]            |
| Aurora           | N/A                                | [57350598][aurora-57350598 ]        |
| Fuse             | N/A                                | [14951572][fuse-14951572 ]          |
| Boba             | N/A                                | [290600][boba-290600 ]              |
| Moonriver        | N/A                                | [1314566][moonriver-1314566 ]       |
| cfx_test         | N/A                                | [66092470][cfx_test-66092470 ]      |
| cfx              | N/A                                | [37722805][cfx-37722805 ]           |
| Harmony          | N/A                                | [24133195][harmony-24133195 ]       |
| Harmony_test     | N/A                                | [22744578][harmony_test-22744578 ]  |

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
[xdai-17865755]: https://blockscout.com/xdai/mainnet/blocks/17865755/transactions
[goerli-6028660]: https://goerli.etherscan.io/block/6028660
[fantom-25071597]: https://ftmscan.com/block/25071597
[celo-10406511]: https://explorer.celo.org/block/10406511/transactions
[avalanche-8289892]: https://snowtrace.io/block/8289892
[kovan-optimistic-47716]: https://kovan-optimistic.etherscan.io/batch/47716
[optimistic-8994]: https://optimistic.etherscan.io/batch/8994
[aurora-57350598]: https://explorer.mainnet.aurora.dev/block/57350598/transactions
[fuse-14951572]: https://explorer.fuse.io/block/14951572/transactions
[boba-290600]: https://blockexplorer.boba.network/blocks/290600/transactions
[moonriver-1314566]: https://moonriver.moonscan.io/block/1314566
[cfx_test-66092470]: https://evmtestnet.confluxscan.net/block/66092470
[cfx-37722805]: https://evm.confluxscan.net/block/37722805
[harmony-24133195]: https://explorer.harmony.one/block/24133195
[harmony_test-22744578]: https://explorer.pops.one/block/22744578

## Qualification

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `logQualified()` that returns a boolean indicating if the given address is qualified. Custom qualification contract **SHOULD** implement contract `IQLF` rather than ERC-165 to further ensure the required interface is implemented since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent a malicious attack, you can set a `swap_start_time` in your custom qualification contract, then add accounts who swap before that time to a blacklist, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise, nobody can access your ITO at all. To let Mask browser extension help you check if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_start_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_start_time()` to keep the same with the browser extension code), just copy the implementation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Dummy Qualification Contract

| Chain            | Address                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mainnet          | [0x4dC5f343Fe57E4fbDA1B454d125D396A3181272c](https://etherscan.io/address/0x4dC5f343Fe57E4fbDA1B454d125D396A3181272c)                          |
| Ropsten          | [0xd5e6434bde165062b3d9572DEFd6393c7B3E2902](https://ropsten.etherscan.io/address/0xd5e6434bde165062b3d9572DEFd6393c7B3E2902)                  |
| Rinkeby          | [0x8440b99B1Df5D4B61957c8Ce0a199487Be3De270](https://rinkeby.etherscan.io/address/0x8440b99B1Df5D4B61957c8Ce0a199487Be3De270)                  |
| BSC              | [0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B](https://bscscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B)                           |
| BSC-testnet      | [0xaaC2362f2DC523E9B37B1EE2eA57110e1Bd63F59](https://testnet.bscscan.com/address/0xaaC2362f2DC523E9B37B1EE2eA57110e1Bd63F59)                   |
| Matic            | [0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77](https://polygonscan.com/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77)                       |
| Rinkeby-Arbitrum | [0xEbd753E66649C824241E63894301BA8Db5DBF5Bb](https://rinkeby-explorer.arbitrum.io/address/0xEbd753E66649C824241E63894301BA8Db5DBF5Bb)          |
| Arbitrum         | [0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c](https://explorer.arbitrum.io/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c)                  |
| xDai             | [0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9](https://blockscout.com/xdai/mainnet/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9/contracts) |
| Goerli           | [0x957DCb3918E33dD80bd3db193ACb2A90812fE615](https://goerli.etherscan.io/address/0x957DCb3918E33dD80bd3db193ACb2A90812fE615)                   |
| Fantom           | [0x83D6b366f21e413f214EB077D5378478e71a5eD2](https://ftmscan.com/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2)                           |
| Celo             | [0x2cB220F925E603A04BEE05F210252120deBA29d7](https://explorer.celo.org/address/0x2cB220F925E603A04BEE05F210252120deBA29d7/transactions)        |
| Avalanche        | [0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B](https://snowtrace.io/address/0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B)                          |
| Kovan-optimistic | [0x57E2AAB712E9c61CA55A6402223DbEe3d4eE09aa](https://kovan-optimistic.etherscan.io/address/0x57E2AAB712E9c61CA55A6402223DbEe3d4eE09aa)         |
| Optimistic       | [0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c](https://optimistic.etherscan.io/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c)               |
| Aurora           | [0x578a7Fee5f0D8CEc7d00578Bf37374C5b95C4b98](https://explorer.mainnet.aurora.dev/address/0x578a7Fee5f0D8CEc7d00578Bf37374C5b95C4b98/transactions) |
| Fuse             | [0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77](https://explorer.fuse.io/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77/transactions)            |
| Boba             | [0x83D6b366f21e413f214EB077D5378478e71a5eD2](https://blockexplorer.boba.network/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2/transactions)            |
| Moonriver        | [0x83D6b366f21e413f214EB077D5378478e71a5eD2](https://moonriver.moonscan.io/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2)            |
| cfx_test         | [0x96c7D011cdFD467f551605f0f5Fce279F86F4186](https://evmtestnet.confluxscan.net/address/0x96c7d011cdfd467f551605f0f5fce279f86f4186)            |
| cfx              | [0x05ee315E407C21a594f807D61d6CC11306D1F149](https://evm.confluxscan.net/address/0x05ee315e407c21a594f807d61d6cc11306d1f149)                   |
| Harmony          | [0x02Ea0720254F7fa4eca7d09A1b9C783F1020EbEF](https://explorer.harmony.one/address/0x02ea0720254f7fa4eca7d09a1b9c783f1020ebef)                   |
| Harmony_test     | [0x812463356F58fc8194645A1838ee6C52D8ca2D26](https://explorer.pops.one/address/0x812463356f58fc8194645a1838ee6c52d8ca2d26)                   |

## Security Audit

The Solidity code in this repository has been audited by blockchain security experts from SlowMist. If you are interested, here are the audit reports:

- [Audit Report](audits/SlowMist_Audit_Report_English.pdf)
- [审计报告](audits/SlowMist_Audit_Report_Chinese.pdf)

## Contribute

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License

InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).
