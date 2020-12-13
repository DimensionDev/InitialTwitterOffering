const BigNumber = require('bignumber.js');

let TestTokenA = artifacts.require('TestTokenA');
let TestTokenB = artifacts.require('TestTokenB');
let TestTokenC = artifacts.require('TestTokenC');

module.exports = function(deployer){
    const amount = new BigNumber('1e26').toFixed();
    deployer.deploy(TestTokenA, amount);
    deployer.deploy(TestTokenB, amount);
    deployer.deploy(TestTokenC, amount);
};
