import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  await deploy('HappyTokenPool', {
    from: deployer,
    args: [1616976000],
    log: true,
  })
}

func.tags = ['HappyTokenPool']

module.exports = func
