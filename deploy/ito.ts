import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
    const HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPoolImpl, [1616976000]);
    await HappyTokenPoolProxy.deployed();

    await deploy('QLF', {
        from: deployer,
        args: [0],
        log: true,
    });
};

func.tags = ['HappyTokenPool'];

module.exports = func;
