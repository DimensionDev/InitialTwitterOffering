var QualificationTester = artifacts.require("QLF");

module.exports = function(deployer){
    deployer.deploy(QualificationTester, 'NeverSayNo');
};
