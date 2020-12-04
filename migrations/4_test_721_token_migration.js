let testTokenB = artifacts.require('TestToken');

module.exports = function(deployer){
  deployer.deploy(Test721Token, 20);
};
