const BigNumber = require('bignumber.js')
const chai = require('chai')
const sinon = require('sinon')
const helper = require('./helper')
const expect = chai.expect
chai.use(require('chai-as-promised'))

const TestTokenA = artifacts.require("TestTokenA")
const TestTokenB = artifacts.require("TestTokenB")
const TestTokenC = artifacts.require("TestTokenC")
const HappyTokenPool = artifacts.require("HappyTokenPool")
const InternalFunctions = artifacts.require("InternalFunctions")
const base_timestamp = 1606780800
const eth_address = "0x0000000000000000000000000000000000000000"
const fill_success_encode = 'FillSuccess(uint256,bytes32,address,uint256,address,string,string)'
const fill_success_types = [
    { type: 'uint256', name: 'total' },
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'creator' },
    { type: 'uint256', name: 'creation_time' },
    { type: 'address', name: 'token_address' },
    { type: 'string', name: 'name' },
    { type: 'string', name: 'message' }
]
const swap_success_encode = 'SwapSuccess(bytes32,address,address,address,uint256,uint256)'
const swap_success_types = [
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'swapper' },
    { type: 'address', name: 'from_address' },
    { type: 'address', name: 'to_address' },
    { type: 'uint256', name: 'from_value' },
    { type: 'uint256', name: 'to_value' }
]
const destruct_success_encode = 'DestructSuccess(bytes32,address,uint256,uint256[])'
const destruct_success_types = [
    { type: 'bytes32', name: 'id' },
    { type: 'address', name: 'token_address' },
    { type: 'uint256', name: 'remaining_tokens' },
    { type: 'uint256[]', name: 'exchanged_values' }
]
const PASSWORD = "password"
let internalFunctions
let test_tokenA
let test_tokenB
let test_tokenC
let pool
let fpp // fill pool parameters

let snapShot
let snapshotId

contract("HappyTokenPool", accounts => {
    beforeEach(async () =>{
        snapShot = await helper.takeSnapshot();
        snapshotId = snapShot['result'];
        test_tokenA = await TestTokenA.deployed()
        test_tokenB = await TestTokenB.deployed()
        test_tokenC = await TestTokenC.deployed()

        pool = await HappyTokenPool.deployed()
        fpp = {
            hash: web3.utils.sha3(PASSWORD),
            start_time: 0,
            end_time: 5184000, // duration 60 days
            poor_name: "Cache Miss",
            message: "Hello From the Outside",
            exchange_addrs: [eth_address, test_tokenB.address, test_tokenC.address],
            exchange_ratios: [1, 10000, 1, 2000, 4000, 1],
            token_address: test_tokenA.address,
            total_tokens: BigNumber('10000e18').toFixed(),
            limit: BigNumber('1000e18').toFixed()
        }
    })

    afterEach(async() => {
        await helper.revertToSnapShot(snapshotId);
    });

    it("Should return the HappyTokenPool contract creator", async () => {
        const contract_creator = await pool.contract_creator.call()
        expect(contract_creator).to.be.eq(accounts[0])
    })

    describe("fill_pool()", async () => {
        it("Should throw error when start time is greater than end time", async () => {
            fpp.start_time = fpp.end_time + 100

            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]})

            await expect(pool.fill_pool.sendTransaction(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it("Should throw error when limit is greater than total_tokens", async () => {
            fpp.limit = BigNumber('100001e18').toFixed()
            fpp.total_tokens = BigNumber('10000e18').toFixed()

            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]})

            await expect(pool.fill_pool.sendTransaction(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it("Should throw error when the size of exchange_ratios does not correspond to exchange_addrs", async () => {
            fpp.exchange_ratios = fpp.exchange_ratios.concat([4000, 1])

            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]})

            await expect(pool.fill_pool.sendTransaction(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it("Should throw error when tokens approved to spend is less than total_tokens", async () => {
            const tokens_approved = BigNumber('1000e18').toFixed()
            fpp.total_tokens = BigNumber('1001e18').toFixed()

            await test_tokenA.approve.sendTransaction(pool.address, tokens_approved, {'from': accounts[0]})

            await expect(pool.fill_pool.sendTransaction(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it("Should emit fillSuccess event correctly when a pool is filled", async () => {
            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]})
            await pool.fill_pool.sendTransaction(...Object.values(fpp))
            const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(fill_success_encode)]})
            const result = web3.eth.abi.decodeParameters(fill_success_types, logs[0].data)

            expect(result).to.have.property('total').that.to.be.eq(fpp.total_tokens)
            expect(result).to.have.property('id').that.to.not.be.null
            expect(result).to.have.property('creator').that.to.not.be.null
            expect(result).to.have.property('creation_time').that.to.length(10)
            expect(result).to.have.property('token_address').that.to.be.eq(test_tokenA.address)
            expect(result).to.have.property('name').that.to.be.eq('Cache Miss')
            expect(result).to.have.property('message').that.to.be.eq('Hello From the Outside')
        })
    })

    describe("check_availability()", async () => {
        beforeEach(async () => {
            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]})
        })

        it("Should throw error when poor id does not exist", async () => {
            await expect(pool.check_availability.call('id not exist', {'from': accounts[1]})).to.be.rejectedWith(Error)
        })

        it("Should return status `started === true` when current time greater than start_time", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() - 1000 * 10)
            fpp.start_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])

            expect(result.started).to.be.true
        })

        it("Should return status `started === false` when current time less than start_time", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 10)
            fpp.start_time = Math.ceil(this.clock.now / 1000) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])

            expect(result.started).to.be.false

            this.clock.restore()
        })

        it("Should return status `expired === true` when current time less than end_time", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() - 1000 * 10)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])

            expect(result.expired).to.be.true

            this.clock.restore()
        })

        it("Should return status `expired === false` when current time less than end_time", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 10)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])

            expect(result.expired).to.be.false

            this.clock.restore()
        })

        it("Should return the same exchange_addrs which fill the pool", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])
            expect(result.exchange_addrs).to.eql([eth_address, test_tokenB.address, test_tokenC.address])
        })

        it("Should return the exchanged_tokens filled with zero when there was no exchange", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])
            expect(result.exchanged_tokens.map(bn => web3.utils.fromWei(bn))).to.eql(['0', '0', '0'])
        })

        it("Should return the zero swapped token when the spender did no exchange before", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])
            expect(web3.utils.fromWei(result.swapped)).to.be.eq('0')
        })

        it("Should return same number of remaining token as total tokens when there was no exchange", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])
            expect(web3.utils.fromWei(result.remaining, 'wei')).to.be.eq(fpp.total_tokens)
        })

        it("Should minus the number of remaining token by exchange amount after swap", async () => {
            const transfer_amount = BigNumber('1e26').toFixed()
            const approve_amount = BigNumber('5e15').toFixed()
            const account = accounts[1]
            const tokenB_address_index = 1

            await test_tokenB.transfer.sendTransaction(account, transfer_amount)
            await test_tokenB.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const { remaining: remaining_before } = await getAvailability(pool, pool_id, account)
            const { verification, validation } = getVerification(PASSWORD, account)
            pool.swap.sendTransaction(pool_id, verification, account, validation, tokenB_address_index, approve_amount, {'from': account})
            const { remaining: remaining_now } = await getAvailability(pool, pool_id, account)
            const ratio = fpp.exchange_ratios[3] / fpp.exchange_ratios[2] // tokenA <=> tokenB
            const exchange_tokenA_amount = weiToEther(approve_amount) * ratio
            expect(weiToEther(remaining_before) - weiToEther(remaining_now)).to.be.eq(exchange_tokenA_amount)
        })
    })

    describe("swap()", async () => {
        const account = accounts[3]
        const tokenC_address_index = 2
        let verification
        let validation
        let exchange_amount
        before(async () => {
            const transfer_amount = BigNumber('1e26').toFixed()
            await test_tokenC.transfer.sendTransaction(account, transfer_amount)
        })

        beforeEach(async () => {
            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]})
            const r = getVerification(PASSWORD, account)
            verification = r.verification
            validation = r.validation
            exchange_amount = BigNumber('1e10').toFixed()
        })

        it("Should throw error when pool id does not exist", async () => {
            const pool_id = "id not exist"
            await expect(
                pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when validation wrong", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            await expect(
                pool.swap.sendTransaction(pool_id, verification, account, "wrong validation", tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when pool is waiting for start", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 1000)
            fpp.start_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            fpp.end_time = fpp.start_time + 1000 * 1000
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            expect(
                pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when pool is expired", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() - 1000 * 1000)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            fpp.start_time = fpp.end_time - 100000 * 10
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            expect(
                pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when password wrong", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            await expect(
                pool.swap.sendTransaction(pool_id, "wrong password", account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when exchange amount not equals to approve amount", async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = BigNumber('2e10').toFixed()

            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            expect(
                pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should better not draw water with a sieve", async () => {
            const approve_amount = BigNumber('0').toFixed()
            exchange_amount = BigNumber('0').toFixed()

            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            expect(
                pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when one account swap more than once", async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            await pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            expect(
                pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should emit swapSuccess when swap successful", async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            await pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(swap_success_encode)]})
            const result = web3.eth.abi.decodeParameters(swap_success_types, logs[0].data)
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4] // tokenA <=> tokenC

            expect(result).to.have.property('id').that.to.not.be.null
            expect(result).to.have.property('swapper').that.to.not.be.null
            expect(result).to.have.property('from_value').that.to.be.eq(String(exchange_amount))
            expect(result).to.have.property('to_value').that.to.be.eq(String(exchange_amount * ratio))
            expect(result).to.have.property('from_address').that.to.be.eq(test_tokenC.address)
            expect(result).to.have.property('to_address').that.to.be.eq(test_tokenA.address)
        })

        it("Should swap the maximum number of token equals to limit", async () => {
            approve_amount = BigNumber('5e25').toFixed()
            exchange_amount = approve_amount
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            await pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(swap_success_encode)]})
            const result = web3.eth.abi.decodeParameters(swap_success_types, logs[0].data)
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4] // tokenA <=> tokenC

            expect(result).to.have.property('to_value').that.to.be.eq(fpp.limit)
            expect(result).to.have.property('to_value').that.to.not.be.eq(String(exchange_amount * ratio))
        })

        it("Should swap various numbers of token", async () => {
            fpp.total_tokens = BigNumber('100e18').toFixed()
            fpp.limit = BigNumber('50e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            // 0.004 ETH => 40 TESTA
            approve_amount = BigNumber('4e15').toFixed()
            exchange_amount = approve_amount
            var vr = getVerification(PASSWORD, accounts[5])
            await pool.swap.sendTransaction(pool_id, vr.verification, accounts[5], vr.validation, 0, exchange_amount, {'from': accounts[5], 'value': approve_amount})
            const logs_eth = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(swap_success_encode)]})
            const result_eth = web3.eth.abi.decodeParameters(swap_success_types, logs_eth[0].data)
            const ratio_eth = fpp.exchange_ratios[1] / fpp.exchange_ratios[0] // tokenA <=> tokenC

            expect(result_eth).to.have.property('to_value').that.to.be.eq(String(exchange_amount * ratio_eth))

            // 0.02 TESTB => 40 TESTA
            _transfer_amount = BigNumber('1e26').toFixed()
            await test_tokenB.transfer.sendTransaction(accounts[4], _transfer_amount)

            approve_amount = BigNumber('2e16').toFixed()
            exchange_amount = approve_amount
            await test_tokenB.approve.sendTransaction(pool.address, approve_amount, { 'from': accounts[4] })

            var vr = getVerification(PASSWORD, accounts[4])
            await pool.swap.sendTransaction(pool_id, vr.verification, accounts[4], vr.validation, 1, exchange_amount, {'from': accounts[4]})
            const logs_b = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(swap_success_encode)]})
            const result_b = web3.eth.abi.decodeParameters(swap_success_types, logs_b[0].data)
            const ratio_b = fpp.exchange_ratios[3] / fpp.exchange_ratios[2] // tokenA <=> tokenC

            expect(result_b).to.have.property('to_value').that.to.be.eq(String(exchange_amount * ratio_b))

            // 80000 TESTC => 20 TESTA
            approve_amount = BigNumber('1.6e23').toFixed()
            exchange_amount = approve_amount
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })

            await pool.swap.sendTransaction(pool_id, verification, account, validation, tokenC_address_index, exchange_amount, {'from': account})
            const logs_c = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(swap_success_encode)]})
            const result_c = web3.eth.abi.decodeParameters(swap_success_types, logs_c[0].data)
            const ratio_c = fpp.exchange_ratios[5] / fpp.exchange_ratios[4] // tokenA <=> tokenC

            expect(result_c).to.have.property('to_value').that.to.not.be.eq(String(exchange_amount * ratio_c))
            expect(result_c).to.have.property('to_value').that.to.not.be.eq(fpp.limit)
            expect(result_c).to.have.property('to_value').that.to.be.eq(BigNumber('2e19').toFixed())
        })
    })

    describe("destruct()", async () => {
        beforeEach(async () => {
            await test_tokenA.approve.sendTransaction(pool.address, BigNumber("1e27"), {'from': accounts[0]})
        })

        it("Should throw error when you're not the creator of the pool", async () => {
            const account_not_creator = accounts[5]
            this.clock = sinon.useFakeTimers(new Date().getTime() - 100000 * 10)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            expect(pool.destruct.sendTransaction(pool_id, { from: account_not_creator })).to.be.rejectedWith(Error)
            this.clock.restore()
        })

        it("Should throw error when pool is not expired", async () => {
            const creator = accounts[0]
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 1000)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            fpp.start_time = fpp.end_time - 100000 * 10
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)

            expect(pool.destruct.sendTransaction(pool_id, { from: creator })).to.be.rejectedWith(Error)
            this.clock.restore()
        })

        it("Should emit RefundSuccess event and withdraw the corresponding tokens correctly", async () => {
            const creator = accounts[0]
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 1000)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            let previous_eth_balance = await web3.eth.getBalance(accounts[0])
            const previous_tokenB_balance = await test_tokenB.balanceOf.call(accounts[0])
            const previous_tokenC_balance = await test_tokenC.balanceOf.call(accounts[0])

            const swapperETH = accounts[3]
            const ETH_address_index = 0
            const exchange_ETH_amount = BigNumber('1e15').toFixed()
            const { verification, validation } = getVerification(PASSWORD, swapperETH)
            await pool.swap.sendTransaction(
                pool_id,
                verification,
                swapperETH,
                validation,
                ETH_address_index,
                exchange_ETH_amount,
                { 'from': swapperETH, 'value': exchange_ETH_amount }
            );

            const swapperB = accounts[4]
            const tokenB_address_index = 1
            const exchange_tokenB_amount = BigNumber('2e10').toFixed()
            await approveThenSwapToken(test_tokenB, swapperB, tokenB_address_index, pool_id, exchange_tokenB_amount)

            const swapperC = accounts[5]
            const tokenC_address_index = 2
            const exchange_tokenC_amount = BigNumber('1e22').toFixed()
            await approveThenSwapToken(test_tokenC, swapperC, tokenC_address_index, pool_id, exchange_tokenC_amount)

            await helper.advanceTimeAndBlock(2000 * 1000);
            await pool.destruct.sendTransaction(pool_id, { from: creator })

            const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(destruct_success_encode)]})
            const result = web3.eth.abi.decodeParameters(destruct_success_types, logs[0].data)

            expect(result).to.have.property('id').that.to.be.eq(pool_id)
            expect(result).to.have.property('token_address').that.to.be.eq(test_tokenA.address)
            expect(result).to.have.property('remaining_tokens')
            expect(result).to.have.property('exchanged_values')

            const ratioETH = fpp.exchange_ratios[1] / fpp.exchange_ratios[0]
            const ratioB = fpp.exchange_ratios[3] / fpp.exchange_ratios[2]
            const ratioC = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]
            const remaining_tokens =
                (fpp.total_tokens -
                    (ratioB * exchange_tokenB_amount) -
                    (ratioC * exchange_tokenC_amount) -
                    (ratioETH * exchange_ETH_amount)
                )
            const result_remaining_tokens = Number(result.remaining_tokens)

            expect(result_remaining_tokens).to.be.eq(remaining_tokens)

            /*
            const eth_balance = await web3.eth.getBalance(accounts[0])
            expect(
                (eth_balance - previous_eth_balance) / Number(exchange_ETH_amount)
            ).to.be.greaterThan(0.995).and.to.be.lessThan(1)
            */

            const transfer_amount = BigNumber('1e26').toFixed()
            const tokenB_balance = await test_tokenB.balanceOf.call(accounts[0])

            expect(BigNumber(tokenB_balance.valueOf()).toFixed()).to.be.eq(
                BigNumber(previous_tokenB_balance).minus(BigNumber(transfer_amount)).plus(BigNumber(exchange_tokenB_amount)).toFixed()
            ).and.to.be.eq(
                BigNumber("9e26").plus(BigNumber("2e10")).toFixed()
            )

            const tokenC_balance = await test_tokenC.balanceOf.call(accounts[0])
            expect(BigNumber(tokenC_balance.valueOf()).toFixed()).to.be.eq(
                BigNumber(previous_tokenC_balance).minus(BigNumber(transfer_amount)).plus(BigNumber(exchange_tokenC_amount)).toFixed()
            ).and.to.be.eq(
                BigNumber("80001e22").toFixed()
            )

            this.clock.restore()
        })

        it("Should emit RefundSuccess event and withdraw the corresponding tokens correctly", async () => {
            const creator = accounts[0]
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 1000)
            fpp.end_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            fpp.exchange_ratios = [1, 75000, 1, 100, 1, 100],
            fpp.limit = BigNumber('100000e18').toFixed()
            fpp.total_tokens = BigNumber('1000000e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            let previous_eth_balance = await web3.eth.getBalance(accounts[0])
            const previous_tokenB_balance = await test_tokenB.balanceOf.call(accounts[0])
            const previous_tokenC_balance = await test_tokenC.balanceOf.call(accounts[0])

            const swapperETH = accounts[3]
            const ETH_address_index = 0
            const exchange_ETH_amount = BigNumber('1.3e18').toFixed()
            const { verification, validation } = getVerification(PASSWORD, swapperETH)
            await pool.swap.sendTransaction(
                pool_id,
                verification,
                swapperETH,
                validation,
                ETH_address_index,
                exchange_ETH_amount,
                { 'from': swapperETH, 'value': exchange_ETH_amount }
            );

            const swapperB = accounts[4]
            const tokenB_address_index = 1
            const exchange_tokenB_amount = BigNumber('500e18').toFixed()
            await approveThenSwapToken(test_tokenB, swapperB, tokenB_address_index, pool_id, exchange_tokenB_amount)

            const swapperC = accounts[5]
            const tokenC_address_index = 2
            const exchange_tokenC_amount = BigNumber('2000e18').toFixed()
            await approveThenSwapToken(test_tokenC, swapperC, tokenC_address_index, pool_id, exchange_tokenC_amount)

            await helper.advanceTimeAndBlock(2000 * 1000);
            await pool.destruct.sendTransaction(pool_id, { from: creator })

            const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(destruct_success_encode)]})
            const result = web3.eth.abi.decodeParameters(destruct_success_types, logs[0].data)

            expect(result).to.have.property('id').that.to.be.eq(pool_id)
            expect(result).to.have.property('token_address').that.to.be.eq(test_tokenA.address)
            expect(result).to.have.property('remaining_tokens')
            expect(result).to.have.property('exchanged_values')

            const ratioETH = fpp.exchange_ratios[1] / fpp.exchange_ratios[0]
            const ratioB = fpp.exchange_ratios[3] / fpp.exchange_ratios[2]
            const ratioC = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]
            const remaining_tokens =
                BigNumber(fpp.total_tokens).minus(
                    BigNumber(ratioB).times(BigNumber(exchange_tokenB_amount)).plus(
                        BigNumber('100000e18')
                    ).plus(
                        BigNumber(ratioETH).times(BigNumber(exchange_ETH_amount))
                    )
                ).toFixed()
            const result_remaining_tokens = BigNumber(result.remaining_tokens).toFixed()

            expect(result_remaining_tokens).to.be.eq(remaining_tokens)

            const eth_balance = await web3.eth.getBalance(accounts[0])
            assert((BigNumber(eth_balance).minus(BigNumber(previous_eth_balance))).gt(BigNumber(1e18)))     // gain >1
            assert((BigNumber(eth_balance).minus(BigNumber(previous_eth_balance))).lt(BigNumber(1.3e18)))   // gain<1.3

            const transfer_amount = BigNumber('1e26').toFixed()
            const tokenB_balance = await test_tokenB.balanceOf.call(accounts[0])

            expect(BigNumber(tokenB_balance.valueOf()).toFixed()).to.be.eq(
                BigNumber(previous_tokenB_balance).minus(BigNumber(transfer_amount)).plus(BigNumber(exchange_tokenB_amount)).toFixed()
            )

            const tokenC_balance = await test_tokenC.balanceOf.call(accounts[0])
            expect(BigNumber(tokenC_balance.valueOf()).toFixed()).to.be.eq(
                BigNumber(previous_tokenC_balance).minus(BigNumber(transfer_amount)).plus(
                    BigNumber(exchange_tokenC_amount)
                ).toFixed()
            )

            this.clock.restore()
        })
    })

    async function approveThenSwapToken (test_token, swapper, token_address_index, pool_id, exchange_amount) {
        const r = getVerification(PASSWORD, swapper)
        verification = r.verification
        validation = r.validation

        const transfer_amount = BigNumber('1e26').toFixed()
        await test_token.transfer.sendTransaction(swapper, transfer_amount)
        const approve_amount = exchange_amount
        await test_token.approve.sendTransaction(pool.address, approve_amount, { 'from': swapper })
        await pool.swap.sendTransaction(pool_id, verification, swapper, validation, token_address_index, exchange_amount, {'from': swapper})
    }

    function weiToEther (bn) {
        return Number(web3.utils.fromWei(bn))
    }

    function getVerification (password, account) {
        var hash = web3.utils.sha3(password)
        var hash_bytes = Uint8Array.from(Buffer.from(hash.slice(2,), 'hex'))
        hash = hash_bytes.slice(0, 6)
        hash = '0x' + Buffer.from(hash).toString('hex')
        return {
            verification: web3.utils.soliditySha3(web3.utils.hexToNumber(hash), account),
            validation: web3.utils.sha3(account)
        }
    }

    async function getResultFromPoolFill (pool, fpp) {
        await pool.fill_pool.sendTransaction(...Object.values(fpp))
        const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(fill_success_encode)]})
        return web3.eth.abi.decodeParameters(fill_success_types, logs[0].data)
    }

    async function getAvailability (pool, pool_id, account) {
        return pool.check_availability.call(pool_id, {'from': account})
    }
})

contract("InternalFunctions", () => {
    beforeEach(async () =>{
        internalFunctions = await InternalFunctions.deployed()
    })
    it('unbox()', () =>{})
})
