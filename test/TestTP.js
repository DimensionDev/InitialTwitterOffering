const TestTokenA = artifacts.require("TestTokenA");
const TestTokenB = artifacts.require("TestTokenB");
const TestTokenC = artifacts.require("TestTokenC");
const HappyTokenPool = artifacts.require("HappyTokenPool");
var testtokenA;
var testtokenB;
var testtokenC;
var pool;
var pool_id;
var _total_tokens;
var _limit;

contract("HappyTokenPool", accounts => {
    beforeEach(async () =>{
        console.log("Before ALL\n");
        testtokenA = await TestTokenA.deployed();
        testtokenB = await TestTokenB.deployed();
        testtokenC = await TestTokenC.deployed();
        pool = await HappyTokenPool.deployed();
        _total_tokens = web3.utils.toBN(100*1e18);
        _limit = web3.utils.toBN(1*1e18);
    });

    it("Should return the HappyTokenPool contract creator", async () => {
        const contract_creator = await pool.contract_creator.call();
        assert.equal(contract_creator, accounts[0]);
    });

    it("Should return a pool id", async () => {

        const password = "1";
        const hash = web3.utils.sha3(password);

        const duration = 2592000;
        const seed = web3.utils.sha3("lajsdklfjaskldfhaikl");
        const tokenA_address = testtokenA.address;
        const tokenB_address = testtokenB.address;
        const tokenC_address = testtokenC.address;
        var exchange_addrs = [tokenB_address, tokenC_address];
        var ratios = [1, 2000, 4000, 1];
        const total_tokens = _total_tokens;
        const limit = _limit;

        const fill_success_encode = 'FillSuccess(uint256,bytes32,address,uint256,address)';
        const fill_success_types = ['uint256', 'bytes32', 'address', 'uint256', 'address'];

        await testtokenA.approve.sendTransaction(pool.address, total_tokens);
        const fill_receipt = await pool.fill_pool
                                .sendTransaction(hash, 0, 2592000,
                                                exchange_addrs, ratios,
                                                tokenA_address, total_tokens, limit);
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(fill_success_encode)]});
        pool_id = web3.eth.abi.decodeParameters(fill_success_types, logs[0].data)['1'];
        assert.notEqual(pool_id, null);
    });

    it("Should allow one to exchange 2 tokenB for 1 token A.", async () => {
        const amount = web3.utils.toBN(3*1e18);
        await testtokenB.approve.sendTransaction(accounts[1], amount);
        //await testtokenB.transfer.sendTransaction(accounts[1], 2*1e18);
        const validation = web3.utils.sha3(accounts[1]);
        const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[1], validation, 0, {'from': accounts[1]});

        const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)";
        const claim_success_types = ['bytes32', 'address', 'uint256', 'address'];
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]});
        const balance1 = testtokenA.balanceOf(accounts[1]);
        assert(balance1, web3.utils.toBN(1.5*1e15));
    });

    it("Should allow one to exchange 1 tokenC for 2 token A.", async () => {
        const amount = web3.utils.toBN(1.5*1e14);
        await testtokenC.approve.sendTransaction(accounts[2], amount);
        //await testtokenC.transfer.sendTransaction(accounts[2], 1*1e18);
        const validation = web3.utils.sha3(accounts[2]);
        const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[2], validation, 1, {'from': accounts[2]});

        const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)";
        const claim_success_types = ['bytes32', 'address', 'uint256', 'address'];
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]});
        const balance2 = testtokenA.balanceOf(accounts[2]);
        assert(balance2, web3.utils.toBN(6*1e18));
    });

});

