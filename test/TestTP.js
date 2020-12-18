const BigNumber = require('bignumber.js')
const chai = require('chai')
const sinon = require('sinon')
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
const PASSWORD = "password"
let internalFunctions
let test_tokenA
let test_tokenB
let test_tokenC
let pool
let fpp // fill pool parameters

contract("HappyTokenPool", accounts => {
    beforeEach(async () =>{
        test_tokenA = await TestTokenA.deployed()
        test_tokenB = await TestTokenB.deployed()
        test_tokenC = await TestTokenC.deployed()

        pool = await HappyTokenPool.deployed()
        fpp = {
            hash: web3.utils.sha3(PASSWORD),
            start_time: 0,
            end_time: 2592000, // duration 30 days
            poor_name: "Cache Miss",
            message: "Hello From the Outside",
            exchange_addrs: [eth_address, test_tokenB.address, test_tokenC.address],            
            exchange_ratios: [10000, 1, 1, 2000, 4000, 1],
            token_address: test_tokenA.address,
            total_tokens: BigNumber('10000e18').toFixed(),
            limit: BigNumber('1000e18').toFixed()
        }        
    })

    it("Should return the HappyTokenPool contract creator", async () => {
        const contract_creator = await pool.contract_creator.call()
        expect(contract_creator).to.be.eq(accounts[0])
    })    

    describe("fill_pool", async () => {
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

    describe("check_availability", async () => {
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
        
        it("Should return the zero claimed token when the spender did no exchange before", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])
            expect(web3.utils.fromWei(result.claimed)).to.be.eq('0')
        })    
        
        it("Should return same number of remaining token as total tokens when there was no exchange", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const result = await getAvailability(pool, pool_id, accounts[1])
            expect(web3.utils.fromWei(result.remaining, 'wei')).to.be.eq(fpp.total_tokens)
        })

        it("Should minus the number of remaining token by exchange amount after claim", async () => {
            const transfer_amount = BigNumber('1e26').toFixed()
            const approve_amount = BigNumber('2e21').toFixed()            
            const account = accounts[1]
            const token_address_index = 1 // tokenB

            await test_tokenB.transfer.sendTransaction(account, transfer_amount)     
            await test_tokenB.approve.sendTransaction(pool.address, approve_amount, { 'from': account })             
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            const { remaining: remaining_before } = await getAvailability(pool, pool_id, account)
            const { verification, validation } = getVerification(PASSWORD, account)
            pool.claim.sendTransaction(pool_id, verification, account, validation, token_address_index, approve_amount, {'from': account})
            const { remaining: remaining_now } = await getAvailability(pool, pool_id, account)
            const ratio = fpp.exchange_ratios[2] / fpp.exchange_ratios[3] // tokenA <=> tokenB
            const exchange_tokenA_amount = weiToEther(approve_amount) * ratio
            expect(weiToEther(remaining_before) - weiToEther(remaining_now)).to.be.eq(exchange_tokenA_amount)
        })
    })

    describe("claim", async () => {        
        const transfer_amount = BigNumber('1e26').toFixed()
        const approve_amount = BigNumber('25e21').toFixed()         
        const account = accounts[3]     
        const token_address_index = 2 // tokenC
        let verification
        let validation

        before(async () => {
            await test_tokenC.transfer.sendTransaction(account, transfer_amount)   
        })
   
        beforeEach(async () => {            
            await test_tokenA.approve.sendTransaction(pool.address, fpp.total_tokens, {'from': accounts[0]}) 
            await test_tokenC.approve.sendTransaction(pool.address, approve_amount, { 'from': account })
            const r = getVerification(PASSWORD, account)    
            verification = r.verification
            validation = r.validation                                           
        })

        it("Should claim successful", async () => {
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            await pool.claim.sendTransaction(pool_id, verification, account, validation, token_address_index, approve_amount, {'from': account})
        })
        
        it("Should throw error when pool id does not exist", async () => {
            const pool_id = "id not exist" 
            await expect(
                pool.claim.sendTransaction(pool_id, verification, account, validation, token_address_index, approve_amount, {'from': account})
            ).to.be.rejectedWith(Error)
        })

        it("Should throw error when pool is waiting for start", async () => {
            this.clock = sinon.useFakeTimers(new Date().getTime() + 1000 * 10)
            fpp.start_time = Math.ceil(this.clock.now / 1000) - base_timestamp
            fpp.end_time = fpp.start_time + 1000 * 10
            const { id: pool_id } = await getResultFromPoolFill(pool, fpp)
            await expect(
                pool.claim.sendTransaction(pool_id, verification, account, validation, token_address_index, approve_amount, {'from': account})
            ).to.be.rejectedWith(Error)
            this.clock.restore()
        })   
    })

    // it("Should allow one to exchange 2000 tokenB for 1 token A.", async () => {
    //     var amount = BigNumber('1e26').toFixed()
    //     await test_tokenB.approve.sendTransaction(accounts[1], amount)
    //     await test_tokenB.transfer.sendTransaction(accounts[1], amount)
    //     amount = BigNumber('2e21').toFixed()
    //     const validation = web3.utils.sha3(accounts[1])
    //     var previous_total = await pool.check_availability.call(pool_id, {'from': accounts[1]})
    //     previous_total = BigNumber(previous_total[1])
    //     await test_tokenB.approve.sendTransaction(pool.address, amount, {'from': accounts[1]})
    //     const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[1], validation, 1, amount, {'from': accounts[1]})

    //     const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)"
    //     const claim_success_types = ['bytes32', 'address', 'uint256', 'address']
    //     const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]})
    //     var balance1 = await test_tokenA.balanceOf.call(accounts[1])
    //     balance1 = BigNumber(balance1).toFixed()
    //     assert.equal(balance1, BigNumber('1e18').toFixed())
    //     var remaining = await pool.check_availability.call(pool_id, {'from': accounts[1]})
    //     assert.equal(BigNumber(remaining[1]).toFixed(), BigNumber(previous_total - BigNumber(remaining[4])).toFixed())
    // })
    // it("Should allow one to exchange 0.1222222 tokenC for 488.8888 token A.", async () => {
    //     var amount = BigNumber('1e26').toFixed()
    //     await test_tokenC.approve.sendTransaction(accounts[2], amount)
    //     await test_tokenC.transfer.sendTransaction(accounts[2], amount)
    //     amount = BigNumber('1.222222e17').toFixed()
    //     const validation = web3.utils.sha3(accounts[2])
    //     var previous_total = await pool.check_availability.call(pool_id, {'from': accounts[2]})
    //     previous_total = BigNumber(previous_total[1])
    //     await test_tokenC.approve.sendTransaction(pool.address, amount, {'from': accounts[2]})
    //     const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[2], validation, 2, amount, {'from': accounts[2]})

    //     const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)"
    //     const claim_success_types = ['bytes32', 'address', 'uint256', 'address']
    //     const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]})
    //     var balance2 = await test_tokenA.balanceOf.call(accounts[2])
    //     balance2 = BigNumber(balance2).toFixed()
    //     assert.equal(balance2, BigNumber('4.888888e20').toFixed())
    //     var remaining = await pool.check_availability.call(pool_id, {'from': accounts[2]})
    //     assert.equal(BigNumber(remaining[1]).toFixed(), BigNumber(previous_total - BigNumber(remaining[4])).toFixed())
    // })
    // it("Should allow one to exchange 0.1 eth for 1000 token A.", async () => {
    //     const amount = BigNumber('1e17').toFixed()
    //     const validation = web3.utils.sha3(accounts[3])
    //     var previous_total = await pool.check_availability.call(pool_id, {'from': accounts[3]})
    //     previous_total = BigNumber(previous_total[1])
    //     const claim_receipt = await pool.claim.sendTransaction(pool_id, "1", accounts[3], validation, 0, amount, {'from': accounts[3], 'value': amount})

    //     const claim_success_encode = "ClaimSuccess(bytes32,address,uint256,address)"
    //     const claim_success_types = ['bytes32', 'address', 'uint256', 'address']
    //     const logs = await web3.eth.getPastLogs({address: pool.address, topics: [web3.utils.sha3(claim_success_encode)]})
    //     var balance3 = await test_tokenA.balanceOf.call(accounts[3])
    //     balance3 = BigNumber(balance3).toFixed()
    //     assert.notEqual(balance3, BigNumber('1e22').toFixed())
    //     assert.equal(balance3, BigNumber('1e21').toFixed())
    //     var remaining = await pool.check_availability.call(pool_id, {'from': accounts[3]})
    //     assert.equal(BigNumber(remaining[1]).toFixed(), BigNumber(previous_total - BigNumber(remaining[4])).toFixed())
    // })
    // it("Should allow the pool creator to destruct the pool and withdraw the corresponding tokens.", async () => {
    //     var previous_eth_balance = await web3.eth.getBalance(accounts[0])
    //     previous_eth_balance = BigNumber(previous_eth_balance)
    //     const stats = await pool.check_availability.call(pool_id, {'from': accounts[0]})
    //     assert.equal(stats[2], false)
    //     assert.equal(stats[3], 0)
    //     assert.equal(BigNumber(stats[5][0]).toFixed(), BigNumber('1e17').toFixed())
    //     assert.equal(BigNumber(stats[5][1]).toFixed(), BigNumber('2e21').toFixed())
    //     assert.equal(BigNumber(stats[5][2]).toFixed(), BigNumber('1.222222e17').toFixed())

    //     const destruct_receipt = await pool.destruct.sendTransaction(pool_id, {'from': accounts[0]})
    //     var balance1 = await web3.eth.getBalance(accounts[0])
    //     assert.isAbove((BigNumber(balance1) - previous_eth_balance) / BigNumber('1e16'), 9.5)
    //     var balance2 = await test_tokenB.balanceOf.call(accounts[0])
    //     assert.equal(BigNumber(balance2).toFixed(), BigNumber('2e21').toFixed())
    //     var balance3 = await test_tokenC.balanceOf.call(accounts[0])
    //     assert.equal(BigNumber(balance3).toFixed(), BigNumber('1.222222e17').toFixed())

    // })
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
