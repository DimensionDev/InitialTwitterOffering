import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-ethers'
import 'solidity-coverage'

import 'hardhat-deploy'

const networks = process.env.DEPLOY_PRIVATE_KEY
  ? {
      ropsten: {
        url: 'https://ropsten.infura.io/v3/4ab93ab12e864f0eb58fae67143e0195',
        accounts: [process.env.DEPLOY_PRIVATE_KEY],
      },
    }
  : {}
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.0',
  },
  networks,
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
}
