const BigNumber = require('bignumber.js')
const { soliditySha3, hexToNumber, sha3 } = require('web3-utils')
const chai = require('chai')
const expect = chai.expect
const assert = chai.assert
chai.use(require('chai-as-promised'))
const helper = require('./helper')
const {
    base_timestamp,
    eth_address,
    fill_success_encode,
    fill_success_types,
    swap_success_encode,
    swap_success_types,
    claim_success_encode,
    claim_success_types,
    destruct_success_encode,
    destruct_success_types,
    withdraw_success_encode,
    withdraw_success_types,
    qualification_encode,
    qualification_types,
    erc165_interface_id,
    qualification_interface_id,
    PASSWORD,
    amount,
    ETH_address_index,
    tokenB_address_index,
    tokenC_address_index,
    pending_qualification_timestamp,
} = require('./constants')

const abiCoder = new ethers.utils.AbiCoder()

let fpp // fill happyTokenPoolDeployed parameters
let snapshotId
let testTokenADeployed
let testTokenBDeployed
let testTokenCDeployed
let happyTokenPoolDeployed
let qualificationTesterDeployed
let internalFunctionsDeployed
let creator
let signers

describe('HappyTokenPool', () => {
    before(async () => {
        signers = await ethers.getSigners()
        creator = signers[0]

        const TestTokenA = await ethers.getContractFactory('TestTokenA')
        const TestTokenB = await ethers.getContractFactory('TestTokenB')
        const TestTokenC = await ethers.getContractFactory('TestTokenC')
        const HappyTokenPool = await ethers.getContractFactory('HappyTokenPool')
        const QualificationTester = await ethers.getContractFactory('QLF')

        const testTokenA = await TestTokenA.deploy(amount)
        const testTokenB = await TestTokenB.deploy(amount)
        const testTokenC = await TestTokenC.deploy(amount)
        const happyTokenPool = await HappyTokenPool.deploy()
        const qualificationTester = await QualificationTester.deploy('NeverSayNo', 0)
        const qualificationTester2 = await QualificationTester.deploy('NeverSayYes', pending_qualification_timestamp)

        testTokenADeployed = await testTokenA.deployed()
        testTokenBDeployed = await testTokenB.deployed()
        testTokenCDeployed = await testTokenC.deployed()
        happyTokenPoolDeployed = await happyTokenPool.deployed()
        qualificationTesterDeployed = await qualificationTester.deployed()
        qualificationTesterDeployed2 = await qualificationTester2.deployed()
    })

    beforeEach(async () => {
        snapshotId = await helper.takeSnapshot()
        fpp = {
            hash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(PASSWORD)),
            start_time: 0,
            end_time: 10368000, // duration 120 days
            message: 'Hello From the Outside Hello From the Outside',
            exchange_addrs: [eth_address, testTokenBDeployed.address, testTokenCDeployed.address],
            exchange_ratios: [1, 10000, 1, 2000, 4000, 1],
            lock_time: 12960000, // duration 150 days
            token_address: testTokenADeployed.address,
            total_tokens: BigNumber('1e22').toFixed(),
            limit: BigNumber('1e21').toFixed(),
            qualification: qualificationTesterDeployed.address,
        }
        const nowTimeStamp = Math.floor(new Date().getTime() / 1000);
        assert((base_timestamp + fpp.end_time) > nowTimeStamp, "Need adjust fpp.end_time");
        assert(fpp.lock_time > fpp.start_time, "Need adjust fpp.lock_time");
    })

    afterEach(async () => {
        await helper.revertToSnapShot(snapshotId)
    })

    describe('fill_pool()', async () => {
        it('Should throw error when start time is greater than end time', async () => {
            fpp.start_time = fpp.end_time + 100

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it('Should throw error when limit is greater than total_tokens', async () => {
            fpp.limit = BigNumber('100001e18').toFixed()
            fpp.total_tokens = BigNumber('10000e18').toFixed()

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it('Should throw error when the size of exchange_ratios does not correspond to exchange_addrs', async () => {
            fpp.exchange_ratios = fpp.exchange_ratios.concat([4000, 1])

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it('Should throw error when tokens approved to spend is less than total_tokens', async () => {
            const tokens_approved = BigNumber('1000e18').toFixed()
            fpp.total_tokens = BigNumber('1001e18').toFixed()

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, tokens_approved)

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it('Should throw error when time is larger than 28 bits', async () => {
            fpp.start_time = 2 ** 28 - 1
            fpp.end_time = fpp.start_time + 100

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error)
        })

        it('Should emit fillSuccess event correctly when a happyTokenPoolDeployed is filled', async () => {
            expect(fpp.token_address).that.to.be.eq(testTokenADeployed.address);
            const creatorBalanceBefore = await testTokenADeployed.balanceOf(creator.address);
            const contractBalanceBefore = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)
            await happyTokenPoolDeployed.fill_pool(...Object.values(fpp))
            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(fill_success_encode))],
            })
            const result = abiCoder.decode(fill_success_types, logs[0].data)

            expect(result.total.toString())
                .that.to.be.eq(fpp.total_tokens)
            expect(result).to.have.property('id').that.to.not.be.null
            expect(result).to.have.property('creator').that.to.not.be.null
            expect(result.creation_time.toString()).to.length(10)
            expect(result)
                .to.have.property('token_address')
                .that.to.be.eq(testTokenADeployed.address)
            expect(result.message).to.be.eq(
                'Hello From the Outside Hello From the Outside',
            )
            // TODO: add a new class(balanceChecker???) to get rid of duplicated code
            const creatorBalanceAfter = await testTokenADeployed.balanceOf(creator.address);
            const contractBalanceAfter = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
            expect(creatorBalanceAfter.toString()).to.be.eq(
                BigNumber(creatorBalanceBefore.toString())
                    .minus(BigNumber(fpp.total_tokens))
                    .toFixed(),
            );
            expect(contractBalanceAfter.toString()).to.be.eq(
                BigNumber(contractBalanceBefore.toString())
                    .plus(BigNumber(fpp.total_tokens))
                    .toFixed(),
            );
        })

        it('Should emit fillSuccess event when none of ratio gcd is not equal to 1 and fill token is very small', async () => {
            fpp.exchange_ratios = [2, 7, 3, 2, 3, 11]
            fpp.total_tokens = '1'
            fpp.limit = '1'
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)
            await happyTokenPoolDeployed.fill_pool(...Object.values(fpp))
            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(fill_success_encode))],
            })
            const result = abiCoder.decode(fill_success_types, logs[0].data)
            expect(result).to.have.property('id').that.to.not.be.null
        })
    })

    describe('check_availability()', async () => {
        beforeEach(async () => {
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens)
        })

        it('Should throw error when pool id does not exist', async () => {
            await expect(
                happyTokenPoolDeployed.check_availability('id not exist', { from: signers[1].address }),
            ).to.be.rejectedWith(Error)
        })

        it('Should return status `started === true` when current time greater than start_time', async () => {
            const fakeTime = (new Date().getTime() - 1000 * 10) / 1000
            fpp.start_time = Math.ceil(fakeTime) - base_timestamp
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)

            expect(result.started).to.be.true
        })

        it('Should return status `started === false` when current time less than start_time', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 10) / 1000
            fpp.start_time = Math.ceil(fakeTime) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)

            expect(result.started).to.be.false
        })

        it('Should return status `expired === true` when current time less than end_time', async () => {
            const fakeTime = (new Date().getTime() - 1000 * 10) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)

            expect(result.expired).to.be.true
        })

        it('Should return status `expired === false` when current time less than end_time', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 10) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)

            expect(result.expired).to.be.false
        })

        it('Should return the same exchange_addrs which fill the happyTokenPoolDeployed', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)
            expect(result.exchange_addrs).to.eql([eth_address, testTokenBDeployed.address, testTokenCDeployed.address])
        })

        it('Should return the exchanged_tokens filled with zero when there was no exchange', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)
            expect(result.exchanged_tokens.map(bn => ethers.utils.parseEther(bn.toString()).toString())).to.eql([
                '0',
                '0',
                '0',
            ])
        })

        it('Should return the zero swapped token when the spender did no exchange before', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)
            expect(ethers.utils.parseEther(result.swapped.toString()).toString()).to.be.eq('0')
        })

        it('Should return same number of remaining token as total tokens when there was no exchange', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address)
            expect(result.remaining.toString()).to.be.eq(fpp.total_tokens)
        })

        it('Should minus the number of remaining token by exchange amount after swap', async () => {
            const transfer_amount = BigNumber('1e26').toFixed()
            const approve_amount = BigNumber('5e15').toFixed()
            const signer = signers[1]

            await testTokenBDeployed.connect(creator).transfer(signer.address, transfer_amount)
            await testTokenBDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount)
            // await happyTokenPoolDeployed.connect(signer).test_allowance(testTokenBDeployed.address)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            const { remaining: remaining_before } = await getAvailability(happyTokenPoolDeployed, pool_id, signer.address)
            const { verification, validation } = getVerification(PASSWORD, signer.address)
            happyTokenPoolDeployed
                .connect(signer)
                .swap(pool_id, verification, validation, tokenB_address_index, approve_amount)
            const { remaining: remaining_now } = await getAvailability(happyTokenPoolDeployed, pool_id, creator.address)
            const ratio = fpp.exchange_ratios[3] / fpp.exchange_ratios[2] // tokenA <=> tokenB
            const exchange_tokenA_amount = BigNumber(approve_amount).multipliedBy(ratio)
            expect(remaining_before.sub(remaining_now).toString()).to.be.eq(exchange_tokenA_amount.toString())
        })

        it('Should return remaining token correctly when none of ratio gcd is not equal to 1 and tokens are very small', async () => {
            fpp.exchange_ratios = [2, 7, 3, 2, 3, 11]
            fpp.total_tokens = '10'
            fpp.limit = '10'
            const signer = signers[1]
            fpp.lock_time = 0
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)
            const { remaining: remaining_before } = await getAvailability(happyTokenPoolDeployed, pool_id, signer.address)
            expect(remaining_before.toString()).to.be.eq(fpp.total_tokens)

            const transfer_amount = BigNumber('2').toFixed()
            const approve_amount = BigNumber('2').toFixed()

            await testTokenBDeployed.connect(creator).transfer(signer.address, transfer_amount)
            await testTokenBDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount)
            const { verification, validation } = getVerification(PASSWORD, signer.address)
            happyTokenPoolDeployed
                .connect(signer)
                .swap(pool_id, verification, validation, tokenB_address_index, approve_amount)
            const { remaining: remaining_now } = await getAvailability(happyTokenPoolDeployed, pool_id, signer.address)
            const tokenB_balance = await testTokenBDeployed.balanceOf(signer.address)
            const tokenA_balance = await testTokenADeployed.balanceOf(signer.address)

            expect(tokenA_balance.toString()).to.be.eq('1')
            expect(tokenB_balance.toString()).to.be.eq('0')
            expect(remaining_now.toString()).to.be.eq('9')
        })
    })

    describe('swap()', async () => {
        let verification
        let validation
        let exchange_amount
        before(async () => {
            const transfer_amount = BigNumber('1e26').toFixed()
            await testTokenBDeployed.connect(creator).transfer(signers[2].address, transfer_amount)
            await testTokenCDeployed.connect(creator).transfer(signers[2].address, transfer_amount)
        })

        beforeEach(async () => {
            await testTokenADeployed.connect(creator).approve(happyTokenPoolDeployed.address, BigNumber('1e26').toFixed())
            const r = getVerification(PASSWORD, signers[2].address)
            verification = r.verification
            validation = r.validation
            exchange_amount = BigNumber('1e10').toFixed()
        })

        it('Should throw error when happyTokenPoolDeployed id does not exist', async () => {
            const pool_id = 'id not exist'
            await expect(
                happyTokenPoolDeployed.swap(
                    pool_id,
                    verification,
                    validation,
                    tokenC_address_index,
                    exchange_amount,
                ),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when validation wrong', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            await expect(
                happyTokenPoolDeployed.swap(
                    pool_id,
                    verification,
                    'wrong validation',
                    tokenC_address_index,
                    exchange_amount,
                ),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when happyTokenPoolDeployed is waiting for start', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000
            fpp.start_time = Math.ceil(fakeTime) - base_timestamp
            fpp.end_time = fpp.start_time + 1000 * 1000
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await testTokenCDeployed.connect(creator).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            expect(
                happyTokenPoolDeployed.swap(
                    pool_id,
                    verification,
                    validation,
                    tokenC_address_index,
                    exchange_amount,
                ),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when swapped by a blocked account', async () => {
            fpp.qualification = qualificationTesterDeployed2.address
            const badGuy = signers[9]

            const { verification, validation } = await prepare(badGuy)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            expect(
                happyTokenPoolDeployed
                    .connect(badGuy)
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)

            async function prepare(signer) {
                const transfer_amount = BigNumber('1e26').toFixed()
                await testTokenCDeployed.connect(creator).transfer(signer.address, transfer_amount)
                const approve_amount = BigNumber('1e10').toFixed()
                exchange_amount = approve_amount
                await testTokenCDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount)
                return getVerification(PASSWORD, signer.address)
            }
        })

        it('Should throw error when happyTokenPoolDeployed is expired', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp
            fpp.start_time = fpp.end_time - 10
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await testTokenCDeployed.connect(creator).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when password wrong', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            await expect(
                happyTokenPoolDeployed.swap(
                    pool_id,
                    'wrong password',
                    validation,
                    tokenC_address_index,
                    exchange_amount,
                ),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when "approved amount" less than "exchange amount"', async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = BigNumber('2e10').toFixed()

            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)
        })

        it('Should better not draw water with a sieve', async () => {
            const approve_amount = BigNumber('0').toFixed()
            exchange_amount = BigNumber('0').toFixed()

            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when one account swap more than once', async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount)
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when swap-token-index is invalid', async () => {
            const ratio = 10 ** 10
            fpp.exchange_ratios = [1, ratio]
            fpp.exchange_addrs = [eth_address]
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, 100, exchange_amount),
            ).to.be.rejectedWith(Error)
        })

        it('Should throw error when balance is not enough', async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount

            const pool_owner = signers[2];
            const pool_user = signers[2];
            let tokenCBalance = await testTokenCDeployed.balanceOf(pool_user.address);
            assert.isTrue(tokenCBalance.gt(exchange_amount));

            // Transfer most tokens to another account, only "exchange_amount/2" left
            const leftAmount = ethers.BigNumber.from(exchange_amount).div(2);
            const transferAmount = tokenCBalance.sub(leftAmount);
            await testTokenCDeployed.connect(pool_user).transfer(creator.address, transferAmount)
            tokenCBalance = await testTokenCDeployed.balanceOf(pool_user.address);
            assert.isFalse(tokenCBalance.gt(exchange_amount));

            await testTokenCDeployed.connect(pool_owner).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            expect(
                happyTokenPoolDeployed
                    .connect(pool_user)
                    .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount),
            ).to.be.rejectedWith(Error)

            // Transfer test tokens back
            await testTokenCDeployed.connect(creator).transfer(pool_user.address, transferAmount)

            tokenCBalance = await testTokenCDeployed.balanceOf(pool_user.address);
            assert.isTrue(tokenCBalance.gt(exchange_amount));
        })

        it('Should emit swapSuccess when swap successful', async () => {
            const approve_amount = BigNumber('1e10').toFixed()
            exchange_amount = approve_amount
            const pool_owner = signers[2];
            const pool_user = signers[2];
            await testTokenCDeployed.connect(pool_owner).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
            const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            await happyTokenPoolDeployed
                .connect(pool_user)
                .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount)
                    const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(swap_success_encode))],
            })
            const result = abiCoder.decode(swap_success_types, logs[0].data)
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4] // tokenA <=> tokenC

            const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
            const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(contractTokenCBalanceBeforeSwap.toString())
                    .plus(BigNumber(exchange_amount))
                    .toFixed(),
            );
            expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(userTokenCBalanceBeforeSwap.toString())
                    .minus(BigNumber(exchange_amount))
                    .toFixed(),
            );

            expect(result).to.have.property('id').that.to.not.be.null
            expect(result).to.have.property('swapper').that.to.not.be.null
            expect(result.from_value.toString())
                .that.to.be.eq(String(exchange_amount))
            expect(result.to_value.toString())
                .that.to.be.eq(String(exchange_amount * ratio))
            expect(result)
                .to.have.property('from_address')
                .that.to.be.eq(testTokenCDeployed.address)
            expect(result)
                .to.have.property('to_address')
                .that.to.be.eq(testTokenADeployed.address)
        })

        it('Should swap the maximum number of token equals to limit', async () => {
            approve_amount = BigNumber('5e25').toFixed()
            exchange_amount = approve_amount
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount)
            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(swap_success_encode))],
            })
            const result = abiCoder.decode(swap_success_types, logs[0].data)
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4] // tokenA <=> tokenC

            expect(result.to_value.toString())
                .to.be.eq(fpp.limit)
                .and.to.not.be.eq(String(exchange_amount * ratio))
        })

        it('Should swap various numbers of token', async () => {
            fpp.total_tokens = BigNumber('100e18').toFixed()
            fpp.limit = BigNumber('50e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            // 0.004 ETH => 40 TESTA
            approve_amount = BigNumber('4e15').toFixed()
            exchange_amount = approve_amount
            var vr = getVerification(PASSWORD, signers[4].address)
            await happyTokenPoolDeployed
                .connect(signers[4])
                .swap(pool_id, vr.verification, vr.validation, 0, exchange_amount, {
                    value: approve_amount,
                })
            const logs_eth = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(swap_success_encode))],
            })
            const result_eth = abiCoder.decode(swap_success_types, logs_eth[0].data)
            const ratio_eth = fpp.exchange_ratios[1] / fpp.exchange_ratios[0] // tokenA <=> tokenC
            expect(result_eth.to_value.toString())
                .that.to.be.eq(String(exchange_amount * ratio_eth))

            // 0.02 TESTB => 40 TESTA
            _transfer_amount = BigNumber('1e26').toFixed()
            await testTokenBDeployed.connect(creator).transfer(signers[3].address, _transfer_amount)

            approve_amount = BigNumber('2e16').toFixed()
            exchange_amount = approve_amount
            await testTokenBDeployed.connect(signers[3]).approve(happyTokenPoolDeployed.address, approve_amount)

            var vr = getVerification(PASSWORD, signers[3].address)
            await happyTokenPoolDeployed
                .connect(signers[3])
                .swap(pool_id, vr.verification, vr.validation, 1, exchange_amount)
            const logs_b = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(swap_success_encode))],
            })
            const result_b = abiCoder.decode(swap_success_types, logs_b[0].data)
            const ratio_b = fpp.exchange_ratios[3] / fpp.exchange_ratios[2] // tokenA <=> tokenC

            expect(result_b.to_value.toString())
                .that.to.be.eq(String(exchange_amount * ratio_b))

            // 80000 TESTC => 20 TESTA
            approve_amount = BigNumber('1.6e23').toFixed()
            exchange_amount = approve_amount
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount)

            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, validation, tokenC_address_index, exchange_amount)
            const logs_c = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(swap_success_encode))],
            })
            const result_c = abiCoder.decode(swap_success_types, logs_c[0].data)
            const ratio_c = fpp.exchange_ratios[5] / fpp.exchange_ratios[4] // tokenA <=> tokenC

            expect(result_c.to_value.toString())
                .that.to.not.be.eq(String(exchange_amount * ratio_c))
            expect(result_c.to_value.toString())
                .that.to.not.be.eq(fpp.limit)
            expect(result_c.to_value.toString())
                .that.to.be.eq(BigNumber('2e19').toFixed())
        })

        it('Should swap the remaining token when the amount of swap token is greater than total token', async () => {
            const ratio = 10 ** 10
            fpp.exchange_ratios = [1, ratio]
            fpp.exchange_addrs = [eth_address]
            fpp.limit = BigNumber('10000e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            // first, swap to make total tokens less than limit
            const swapperFirstETH = signers[2].address
            let exchange_ETH_amount = BigNumber('5e11').toFixed()
            const v1 = getVerification(PASSWORD, swapperFirstETH)
            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, v1.verification, v1.validation, ETH_address_index, exchange_ETH_amount, {
                    value: exchange_ETH_amount,
                })

            // then, swap amount greater than total token
            let v2 = getVerification(PASSWORD, signers[3].address)
            const { remaining } = await getAvailability(happyTokenPoolDeployed, pool_id, signers[3].address)
            exchange_ETH_amount = BigNumber('1e12').toFixed()
            await happyTokenPoolDeployed
                .connect(signers[3])
                .swap(pool_id, v2.verification, v2.validation, ETH_address_index, exchange_ETH_amount, {
                    value: exchange_ETH_amount,
                })

            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(swap_success_encode))],
            })
            const { from_value, to_value } = abiCoder.decode(swap_success_types, logs[0].data)

            expect(remaining.toString()).to.be.eq(
                BigNumber('5e11')
                    .times(ratio)
                    .toFixed(),
            )
            expect(from_value.toString())
                .to.be.eq(
                    BigNumber(remaining.toString())
                        .div(ratio)
                        .toFixed(),
                )
                .and.to.not.be.eq(exchange_ETH_amount)
            expect(to_value.toString())
                .to.be.eq(remaining.toString())
                .and.to.not.be.eq(
                    BigNumber(exchange_ETH_amount)
                        .times(ratio)
                        .toFixed(),
                )
        })

        describe('claim()', async () => {
            it('should does no affect when claimable is zero', async () => {
                fpp.lock_time = 0
                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
                //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)
                await happyTokenPoolDeployed.connect(signers[3]).claim([pool_id])
                const logs = await ethers.provider.getLogs({
                    address: happyTokenPoolDeployed.address,
                    topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(claim_success_encode))],
                })
                expect(logs).to.have.length(0)
            })

            it('should emit multiple ClaimSuccess events when claim successfully and set claimable to zero', async () => {
                const pool_user = signers[2];
                const approve_amount = BigNumber('1e10')

                await testTokenBDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount.toFixed())
                await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount.toFixed())

                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
                const { id: pool_id2 } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
                //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, fpp.lock_time)

                const userTokenBBalanceBeforeSwap = await testTokenBDeployed.balanceOf(pool_user.address);
                const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenBBalanceBeforeSwap = await testTokenBDeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

                await happyTokenPoolDeployed
                    .connect(pool_user)
                    .swap(pool_id, verification, validation, tokenC_address_index, approve_amount.toFixed())

                await happyTokenPoolDeployed
                    .connect(pool_user)
                    .swap(pool_id2, verification, validation, tokenB_address_index, approve_amount.toFixed())

                const userTokenABalanceBeforeClaim = await testTokenADeployed.balanceOf(pool_user.address);
                const userTokenBBalanceAfterSwap = await testTokenBDeployed.balanceOf(pool_user.address);
                const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenABalanceBeforeClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenBBalanceAfterSwap = await testTokenBDeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

                expect(contractTokenBBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(contractTokenBBalanceBeforeSwap.toString())
                        .plus(BigNumber(approve_amount))
                        .toFixed(),
                );
                expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(contractTokenCBalanceBeforeSwap.toString())
                        .plus(BigNumber(approve_amount))
                        .toFixed(),
                );
                expect(userTokenBBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(userTokenBBalanceBeforeSwap.toString())
                        .minus(BigNumber(approve_amount))
                        .toFixed(),
                );
                expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(userTokenCBalanceBeforeSwap.toString())
                        .minus(BigNumber(approve_amount))
                        .toFixed(),
                );

                const { swapped: claimablePrevious } = await getAvailability(
                    happyTokenPoolDeployed,
                    pool_id,
                    pool_user.address,
                )

                expect(claimablePrevious.toString())
                    .to.be.eq(approve_amount.div(fpp.exchange_ratios[tokenC_address_index * 2]).toString())
                    .and.to.be.eq('2500000')

                const { swapped: claimablePrevious2 } = await getAvailability(
                    happyTokenPoolDeployed,
                    pool_id2,
                    pool_user.address,
                )

                expect(claimablePrevious2.toString())
                    .to.be.eq(approve_amount.multipliedBy(fpp.exchange_ratios[tokenB_address_index * 2 + 1]).toString())
                    .and.to.be.eq('20000000000000')

                await helper.advanceTimeAndBlock(fpp.lock_time)

                // contains duplicated pool-id and an invalid pool id
                const invalid_pool_id = "0x1234567833dc44ce38f1024d3ea7d861f13ac29112db0e5b9814c54b12345678";
                await happyTokenPoolDeployed.connect(pool_user).claim([pool_id, pool_id2, pool_id2, invalid_pool_id])
                const { swapped: claimableNow } = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user.address)
                const { swapped: claimableNow2 } = await getAvailability(happyTokenPoolDeployed, pool_id2, pool_user.address)
                const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);

                // tokenB ==> tokenA
                const ratio_b = fpp.exchange_ratios[3] / fpp.exchange_ratios[2];
                // tokenC ==> tokenA
                const ratio_c = fpp.exchange_ratios[5] / fpp.exchange_ratios[4];
                const exchangedTokenA = approve_amount*ratio_b + approve_amount*ratio_c;

                expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                    BigNumber(userTokenABalanceBeforeClaim.toString())
                        .plus(BigNumber(exchangedTokenA))
                        .toFixed(),
                );
                expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                    BigNumber(contractTokenABalanceBeforeClaim.toString())
                        .minus(BigNumber(exchangedTokenA))
                        .toFixed(),
                );

                expect(claimableNow.toString())
                    .to.be.eq('0')
                    .and.to.be.not.eq(claimablePrevious.toString())

                expect(claimableNow2.toString())
                    .to.be.eq('0')
                    .and.to.be.not.eq(claimablePrevious2.toString())

                const logs = await ethers.provider.getLogs({
                    address: happyTokenPoolDeployed.address,
                    topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(claim_success_encode))],
                })

                expect(logs).to.have.length(2)

                const result = abiCoder.decode(claim_success_types, logs[0].data)
                const result2 = abiCoder.decode(claim_success_types, logs[1].data)

                expect(result.to_value.toString()).to.be.eq(claimablePrevious.toString())

                expect(result2.to_value.toString()).to.be.eq(claimablePrevious2.toString())
            })

            it('should still be able to claim after destruct pool', async () => {
                const approve_amount = BigNumber('1e10')
                await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount.toFixed())

                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
                //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, fpp.lock_time)
                await happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, approve_amount.toFixed())

                const { swapped: claimablePrevious } = await getAvailability(
                    happyTokenPoolDeployed,
                    pool_id,
                    signers[2].address,
                )

                await helper.advanceTimeAndBlock(fpp.lock_time)

                await happyTokenPoolDeployed.connect(creator).destruct(pool_id)

                await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id])
                const { swapped: claimableNow } = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address)

                expect(claimableNow.toString())
                    .to.be.eq('0')
                    .and.to.be.not.eq(claimablePrevious.toString())

                const logs = await ethers.provider.getLogs({
                    address: happyTokenPoolDeployed.address,
                    topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(claim_success_encode))],
                })
                const result = abiCoder.decode(claim_success_types, logs[0].data)

                expect(result.to_value.toString()).to.be.eq(claimablePrevious.toString())
            })
        })

        describe('setUnlockTime()', async () => {
            it('should setUnlockTime work', async () => {
                const approve_amount = BigNumber('1e10')
                await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount.toFixed())
    
                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
                await happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, validation, tokenC_address_index, approve_amount.toFixed())

                const { swapped: claimablePrevious } = await getAvailability(
                    happyTokenPoolDeployed,
                    pool_id,
                    signers[2].address,
                )

                // should do nothing if pool is locked
                {
                    await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id])
                    const { swapped: claimableNow } = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address)
        
                    expect(claimablePrevious.toString())
                        .to.be.eq(claimableNow.toString())
                        .and.to.be.eq(approve_amount.div(fpp.exchange_ratios[tokenC_address_index * 2]).toString())
                        .and.to.be.eq('2500000')
        
                    const logs = await ethers.provider.getLogs({
                        address: happyTokenPoolDeployed.address,
                        topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(claim_success_encode))],
                    })
        
                    expect(logs).to.have.length(0)
                }
                {
                    // can NOT set to 0
                    expect(happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)).to.be.rejectedWith(Error);
                }
                if (true)
                {
                    // 48 bits integer overflow, expect error
                    const unlock_time = BigNumber('1000000000000', 16);
                    console.log(unlock_time.toFixed());
                    await expect(happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, unlock_time.toFixed())).to.be.rejectedWith(Error);
                }
                const now_in_second = Math.floor(Date.now()/1000);
                const new_unlock_time = now_in_second - base_timestamp;
                {
                    // only the "pool owner" can setUnlockTime
                    const account_not_creator = signers[4];
                    expect(happyTokenPoolDeployed.connect(account_not_creator).setUnlockTime(pool_id, new_unlock_time)).to.be.rejectedWith(Error);
                }
                {
                    await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, new_unlock_time);
                    {
                        const { unlocked: poolUnlocked, unlock_time: poolUnlockTime } = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address)
                        assert.isTrue(poolUnlocked);
                        expect(poolUnlockTime.toString()).and.to.be.eq(now_in_second.toString());
                    }
                    await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id])
                    const { swapped: claimableNow } = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address)
                    expect(claimableNow.toString())
                        .to.be.eq('0')
                        .and.to.be.not.eq(claimablePrevious.toString());

                    const logs = await ethers.provider.getLogs({
                        address: happyTokenPoolDeployed.address,
                        topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(claim_success_encode))],
                    })
                    const result = abiCoder.decode(claim_success_types, logs[0].data)
                    expect(result.to_value.toString()).to.be.eq(claimablePrevious.toString())
                }
            })
        })

        it('should everything work when unlock_time is 0(no lock)', async () => {
            const approve_amount = BigNumber('1e10')
            const pool_owner = signers[2];
            await testTokenCDeployed.connect(pool_owner).approve(happyTokenPoolDeployed.address, approve_amount.toFixed())

            fpp.exchange_ratios = [1, 1, 1, 1, 1, 1];
            fpp.lock_time = 0;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_owner.address);
            const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_owner.address);
            const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
            const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            await happyTokenPoolDeployed
                .connect(pool_owner)
                .swap(pool_id, verification, validation, tokenC_address_index, approve_amount.toFixed())

            const userTokenABalanceAfterSwap = await testTokenADeployed.balanceOf(pool_owner.address);
            const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_owner.address);
            const contractTokenABalanceAfterSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
            const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            // tokens swapped immmediately
            expect(userTokenABalanceAfterSwap.toString()).to.be.eq(
                BigNumber(userTokenABalanceBeforeSwap.toString())
                    .plus(BigNumber(approve_amount))
                    .toFixed(),
            );
            expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(contractTokenCBalanceBeforeSwap.toString())
                    .plus(BigNumber(approve_amount))
                    .toFixed(),
            );
            expect(contractTokenABalanceAfterSwap.toString()).to.be.eq(
                BigNumber(contractTokenABalanceBeforeSwap.toString())
                    .minus(BigNumber(approve_amount))
                    .toFixed(),
            );
            expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(userTokenCBalanceBeforeSwap.toString())
                    .minus(BigNumber(approve_amount))
                    .toFixed(),
            );

            // can not setUnlockTime when pool lock_time is 0
            {
                const now_in_second = Math.floor(Date.now()/1000);
                const new_unlock_time = now_in_second - base_timestamp;
                expect(happyTokenPoolDeployed.connect(pool_owner).setUnlockTime(pool_id, new_unlock_time)).to.be.rejectedWith(Error);
            }
            {
                const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_owner.address);
                const userTokenCBalanceAfterClaim = await testTokenCDeployed.balanceOf(pool_owner.address);
                const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenCBalanceAfterClaim = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);
                await happyTokenPoolDeployed.connect(pool_owner).claim([pool_id])
                assert.isTrue(userTokenABalanceAfterSwap.eq(userTokenABalanceAfterClaim));
                assert.isTrue(userTokenCBalanceAfterSwap.eq(userTokenCBalanceAfterClaim));
                assert.isTrue(contractTokenABalanceAfterSwap.eq(contractTokenABalanceAfterClaim));
                assert.isTrue(contractTokenCBalanceAfterSwap.eq(contractTokenCBalanceAfterSwap));
            }
        })

    })

    describe('destruct()', async () => {
        before(async () => {
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, new BigNumber('1e27').toFixed())
        })

        it("Should throw error when you're not the creator of the happyTokenPoolDeployed", async () => {
            const account_not_creator = signers[4].address
            const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            expect(happyTokenPoolDeployed.connect(account_not_creator).destruct(pool_id)).to.be.rejectedWith(Error)
        })

        it('Should throw error if happyTokenPoolDeployed is not expired', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            expect(happyTokenPoolDeployed.connect(creator).destruct(pool_id)).to.be.rejectedWith(Error)
        })

        it('Should emit DestructSuccess event and withdraw all tokens', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp
            fpp.exchange_ratios = [1, 75000, 1, 100, 1, 100]
            fpp.limit = BigNumber('100000e18').toFixed()
            fpp.total_tokens = BigNumber('1000000e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)
            let previous_eth_balance = await ethers.provider.getBalance(creator.address)
            const previous_tokenB_balance = await testTokenBDeployed.balanceOf(creator.address)
            const previous_tokenC_balance = await testTokenCDeployed.balanceOf(creator.address)

            const exchange_ETH_amount = BigNumber('1.3e18').toFixed()
            const { verification, validation } = getVerification(PASSWORD, signers[2].address)
            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, validation, ETH_address_index, exchange_ETH_amount, {
                    value: exchange_ETH_amount,
                })

            const exchange_tokenB_amount = BigNumber('500e18').toFixed()
            await approveThenSwapToken(testTokenBDeployed, signers[5], tokenB_address_index, pool_id, exchange_tokenB_amount)

            const exchange_tokenC_amount = BigNumber('2000e18').toFixed()
            await approveThenSwapToken(testTokenCDeployed, signers[6], tokenC_address_index, pool_id, exchange_tokenC_amount)

            await helper.advanceTimeAndBlock(2000 * 1000)
            await happyTokenPoolDeployed.connect(creator).destruct(pool_id)

            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(destruct_success_encode))],
            })
            const result = abiCoder.decode(destruct_success_types, logs[0].data)

            expect(result)
                .to.have.property('id')
                .that.to.be.eq(pool_id)
            expect(result)
                .to.have.property('token_address')
                .that.to.be.eq(testTokenADeployed.address)
            expect(result).to.have.property('remaining_tokens')
            expect(result).to.have.property('exchanged_values')

            const ratioETH = fpp.exchange_ratios[1] / fpp.exchange_ratios[0]
            const ratioB = fpp.exchange_ratios[3] / fpp.exchange_ratios[2]
            const remaining_tokens = BigNumber(fpp.total_tokens)
                .minus(
                    BigNumber(ratioB)
                        .times(BigNumber(exchange_tokenB_amount))
                        .plus(BigNumber('100000e18'))
                        .plus(BigNumber(ratioETH).times(BigNumber(exchange_ETH_amount))),
                )
                .toFixed()

            expect(remaining_tokens).to.be.eq(result.remaining_tokens.toString());

            const eth_balance = await ethers.provider.getBalance(creator.address)
            const r = BigNumber(eth_balance.sub(previous_eth_balance).toString())

            expect(r.minus(BigNumber('1e18')).isGreaterThan(0)).to.be.true
            expect(r.minus(BigNumber('1.3e18')).isLessThan(0)).to.be.true

            const transfer_amount = BigNumber('1e26').toFixed()
            const tokenB_balance = await testTokenBDeployed.balanceOf(creator.address)
            expect(tokenB_balance.toString()).to.be.eq(
                BigNumber(previous_tokenB_balance.toString())
                    .minus(BigNumber(transfer_amount))
                    .plus(BigNumber(exchange_tokenB_amount))
                    .toFixed(),
            )

            const tokenC_balance = await testTokenCDeployed.balanceOf(creator.address)
            expect(tokenC_balance.toString()).to.be.not.eq(
                BigNumber(previous_tokenC_balance.toString())
                    .minus(BigNumber(transfer_amount))
                    .plus(BigNumber(exchange_tokenC_amount))
                    .toFixed(),
            )
            expect(tokenC_balance.toString()).to.be.eq(
                BigNumber(previous_tokenC_balance.toString())
                    .minus(BigNumber(transfer_amount))
                    .plus(
                        BigNumber('1000e18'), // 2000e18 exceeds limit
                    )
                    .toFixed(),
            )

            {
                // destruct again, do nothing
                const contractTokenABalanceBeforeDestructAgain = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenBBalanceBeforeDestructAgain = await testTokenBDeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenCBalanceBeforeDestructAgain = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);
                await happyTokenPoolDeployed.connect(creator).destruct(pool_id)
                const contractTokenABalanceAfterDestructAgain = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenBBalanceAfterDestructAgain = await testTokenBDeployed.balanceOf(happyTokenPoolDeployed.address);
                const contractTokenCBalanceAfterDestructAgain = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);
                assert.isTrue(contractTokenABalanceBeforeDestructAgain.eq(contractTokenABalanceAfterDestructAgain));
                assert.isTrue(contractTokenBBalanceBeforeDestructAgain.eq(contractTokenBBalanceAfterDestructAgain));
                assert.isTrue(contractTokenCBalanceBeforeDestructAgain.eq(contractTokenCBalanceAfterDestructAgain));
            }
        })

        it('Should emit DestructSuccess event and withdraw all tokens when remaining_tokens is zero', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp
            fpp.exchange_ratios = [1, 75000, 1, 100, 1, 100]
            fpp.limit = BigNumber('50000e18').toFixed()
            fpp.total_tokens = BigNumber('50000e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            const tokenB_address_index = 1
            const exchange_tokenB_amount = BigNumber('500e18').toFixed()
            await approveThenSwapToken(testTokenBDeployed, signers[3], tokenB_address_index, pool_id, exchange_tokenB_amount)

            await happyTokenPoolDeployed.connect(creator).destruct(pool_id)

            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(destruct_success_encode))],
            })
            const result = abiCoder.decode(destruct_success_types, logs[0].data)

            expect(result)
                .to.have.property('id')
                .that.to.be.eq(pool_id)
            expect(result)
                .to.have.property('token_address')
                .that.to.be.eq(testTokenADeployed.address)
            expect(result.remaining_tokens.toString())
                .that.to.be.eq('0')
            expect(result).to.have.property('exchanged_values')
        })
    })

    describe('withdraw()', async () => {
        beforeEach(async () => {
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, new BigNumber('1e27').toFixed())
        })

        it('Should emit WithdrawSuccess event and withdraw the specified token', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp
            fpp.exchange_ratios = [1, 75000, 1, 100, 1, 100]
            fpp.limit = BigNumber('50000e18').toFixed()
            fpp.total_tokens = BigNumber('50000e18').toFixed()
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp)

            const exchange_ETH_amount = BigNumber('3e14').toFixed()

            const { verification, validation } = getVerification(PASSWORD, signers[2].address)
            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, validation, ETH_address_index, exchange_ETH_amount, {
                    value: exchange_ETH_amount,
                })

            const tokenB_address_index = 1
            const exchange_tokenB_amount = BigNumber('200e18').toFixed()
            await approveThenSwapToken(testTokenBDeployed, signers[3], tokenB_address_index, pool_id, exchange_tokenB_amount)

            // "none-pool owner" can not withdraw
            const account_not_creator = signers[4];
            expect(happyTokenPoolDeployed.connect(account_not_creator).withdraw(pool_id, ETH_address_index)).to.be.rejectedWith(Error);

            await helper.advanceTimeAndBlock(2000 * 1000)
            await happyTokenPoolDeployed.connect(creator).withdraw(pool_id, tokenB_address_index)
            await happyTokenPoolDeployed.connect(creator).withdraw(pool_id, ETH_address_index)

            // can not withdraw again
            expect(happyTokenPoolDeployed.connect(creator).withdraw(pool_id, ETH_address_index)).to.be.rejectedWith(Error);
            expect(happyTokenPoolDeployed.connect(creator).withdraw(pool_id, tokenB_address_index)).to.be.rejectedWith(Error);

            const latestBlock = await ethers.provider.getBlockNumber()
            const logs = await ethers.provider.getLogs({
                address: happyTokenPoolDeployed.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(withdraw_success_encode))],
                fromBlock: latestBlock - 1,
                toBlock: latestBlock,
            })

            const logWithdrawTokenB = abiCoder.decode(withdraw_success_types, logs[0].data)
            const logWithdrawETH = abiCoder.decode(withdraw_success_types, logs[1].data)

            expect(logWithdrawTokenB.withdraw_balance.toString())
                .that.to.be.eq(BigNumber('200e18').toFixed())
            expect(logWithdrawETH.withdraw_balance.toString())
                .that.to.be.eq(BigNumber('3e14').toFixed())
        })
    })

    async function approveThenSwapToken(test_token, swapper, token_address_index, pool_id, exchange_amount) {
        const r = getVerification(PASSWORD, swapper.address)
        verification = r.verification
        validation = r.validation

        const transfer_amount = BigNumber('1e26').toFixed()
        await test_token.transfer(swapper.address, transfer_amount)
        const approve_amount = exchange_amount
        await test_token.connect(swapper).approve(happyTokenPoolDeployed.address, approve_amount)
        await happyTokenPoolDeployed
            .connect(swapper)
            .swap(pool_id, verification, validation, token_address_index, exchange_amount)
    }

    function getVerification(password, account) {
        var hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(password))
        var hash_bytes = Uint8Array.from(Buffer.from(hash.slice(2), 'hex'))
        hash = hash_bytes.slice(0, 5)
        hash = '0x' + Buffer.from(hash).toString('hex')
        return {
            verification: soliditySha3(hexToNumber(hash), account),
            validation: sha3(account),
        }
    }

    async function getResultFromPoolFill(happyTokenPoolDeployed, fpp) {
        await happyTokenPoolDeployed.fill_pool(...Object.values(fpp))
        const logs = await ethers.provider.getLogs({
            address: happyTokenPoolDeployed.address,
            topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(fill_success_encode))],
        })
        return abiCoder.decode(fill_success_types, logs[0].data)
    }

    async function getAvailability(happyTokenPoolDeployed, pool_id, account) {
        const signer = await ethers.getSigner(account)
        happyTokenPoolDeployed = happyTokenPoolDeployed.connect(signer)
        return happyTokenPoolDeployed.check_availability(pool_id)
    }
})

describe('qualification', () => {
    it('should check the integrity of qualification contract', async () => {
        const isERC165 = await qualificationTesterDeployed.supportsInterface(erc165_interface_id)
        const isQualification = await qualificationTesterDeployed.supportsInterface(qualification_interface_id)
        expect(isERC165).to.be.true
        expect(isQualification).to.be.true

        const unknown_interface_id = '0x87ab3aaa'
        const invalid_interface_id = '0xffffffff'
        const isok_1 = await qualificationTesterDeployed.supportsInterface(unknown_interface_id)
        const isok_2 = await qualificationTesterDeployed.supportsInterface(invalid_interface_id)
        expect(isok_1).to.be.false
        expect(isok_2).to.be.false
    })

    describe('logQualified()', () => {
        it('should always return false once swap before start_time', async () => {
            await qualificationTesterDeployed2.connect(signers[10]).logQualified(signers[10].address, pending_qualification_timestamp)
            let result = await getLogResult()
            expect(result).to.be.null

            await helper.advanceTimeAndBlock(pending_qualification_timestamp + 1000)
            await qualificationTesterDeployed2.connect(signers[11]).logQualified(signers[11].address, pending_qualification_timestamp)
            result = await getLogResult()
            expect(result.qualified).to.be.true

            await qualificationTesterDeployed2.connect(signers[10]).logQualified(signers[10].address, pending_qualification_timestamp)
            result = await getLogResult()
            expect(result).to.be.null
        })

        async function getLogResult() {
            const logs = await ethers.provider.getLogs({
                address: qualificationTesterDeployed2.address,
                topics: [ethers.utils.keccak256(ethers.utils.toUtf8Bytes(qualification_encode))],
            })
            if (logs.length === 0) return null
            return abiCoder.decode(qualification_types, logs[0].data)
        }
    })
})