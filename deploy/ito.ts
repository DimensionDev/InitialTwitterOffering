import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';

const { base_timestamp } = require('../test/constants');

type MyMapLikeType = Record<string, string>;
const deployedContracts: MyMapLikeType = {
    mainnet: '0xc2CFbF22d6Dc87D0eE18d38d73733524c109Ff46',
    ropsten: '0xcdE281B32b629f2e89E5953B674E1E507e6dabcF',
    rinkeby: '0xBe62f1805C43559cC62f9326103354080588B158',
    bsc_test: '0xbc558E7683F79FAAE236c1083671396cbB2Ac242',
    bsc_mainnet: '0x96c7D011cdFD467f551605f0f5Fce279F86F4186',
    matic_mumbai_test: '0x4df24eB095A73CeCDe7c89233CeE1efCc7C1c685',
    matic_mainnet: '0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0',
    arbitrum: '0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9',
    arbitrum_rinkeby: '0x9b3649eC8C9f68484acC76D437B145a4e58Bf2A2',
    xdai: '0x913975af2Bb8a6Be4100D7dc5e9765B77F6A5d6c',
    goerli: '0x3475255Fa26434B680DAe20D6469222C135f33Ea',
    fantom: '0x981be454a930479d92C91a0092D204b64845A5D6',
    celo: '0x54a0A221C25Fc0a347EC929cFC5db0be17fA2a2B',
    avalanche: '0x02Ea0720254F7fa4eca7d09A1b9C783F1020EbEF',
    optimism: '0x71834a3FDeA3E70F14a93ED85c6be70925D0CAd9',
    optimism_kovan: '0x88edAC7aEDEeAfaD15439010B0bdC0D067763571',
    aurora: '0x2cf91AD8C175305EBe6970Bd8f81231585EFbd77',
    fuse: '0xF9F7C1496c21bC0180f4B64daBE0754ebFc8A8c0',
    boba: '0x981be454a930479d92C91a0092D204b64845A5D6',
    moonriver: '0x981be454a930479d92C91a0092D204b64845A5D6',
    conflux_eSpace: '0x066804d9123bf2609ed4a4a40b1177a9c5a9ed51',
    conflux_eSpace_test: '0x83D6b366f21e413f214EB077D5378478e71a5eD2',
    harmony: '0x5B966f3a32Db9C180843bCb40267A66b73E4f022',
    metis: '0x5B966f3a32Db9C180843bCb40267A66b73E4f022',
};

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    const network: string = hre.hardhatArguments.network ? hre.hardhatArguments.network : 'ropsten';
    const proxyAddress = deployedContracts[network];

    if (false) {
        // deploy, we normally do this only once
        if (true) {
            const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
            const HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPoolImpl, [base_timestamp]);
            await HappyTokenPoolProxy.deployed();
            console.log('HappyTokenPoolProxy: ' + HappyTokenPoolProxy.address);

            const admin = await upgrades.admin.getInstance();
            const impl_addr = await admin.getProxyImplementation(HappyTokenPoolProxy.address);
            console.log('Implementation address: ', impl_addr);
            await hre.run('verify:verify', {
                address: impl_addr,
                constructorArguments: [],
            });
        }

        if (false) {
            const tx = await deploy('QLF', {
                from: deployer,
                args: [0],
                log: true,
            });

            console.log(tx.address);
            await hre.run('verify:verify', {
                address: tx.address,
                constructorArguments: [0],
            });
        }
    } else {
        // upgrade contract
        const HappyTokenPoolImpl = await ethers.getContractFactory('HappyTokenPool');
        const instance = await upgrades.upgradeProxy(proxyAddress, HappyTokenPoolImpl);

        await instance.deployTransaction.wait();
        const admin = await upgrades.admin.getInstance();
        const impl = await admin.getProxyImplementation(proxyAddress);
        // example: `npx hardhat verify --network rinkeby 0x8974Ce3955eE1306bA89687C558B6fC1E5be777B`
        await hre.run('verify:verify', {
            address: impl,
            constructorArguments: [],
        });
    }
};

func.tags = ['HappyTokenPool'];

module.exports = func;
