const BigNumber = require('bignumber.js');

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
        _total_tokens = BigNumber('10000e18').toFixed();
        _limit = BigNumber('1000e18').toFixed();
    });
    it("Should return the HappyTokenPool contract creator", async () => {
        const contract_creator = await pool.contract_creator.call();
        assert.equal(contract_creator, accounts[0]);
    });
    it("Should return a pool id", async () => {

        const password = "1";
        const hash = web3.utils.sha3(password);

        const duration = 2592000;                               // 30 days
        const seed = web3.utils.sha3("lajsdklfjaskldfhaikl");
        const tokenA_address = testtokenA.address;
        const tokenB_address = testtokenB.address;
        const tokenC_address = testtokenC.address;
        var exchange_addrs = ["0x0000000000000000000000000000000000000000", tokenB_address, tokenC_address];
        var ratios = [10000, 1, 1, 2000, 4000, 1];
        const total_tokens = _total_tokens;
        const limit = _limit;
        const name = "Cache Miss";
        const message = "Hello From the Outside";

        const fill_success_encode = 'FillSuccess(uint256,bytes32,address,uint256,address,string,string)';
        const fill_success_types = ['uint256', 'bytes32', 'address', 'uint256', 'address', 'string', 'string'];

        await testtokenA.approve.sendTransaction(pool.address, total_tokens, {'from': accounts[0]});
        const fill_receipt = await pool.fill_pool
                                .sendTransaction(hash, 0, 2592000, name, message,
                                                exchange_addrs, ratios,
                                                tokenA_address, total_tokens, limit);
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(fill_success_encode)]});
        pool_id = web3.eth.abi.decodeParameters(fill_success_types, logs[0].data)['1'];
        assert.notEqual(pool_id, null);
    });
    it("Should allow one to exchange 2000 tokenB for 1 token A.", async () => {
        var amount = BigNumber('1e26').toFixed();
        await testtokenB.approve.sendTransaction(accounts[1], amount);
        await testtokenB.transfer.sendTransaction(accounts[1], amount);
        amount = BigNumber('2e21').toFixed();
        const validation = web3.utils.sha3(accounts[1]);
        var previous_total = await pool.check_availability.call(pool_id, {'from': accounts[1]});
        previous_total = BigNumber(previous_total[1]);
        await testtokenB.approve.sendTransaction(pool.address, amount, {'from': accounts[1]});
        const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[1], validation, 1, amount, {'from': accounts[1]});

        const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)";
        const claim_success_types = ['bytes32', 'address', 'uint256', 'address'];
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]});
        var balance1 = await testtokenA.balanceOf.call(accounts[1]);
        balance1 = BigNumber(balance1).toFixed();
        assert.equal(balance1, BigNumber('1e18').toFixed());
        var remaining = await pool.check_availability.call(pool_id, {'from': accounts[1]});
        assert.equal(BigNumber(remaining[1]).toFixed(), BigNumber(previous_total - BigNumber(remaining[4])).toFixed());
    });
    it("Should allow one to exchange 0.1222222 tokenC for 488.8888 token A.", async () => {
        var amount = BigNumber('1e26').toFixed();
        await testtokenC.approve.sendTransaction(accounts[2], amount);
        await testtokenC.transfer.sendTransaction(accounts[2], amount);
        amount = BigNumber('1.222222e17').toFixed();
        const validation = web3.utils.sha3(accounts[2]);
        var previous_total = await pool.check_availability.call(pool_id, {'from': accounts[2]});
        previous_total = BigNumber(previous_total[1]);
        await testtokenC.approve.sendTransaction(pool.address, amount, {'from': accounts[2]});
        const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[2], validation, 2, amount, {'from': accounts[2]});

        const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)";
        const claim_success_types = ['bytes32', 'address', 'uint256', 'address'];
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]});
        var balance2 = await testtokenA.balanceOf.call(accounts[2]);
        balance2 = BigNumber(balance2).toFixed();
        assert.equal(balance2, BigNumber('4.888888e20').toFixed());
        var remaining = await pool.check_availability.call(pool_id, {'from': accounts[2]});
        assert.equal(BigNumber(remaining[1]).toFixed(), BigNumber(previous_total - BigNumber(remaining[4])).toFixed());
    });
    it("Should allow one to exchange 0.1 eth for 1000 token A.", async () => {
        const amount = BigNumber('1e17').toFixed();
        const validation = web3.utils.sha3(accounts[3]);
        var previous_total = await pool.check_availability.call(pool_id, {'from': accounts[3]});
        previous_total = BigNumber(previous_total[1]);
        const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[3], validation, 0, amount, {'from': accounts[3], 'value': amount});

        const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)";
        const claim_success_types = ['bytes32', 'address', 'uint256', 'address'];
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]});
        var balance3 = await testtokenA.balanceOf.call(accounts[3]);
        balance3 = BigNumber(balance3).toFixed();
        assert.notEqual(balance3, BigNumber('1e22').toFixed());
        assert.equal(balance3, BigNumber('1e21').toFixed());
        var remaining = await pool.check_availability.call(pool_id, {'from': accounts[3]});
        assert.equal(BigNumber(remaining[1]).toFixed(), BigNumber(previous_total - BigNumber(remaining[4])).toFixed());
    });
    it("Should allow the pool creator to destruct the pool and withdraw the corresponding tokens.", async () => {
        var previous_eth_balance = await web3.eth.getBalance(accounts[0]);
        previous_eth_balance = BigNumber(previous_eth_balance);
        const stats = await pool.check_availability.call(pool_id, {'from': accounts[0]});
        assert.equal(stats[2], false);
        assert.equal(stats[3], 0);
        assert.equal(BigNumber(stats[5][0]).toFixed(), BigNumber('1e17').toFixed());
        assert.equal(BigNumber(stats[5][1]).toFixed(), BigNumber('2e21').toFixed());
        assert.equal(BigNumber(stats[5][2]).toFixed(), BigNumber('1.222222e17').toFixed());

        const destruct_receipt = await pool.destruct.sendTransaction(pool_id, {'from': accounts[0]});
        var balance1 = await web3.eth.getBalance(accounts[0]);
        assert.isAbove((BigNumber(balance1) - previous_eth_balance) / BigNumber('1e16'), 9.5);
        var balance2 = await testtokenB.balanceOf.call(accounts[0]);
        assert.equal(BigNumber(balance2).toFixed(), BigNumber('2e21').toFixed());
        var balance3 = await testtokenC.balanceOf.call(accounts[0]);
        assert.equal(BigNumber(balance3).toFixed(), BigNumber('1.222222e17').toFixed());

    });
});
