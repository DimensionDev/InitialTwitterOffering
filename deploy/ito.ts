import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';

type MyMapLikeType = Record<string, string>;
const deployedContracts: MyMapLikeType = {
    mainnet: '0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46',
    ropsten: '0xBD4c3Cf084B6F4d25430Ee5d44436e860Cc58Ee4',
    rinkeby: '0x0A5A7372eDf3349C46ea5E58A887BA7337fdF261',
    bsc_test: '0xbc558E7683F79FAAE236c1083671396cbB2Ac242',
    bsc_mainnet: '0x96c7D011cdFD467f551605f0f5Fce279F86F4186',
    matic_mumbai_test: '0x4df24eB095A73CeCDe7c89233CeE1efCc7C1c685',
    matic_mainnet: '0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0',
};

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const network: string = hre.hardhatArguments.network ? hre.hardhatArguments.network : 'ropsten';
    const proxyAddress = deployedContracts[network];

    if (false) {
        // deploy, we normally do this only once
        const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
        const HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPoolImpl, [1616976000]);
        await HappyTokenPoolProxy.deployed();
        console.log('HappyTokenPoolProxy: ' + HappyTokenPoolProxy.address);
    } else {
        // upgrade contract
        const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
        await upgrades.upgradeProxy(proxyAddress, HappyTokenPoolImpl);
    }

    await deploy('QLF', {
        from: deployer,
        args: [0],
        log: true,
    });
};

func.tags = ['HappyTokenPool'];

module.exports = func;
