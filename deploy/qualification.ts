import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts();
  await deploy('QLF', {
    from: deployer,
    args: ['ito default qualification', 0],
    log: true,
  })
}

func.tags = ['QLF']

module.exports = func
