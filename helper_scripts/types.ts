export enum ChainId {
  Mainnet = 1,
  Ropsten = 3,
  Rinkeby = 4,
  BSC = 56,
  BSC_test = 97,
  Matic = 137,
  Arbitrum_rinkeby = 421611,
  Arbitrum = 42161,
  Goerli = 5,
  Fantom = 250,
  Celo = 42220,
  Avalanche = 43114,
  Optimism_kovan = 69,
  Optimism = 10,
  Aurora = 1313161554,
  Fuse = 122,
  Boba = 288,
  Moonriver = 1285,
  Conflux_espace_test = 71,
  Conflux_espace = 1030,
  Harmony = 1666600000,
  Harmony_test = 1666700000,
  Metis = 1088,
  Metis_test = 28,
  xDai = 100,
  Kardia = 24,
  Astar = 592,
}

function makeDetailURL(domain: string) {
  return (param: string, section: string) => `https://${domain}/${section}/${param}`
}

export const BlockExplorer: Record<ChainId, (param: string, section: string) => string> = {
  [ChainId.Mainnet]: makeDetailURL("etherscan.io"),
  [ChainId.Ropsten]: makeDetailURL("ropsten.etherscan.io"),
  [ChainId.Rinkeby]: makeDetailURL("rinkeby.etherscan.io"),
  [ChainId.BSC]: makeDetailURL("bscscan.com"),
  [ChainId.BSC_test]: makeDetailURL("testnet.bscscan.com"),
  [ChainId.Matic]: makeDetailURL("polygonscan.com"),
  [ChainId.Goerli]: makeDetailURL("goerli.etherscan.io"),
  [ChainId.Fantom]: makeDetailURL("ftmscan.com"),
  [ChainId.Celo]: makeDetailURL("explorer.celo.org"),
  [ChainId.Avalanche]: makeDetailURL("snowtrace.io"),
  [ChainId.Optimism_kovan]: (param, section) => {
    return section == "address" ?
      makeDetailURL("kovan-optimistic.etherscan.io")(param, section) :
      `https://kovan-optimistic.etherscan.io/batch/${param}`;
  },
  [ChainId.Optimism]: (param, section) => {
    return section == "address" ?
      makeDetailURL("optimistic.etherscan.io")(param, section) :
      `https://optimistic.etherscan.io/batch/${param}`;
  },
  [ChainId.Aurora]: makeDetailURL("explorer.mainnet.aurora.dev"),
  [ChainId.Fuse]: makeDetailURL("explorer.fuse.io"),
  [ChainId.Boba]: (param, section) => {
    return section == "address" ?
      makeDetailURL("blockexplorer.boba.network")(param, section) :
      `https://blockexplorer.boba.network/blocks/${param}`;
  },
  [ChainId.Moonriver]: makeDetailURL("moonriver.moonscan.io"),
  [ChainId.Conflux_espace_test]: makeDetailURL("evmtestnet.confluxscan.io"),
  [ChainId.Conflux_espace]: makeDetailURL("evm.confluxscan.io"),
  [ChainId.Harmony]: makeDetailURL("explorer.harmony.one"),
  [ChainId.Harmony_test]: makeDetailURL("explorer.pops.one"),
  [ChainId.Metis]: makeDetailURL("andromeda-explorer.metis.io"),
  [ChainId.Metis_test]: makeDetailURL("stardust-explorer.metis.io"),
  [ChainId.xDai]: (param, section) => {
    return section == "address" ?
      `https://blockscout.com/xdai/mainnet/address/${param}` :
      `https://blockscout.com/xdai/mainnet/blocks/${param}`;
  },
  [ChainId.Arbitrum]: makeDetailURL("explorer.arbitrum.io"),
  [ChainId.Arbitrum_rinkeby]: makeDetailURL("rinkeby-explorer.arbitrum.io"),
  [ChainId.Kardia]: makeDetailURL("explorer.kardiachain.io"),
  [ChainId.Astar]: makeDetailURL("blockscout.com/astar"),
}

export type DeployedAddressRow = {
  Chain: string,
  HappyTokenPool: string,
  Qualification: string,
  v1Block: string,
  v2Block: string,
}
