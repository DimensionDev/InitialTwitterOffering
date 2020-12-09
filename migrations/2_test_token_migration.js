let TestTokenA = artifacts.require('TestTokenA');
let TestTokenB = artifacts.require('TestTokenB');
let TestTokenC = artifacts.require('TestTokenC');

module.exports = function(deployer){
    deployer.deploy(TestTokenA, 1000000);
    deployer.deploy(TestTokenB, 1000000);
    deployer.deploy(TestTokenC, 1000000);
};
