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

To deploy contract on `ropsten`:

```bash
npm run deploy ropsten
```

To debug:

```solidity
//...
import "hardhat/console.sol";

function debug_param (address _token_addr) public {
    console.log('_token_addr', _token_addr);
}
```

## Deployed Contract

### ITO Contract

The ITO smart contract adopts the `Proxy Upgrade Pattern` to improve user experience. Hence, the addresses in later section are actually the deployed `TransparentUpgradeableProxy` smart contract addresses.

### Qualification

Another smart contract interface `IQLF` ([source code](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/IQLF.sol)) is also introduced to provide an API `logQualified()` that returns a boolean indicating if the given address is qualified. Custom qualification contract **SHOULD** implement contract `IQLF` rather than ERC-165 to further ensure the required interface is implemented since `IQLF` is compliant with ERC-165 and has implemented the details of `supportsInterface` function.

To prevent a malicious attack, you can set a `swap_start_time` in your custom qualification contract, then add accounts who swap before that time to a blacklist, they will no longer be able to access your ITO. Please confirm the `swap_start_time` carefully, it must be less than the end time of ITO, otherwise, nobody can access your ITO at all. To let Mask browser extension help you check if `swap_start_time` is less than the end time of ITO. You need to append `interfaceId == this.get_start_time.selector;` to `supportsInterface()`(Notice the getter function **MUST** be named `get_start_time()` to keep the same with the browser extension code), just copy the implementation of [our default qualification contract](https://github.com/DimensionDev/InitialTwitterOffering/blob/master/contracts/qualification.sol).

### Contract Addresses

<!-- begin address -->

| Chain               | ITO                                     | Dummy Qualification                     |
| ------------------- | --------------------------------------- | --------------------------------------- |
| Mainnet             | [`0xc2CFbF22`][ito-mainnet]             | [`0x4dC5f343`][qlf-mainnet]             |
| Ropsten             | [`0xcdE281B3`][ito-ropsten]             | [`0xd5e6434b`][qlf-ropsten]             |
| Rinkeby             | [`0xBe62f180`][ito-rinkeby]             | [`0x8440b99B`][qlf-rinkeby]             |
| BSC                 | [`0x96c7D011`][ito-bsc]                 | [`0xAb7B1bE4`][qlf-bsc]                 |
| BSC_test            | [`0xbc558E76`][ito-bsc_test]            | [`0xaaC2362f`][qlf-bsc_test]            |
| Matic               | [`0xF9F7C149`][ito-matic]               | [`0x2cf91AD8`][qlf-matic]               |
| Arbitrum_rinkeby    | [`0x9b3649eC`][ito-arbitrum_rinkeby]    | [`0xEbd753E6`][qlf-arbitrum_rinkeby]    |
| Arbitrum            | [`0x71834a3F`][ito-arbitrum]            | [`0x913975af`][qlf-arbitrum]            |
| xDai                | [`0x913975af`][ito-xdai]                | [`0x71834a3F`][qlf-xdai]                |
| Goerli              | [`0x3475255F`][ito-goerli]              | [`0x957DCb39`][qlf-goerli]              |
| Fantom              | [`0x981be454`][ito-fantom]              | [`0x83D6b366`][qlf-fantom]              |
| Celo                | [`0x54a0A221`][ito-celo]                | [`0x2cB220F9`][qlf-celo]                |
| Avalanche           | [`0x02Ea0720`][ito-avalanche]           | [`0x54a0A221`][qlf-avalanche]           |
| Optimism_kovan      | [`0x88edAC7a`][ito-optimism_kovan]      | [`0x57E2AAB7`][qlf-optimism_kovan]      |
| Optimism            | [`0x71834a3F`][ito-optimism]            | [`0x913975af`][qlf-optimism]            |
| Aurora              | [`0x2cf91AD8`][ito-aurora]              | [`0x578a7Fee`][qlf-aurora]              |
| Fuse                | [`0xF9F7C149`][ito-fuse]                | [`0x2cf91AD8`][qlf-fuse]                |
| Boba                | [`0x981be454`][ito-boba]                | [`0x83D6b366`][qlf-boba]                |
| Moonriver           | [`0x981be454`][ito-moonriver]           | [`0x83D6b366`][qlf-moonriver]           |
| Conflux_espace_test | [`0x83D6b366`][ito-conflux_espace_test] | [`0x96c7D011`][qlf-conflux_espace_test] |
| Conflux_espace      | [`0x066804d9`][ito-conflux_espace]      | [`0x05ee315E`][qlf-conflux_espace]      |
| Harmony             | [`0x5B966f3a`][ito-harmony]             | [`0x02Ea0720`][qlf-harmony]             |
| Harmony_test        | [`0x578a7Fee`][ito-harmony_test]        | [`0x81246335`][qlf-harmony_test]        |
| Metis_test          | [`0x71834a3F`][ito-metis_test]          |                                         |
| Metis               | [`0x5B966f3a`][ito-metis]               |                                         |
| Kardia              | [`0x224e8327`][ito-kardia]              | [`0x0cE6df81`][qlf-kardia]              |

[ito-mainnet]: https://etherscan.io/address/0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46
[ito-ropsten]: https://ropsten.etherscan.io/address/0xcdE281B32b629f2e89E5953B674E1E507e6dabcF
[ito-rinkeby]: https://rinkeby.etherscan.io/address/0xBe62f1805C43559cC62f9326103354080588B158
[ito-bsc]: https://bscscan.com/address/0x96c7D011cdFD467f551605f0f5Fce279F86F4186
[ito-bsc_test]: https://testnet.bscscan.com/address/0xbc558E7683F79FAAE236c1083671396cbB2Ac242
[ito-matic]: https://polygonscan.com/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0
[ito-arbitrum_rinkeby]: https://rinkeby-explorer.arbitrum.io/address/0x9b3649eC8C9f68484acC76D437B145a4e58Bf2A2
[ito-arbitrum]: https://explorer.arbitrum.io/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9
[ito-xdai]: https://blockscout.com/xdai/mainnet/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c
[ito-goerli]: https://goerli.etherscan.io/address/0x3475255Fa26434B680DAe20D6469222C135f33Ea
[ito-fantom]: https://ftmscan.com/address/0x981be454a930479d92C91a0092D204b64845A5D6
[ito-celo]: https://explorer.celo.org/address/0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B
[ito-avalanche]: https://snowtrace.io/address/0x02Ea0720254F7fa4eca7d09A1b9C783F1020EbEF
[ito-optimism_kovan]: https://kovan-optimistic.etherscan.io/address/0x88edAC7aEDEeAfaD15439010B0bdC0D067763571
[ito-optimism]: https://optimistic.etherscan.io/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9
[ito-aurora]: https://explorer.mainnet.aurora.dev/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77
[ito-fuse]: https://explorer.fuse.io/address/0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0
[ito-boba]: https://blockexplorer.boba.network/address/0x981be454a930479d92C91a0092D204b64845A5D6
[ito-moonriver]: https://moonriver.moonscan.io/address/0x981be454a930479d92C91a0092D204b64845A5D6
[ito-conflux_espace_test]: https://evmtestnet.confluxscan.io/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2
[ito-conflux_espace]: https://evm.confluxscan.io/address/0x066804d9123bf2609ed4a4a40b1177a9c5a9ed51
[ito-harmony]: https://explorer.harmony.one/address/0x5B966f3a32Db9C180843bCb40267A66b73E4f022
[ito-harmony_test]: https://explorer.pops.one/address/0x578a7Fee5f0D8CEc7d00578Bf37374C5b95C4b98
[ito-metis_test]: https://stardust-explorer.metis.io/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9
[ito-metis]: https://andromeda-explorer.metis.io/address/0x5B966f3a32Db9C180843bCb40267A66b73E4f022
[ito-kardia]: https://explorer.kardiachain.io/address/0x224e8327182a85e511A08C63C4341efB0460f36e
[qlf-mainnet]: https://etherscan.io/address/0x4dC5f343Fe57E4fbDA1B454d125D396A3181272c
[qlf-ropsten]: https://ropsten.etherscan.io/address/0xd5e6434bde165062b3d9572DEFd6393c7B3E2902
[qlf-rinkeby]: https://rinkeby.etherscan.io/address/0x8440b99B1Df5D4B61957c8Ce0a199487Be3De270
[qlf-bsc]: https://bscscan.com/address/0xAb7B1bE4233A04e5C43a810E75657ECED8E5463B
[qlf-bsc_test]: https://testnet.bscscan.com/address/0xaaC2362f2DC523E9B37B1EE2eA57110e1Bd63F59
[qlf-matic]: https://polygonscan.com/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77
[qlf-arbitrum_rinkeby]: https://rinkeby-explorer.arbitrum.io/address/0xEbd753E66649C824241E63894301BA8Db5DBF5Bb
[qlf-arbitrum]: https://explorer.arbitrum.io/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c
[qlf-xdai]: https://blockscout.com/xdai/mainnet/address/0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9
[qlf-goerli]: https://goerli.etherscan.io/address/0x957DCb3918E33dD80bd3db193ACb2A90812fE615
[qlf-fantom]: https://ftmscan.com/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2
[qlf-celo]: https://explorer.celo.org/address/0x2cB220F925E603A04BEE05F210252120deBA29d7
[qlf-avalanche]: https://snowtrace.io/address/0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B
[qlf-optimism_kovan]: https://kovan-optimistic.etherscan.io/address/0x57E2AAB712E9c61CA55A6402223DbEe3d4eE09aa
[qlf-optimism]: https://optimistic.etherscan.io/address/0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c
[qlf-aurora]: https://explorer.mainnet.aurora.dev/address/0x578a7Fee5f0D8CEc7d00578Bf37374C5b95C4b98
[qlf-fuse]: https://explorer.fuse.io/address/0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77
[qlf-boba]: https://blockexplorer.boba.network/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2
[qlf-moonriver]: https://moonriver.moonscan.io/address/0x83D6b366f21e413f214EB077D5378478e71a5eD2
[qlf-conflux_espace_test]: https://evmtestnet.confluxscan.io/address/0x96c7D011cdFD467f551605f0f5Fce279F86F4186
[qlf-conflux_espace]: https://evm.confluxscan.io/address/0x05ee315E407C21a594f807D61d6CC11306D1F149
[qlf-harmony]: https://explorer.harmony.one/address/0x02Ea0720254F7fa4eca7d09A1b9C783F1020EbEF
[qlf-harmony_test]: https://explorer.pops.one/address/0x812463356F58fc8194645A1838ee6C52D8ca2D26
[qlf-kardia]: https://explorer.kardiachain.io/address/0x0cE6df8171AD4B23fe162FFA01DEC8595ED1f7cc

<!-- end address -->

### Implementation block number (required by frontend developers)

<!-- begin block -->

| Chain               | v1.0                   | v2.0                               |
| ------------------- | ---------------------- | ---------------------------------- |
| Mainnet             | [12689616][v1-mainnet] | [12766513][v2-mainnet]             |
| Ropsten             | [10468221][v1-ropsten] | [10572050][v2-ropsten]             |
| BSC                 | [8508077][v1-bsc]      | [8885927][v2-bsc]                  |
| Matic               | [16002769][v1-matic]   | [16516643][v2-matic]               |
| Arbitrum_rinkeby    |                        | [708696][v2-arbitrum_rinkeby]      |
| Arbitrum            |                        | [102022][v2-arbitrum]              |
| xDai                |                        | [17865755][v2-xdai]                |
| Goerli              |                        | [6028660][v2-goerli]               |
| Fantom              |                        | [25071597][v2-fantom]              |
| Celo                |                        | [10406511][v2-celo]                |
| Avalanche           |                        | [8289892][v2-avalanche]            |
| Optimism_kovan      |                        | [47716][v2-optimism_kovan]         |
| Optimism            |                        | [8994][v2-optimism]                |
| Aurora              |                        | [57350598][v2-aurora]              |
| Fuse                |                        | [14951572][v2-fuse]                |
| Boba                |                        | [290600][v2-boba]                  |
| Moonriver           |                        | [1314566][v2-moonriver]            |
| Conflux_espace_test |                        | [66092470][v2-conflux_espace_test] |
| Conflux_espace      |                        | [37722805][v2-conflux_espace]      |
| Harmony             |                        | [24133305][v2-harmony]             |
| Harmony_test        |                        | [22744597][v2-harmony_test]        |
| Metis_test          |                        | [5207086][v2-metis_test]           |
| Metis               |                        | [1701875][v2-metis]                |
| Kardia              |                        | [7566530][v2-kardia]               |

[v1-mainnet]: https://etherscan.io/block/12689616
[v2-mainnet]: https://etherscan.io/block/12766513
[v1-ropsten]: https://ropsten.etherscan.io/block/10468221
[v2-ropsten]: https://ropsten.etherscan.io/block/10572050
[v1-bsc]: https://bscscan.com/block/8508077
[v2-bsc]: https://bscscan.com/block/8885927
[v1-matic]: https://polygonscan.com/block/16002769
[v2-matic]: https://polygonscan.com/block/16516643
[v2-arbitrum_rinkeby]: https://rinkeby-explorer.arbitrum.io/block/708696
[v2-arbitrum]: https://explorer.arbitrum.io/block/102022
[v2-xdai]: https://blockscout.com/xdai/mainnet/blocks/17865755
[v2-goerli]: https://goerli.etherscan.io/block/6028660
[v2-fantom]: https://ftmscan.com/block/25071597
[v2-celo]: https://explorer.celo.org/block/10406511
[v2-avalanche]: https://snowtrace.io/block/8289892
[v2-optimism_kovan]: https://kovan-optimistic.etherscan.io/batch/47716
[v2-optimism]: https://optimistic.etherscan.io/batch/8994
[v2-aurora]: https://explorer.mainnet.aurora.dev/block/57350598
[v2-fuse]: https://explorer.fuse.io/block/14951572
[v2-boba]: https://blockexplorer.boba.network/blocks/290600
[v2-moonriver]: https://moonriver.moonscan.io/block/1314566
[v2-conflux_espace_test]: https://evmtestnet.confluxscan.io/block/66092470
[v2-conflux_espace]: https://evm.confluxscan.io/block/37722805
[v2-harmony]: https://explorer.harmony.one/block/24133305
[v2-harmony_test]: https://explorer.pops.one/block/22744597
[v2-metis_test]: https://stardust-explorer.metis.io/block/5207086
[v2-metis]: https://andromeda-explorer.metis.io/block/1701875
[v2-kardia]: https://explorer.kardiachain.io/block/7566530

<!-- end block -->

## Security Audit

The Solidity code in this repository has been audited by blockchain security experts from SlowMist. If you are interested, here are the audit reports:

- [Audit Report](audits/SlowMist_Audit_Report_English.pdf)
- [审计报告](audits/SlowMist_Audit_Report_Chinese.pdf)

## Contribute

Any contribution is welcomed to make it more secure and powerful. Had you any questions, please do not hesitate to create an issue to let us know.

## License

InitialTwitterOffering is released under the [MIT LICENSE](LICENSE).
