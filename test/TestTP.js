const BigNumber = require('bignumber.js');
const { soliditySha3, hexToNumber, sha3 } = require('web3-utils');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
chai.use(require('chai-as-promised'));
const helper = require('./helper');
const {
    base_timestamp,
    eth_address,
    erc165_interface_id,
    qualification_interface_id,
    PASSWORD,
    amount,
    ETH_address_index,
    tokenB_address_index,
    tokenC_address_index,
    pending_qualification_timestamp,
} = require('./constants');

const itoJsonABI = require('../artifacts/contracts/ito.sol/HappyTokenPool.json');
const itoInterface = new ethers.utils.Interface(itoJsonABI.abi);

const itoJsonABI_V1_0 = require('../artifacts/contracts/ito_v1.0.sol/HappyTokenPool_v1_0.json');
const itoInterface_V1_0 = new ethers.utils.Interface(itoJsonABI_V1_0.abi);

const proxyAdminABI = require('@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json');

const qualificationJsonABI = require('../artifacts/contracts/qualification.sol/QLF.json');
const qualificationInterface = new ethers.utils.Interface(qualificationJsonABI.abi);

let fpp; // fill happyTokenPoolDeployed parameters
let snapshotId;
let testTokenADeployed;
let testTokenBDeployed;
let testTokenCDeployed;

let HappyTokenPool;
let happyTokenPoolDeployed;
let qualificationTesterDeployed;
let HappyTokenPoolProxy;

let signers;
let creator;
let ito_user;

describe('HappyTokenPool', () => {
    before(async () => {
        signers = await ethers.getSigners();
        creator = signers[0];
        ito_user = signers[1];

        const TestTokenA = await ethers.getContractFactory('TestTokenA');
        const TestTokenB = await ethers.getContractFactory('TestTokenB');
        const TestTokenC = await ethers.getContractFactory('TestTokenC');
        const QualificationTester = await ethers.getContractFactory('QLF');

        const testTokenA = await TestTokenA.deploy(amount);
        const testTokenB = await TestTokenB.deploy(amount);
        const testTokenC = await TestTokenC.deploy(amount);
        const qualificationTester = await QualificationTester.deploy(0);
        const qualificationTester2 = await QualificationTester.deploy(pending_qualification_timestamp);

        testTokenADeployed = await testTokenA.deployed();
        testTokenBDeployed = await testTokenB.deployed();
        testTokenCDeployed = await testTokenC.deployed();
        qualificationTesterDeployed = await qualificationTester.deployed();
        qualificationTesterDeployed2 = await qualificationTester2.deployed();

        HappyTokenPool = await ethers.getContractFactory('HappyTokenPool');
        HappyTokenPoolProxy = await upgrades.deployProxy(HappyTokenPool, [base_timestamp]);
        happyTokenPoolDeployed = new ethers.Contract(HappyTokenPoolProxy.address, itoJsonABI.abi, creator);
    });

    beforeEach(async () => {
        snapshotId = await helper.takeSnapshot();
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
        };
        const nowTimeStamp = Math.floor(new Date().getTime() / 1000);
        // 120 days
        fpp.end_time = nowTimeStamp + 10368000 - base_timestamp;
        // 120 days
        fpp.lock_time = nowTimeStamp + 12960000 - base_timestamp;
    });

    afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
    });

    describe('constructor()', async () => {
        it('Should variables be initalized properly', async () => {
            const base_time = await happyTokenPoolDeployed.base_time();
            expect(base_time.toString()).that.to.be.eq(base_timestamp.toString());
        });
    });

    describe('fill_pool()', async () => {
        it('Should throw error when start time is greater than end time', async () => {
            fpp.start_time = fpp.end_time + 100;

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error);
        });

        it('Should throw error when limit is greater than total_tokens', async () => {
            fpp.limit = BigNumber('100001e18').toFixed();
            fpp.total_tokens = BigNumber('10000e18').toFixed();

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error);
        });

        it('Should throw error when the size of exchange_ratios does not correspond to exchange_addrs', async () => {
            fpp.exchange_ratios = fpp.exchange_ratios.concat([4000, 1]);

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error);
        });

        it('Should throw error when tokens approved to spend is less than total_tokens', async () => {
            const tokens_approved = BigNumber('1000e18').toFixed();
            fpp.total_tokens = BigNumber('1001e18').toFixed();

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, tokens_approved);

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error);
        });

        it('Should throw error when time is larger than 28 bits', async () => {
            fpp.start_time = 2 ** 28 - 1;
            fpp.end_time = fpp.start_time + 100;

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);

            await expect(happyTokenPoolDeployed.fill_pool(...Object.values(fpp))).to.be.rejectedWith(Error);
        });

        it('Should emit fillSuccess event correctly when a happyTokenPoolDeployed is filled', async () => {
            expect(fpp.token_address).that.to.be.eq(testTokenADeployed.address);
            const creatorBalanceBefore = await testTokenADeployed.balanceOf(creator.address);
            const contractBalanceBefore = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);

            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);
            await happyTokenPoolDeployed.fill_pool(...Object.values(fpp));
            {
                // filter with signature, should work
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result = parsedLog.args;
                expect(result.total.toString()).that.to.be.eq(fpp.total_tokens);
            }
            {
                // filtered with user's address(not creator), should not get anything
                const logs = await ethers.provider.getLogs(
                    happyTokenPoolDeployed.filters.FillSuccess(ito_user.address),
                );
                expect(logs.length).that.to.be.eq(0);
            }

            // filter with *indexed creator*, should work as expected
            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess(creator.address));
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;
            expect(result.total.toString()).that.to.be.eq(fpp.total_tokens);
            expect(result).to.have.property('id').that.to.not.be.null;
            expect(result).to.have.property('creator').that.to.not.be.null;
            expect(result.creation_time.toString()).to.length(10);
            expect(result).to.have.property('token_address').that.to.be.eq(testTokenADeployed.address);
            expect(result.message).to.be.eq('Hello From the Outside Hello From the Outside');
            // TODO: add a new class(balanceChecker???) to get rid of duplicated code
            const creatorBalanceAfter = await testTokenADeployed.balanceOf(creator.address);
            const contractBalanceAfter = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
            expect(creatorBalanceAfter.toString()).to.be.eq(
                BigNumber(creatorBalanceBefore.toString()).minus(BigNumber(fpp.total_tokens)).toFixed(),
            );
            expect(contractBalanceAfter.toString()).to.be.eq(
                BigNumber(contractBalanceBefore.toString()).plus(BigNumber(fpp.total_tokens)).toFixed(),
            );
        });

        it('Should emit fillSuccess event when none of ratio gcd is not equal to 1 and fill token is very small', async () => {
            fpp.exchange_ratios = [2, 7, 3, 2, 3, 11];
            fpp.total_tokens = '1';
            fpp.limit = '1';
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);
            await happyTokenPoolDeployed.fill_pool(...Object.values(fpp));
            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;
            expect(result).to.have.property('id').that.to.not.be.null;
        });
    });

    describe('check_availability()', async () => {
        beforeEach(async () => {
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, fpp.total_tokens);
        });

        it('Should throw error when pool id does not exist', async () => {
            await expect(
                happyTokenPoolDeployed.check_availability('id not exist', { from: signers[1].address }),
            ).to.be.rejectedWith(Error);
        });

        it('Should return status `started === true` when current time greater than start_time', async () => {
            const fakeTime = (new Date().getTime() - 1000 * 10) / 1000;
            fpp.start_time = Math.ceil(fakeTime) - base_timestamp;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);

            expect(result.started).to.be.true;
        });

        it('Should return status `started === false` when current time less than start_time', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 10) / 1000;
            fpp.start_time = Math.ceil(fakeTime) - base_timestamp;

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);

            expect(result.started).to.be.false;
        });

        it('Should return status `expired === true` when current time less than end_time', async () => {
            const fakeTime = (new Date().getTime() - 1000 * 10) / 1000;
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp;

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);

            expect(result.expired).to.be.true;
        });

        it('Should return status `expired === false` when current time less than end_time', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 10) / 1000;
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp;

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);

            expect(result.expired).to.be.false;
        });

        it('Should return the same exchange_addrs which fill the happyTokenPoolDeployed', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);
            expect(result.exchange_addrs).to.eql([eth_address, testTokenBDeployed.address, testTokenCDeployed.address]);
        });

        it('Should return the exchanged_tokens filled with zero when there was no exchange', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);
            expect(result.exchanged_tokens.map((bn) => ethers.utils.parseEther(bn.toString()).toString())).to.eql([
                '0',
                '0',
                '0',
            ]);
        });

        it('Should return the zero swapped token when the spender did no exchange before', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);
            expect(ethers.utils.parseEther(result.swapped.toString()).toString()).to.be.eq('0');
        });

        it('Should return same number of remaining token as total tokens when there was no exchange', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);
            expect(result.remaining.toString()).to.be.eq(fpp.total_tokens);
        });

        it('Should minus the number of remaining token by exchange amount after swap', async () => {
            const transfer_amount = BigNumber('1e26').toFixed();
            const approve_amount = BigNumber('5e15').toFixed();
            const signer = signers[1];

            await testTokenBDeployed.connect(creator).transfer(signer.address, transfer_amount);
            await testTokenBDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount);
            // await happyTokenPoolDeployed.connect(signer).test_allowance(testTokenBDeployed.address)
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            const availability_before = await getAvailability(happyTokenPoolDeployed, pool_id, signer.address);
            expect(availability_before.claimed).to.be.eq(false);
            const { verification, validation } = getVerification(PASSWORD, signer.address);
            await happyTokenPoolDeployed
                .connect(signer)
                .swap(pool_id, verification, tokenB_address_index, approve_amount, [pool_id]);
            const availability_current = await getAvailability(happyTokenPoolDeployed, pool_id, creator.address);
            const ratio = fpp.exchange_ratios[3] / fpp.exchange_ratios[2]; // tokenA <=> tokenB
            const exchange_tokenA_amount = BigNumber(approve_amount).multipliedBy(ratio);
            expect(availability_before.remaining.sub(availability_current.remaining).toString()).to.be.eq(
                exchange_tokenA_amount.toString(),
            );
            expect(availability_current.claimed).to.be.eq(false);

            expect(availability_current.start_time.toString()).to.be.eq((fpp.start_time + base_timestamp).toString());
            expect(availability_current.end_time.toString()).to.be.eq((fpp.end_time + base_timestamp).toString());
            expect(availability_current.unlock_time.toString()).to.be.eq((fpp.lock_time + base_timestamp).toString());
            expect(availability_current.qualification_addr).to.be.eq(fpp.qualification);
        });

        it('Should return remaining token correctly when none of ratio gcd is not equal to 1 and tokens are very small', async () => {
            fpp.exchange_ratios = [2, 7, 3, 2, 3, 11];
            fpp.total_tokens = '10';
            fpp.limit = '10';
            const signer = signers[1];
            fpp.lock_time = 0;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)
            const result_before = await getAvailability(happyTokenPoolDeployed, pool_id, signer.address);
            expect(result_before.remaining.toString()).to.be.eq(fpp.total_tokens);
            expect(result_before.claimed).to.be.eq(false);

            const transfer_amount = BigNumber('2').toFixed();
            const approve_amount = BigNumber('2').toFixed();

            await testTokenBDeployed.connect(creator).transfer(signer.address, transfer_amount);
            await testTokenBDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount);
            const { verification, validation } = getVerification(PASSWORD, signer.address);
            await happyTokenPoolDeployed
                .connect(signer)
                .swap(pool_id, verification, tokenB_address_index, approve_amount, [pool_id]);
            const result_now = await getAvailability(happyTokenPoolDeployed, pool_id, signer.address);
            const tokenB_balance = await testTokenBDeployed.balanceOf(signer.address);
            const tokenA_balance = await testTokenADeployed.balanceOf(signer.address);

            expect(tokenA_balance.toString()).to.be.eq('1');
            expect(tokenB_balance.toString()).to.be.eq('0');
            expect(result_now.remaining.toString()).to.be.eq('9');
            expect(result_now.claimed).to.be.eq(true);
        });
    });

    describe('swap()', async () => {
        let verification;
        let validation;
        let exchange_amount;
        before(async () => {
            const transfer_amount = BigNumber('1e26').toFixed();
            await testTokenBDeployed.connect(creator).transfer(signers[2].address, transfer_amount);
            await testTokenCDeployed.connect(creator).transfer(signers[2].address, transfer_amount);
        });

        beforeEach(async () => {
            await testTokenADeployed
                .connect(creator)
                .approve(happyTokenPoolDeployed.address, BigNumber('1e26').toFixed());
            const r = getVerification(PASSWORD, signers[2].address);
            verification = r.verification;
            validation = r.validation;
            exchange_amount = BigNumber('1e10').toFixed();
        });

        it('Should throw error when happyTokenPoolDeployed id does not exist', async () => {
            const pool_id = 'id not exist';
            await expect(
                happyTokenPoolDeployed.swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when happyTokenPoolDeployed is waiting for start', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
            fpp.start_time = Math.ceil(fakeTime) - base_timestamp;
            fpp.end_time = fpp.start_time + 1000 * 1000;
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            await testTokenCDeployed.connect(creator).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            expect(
                happyTokenPoolDeployed.swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when swapped by a blocked account', async () => {
            fpp.qualification = qualificationTesterDeployed2.address;
            const badGuy = signers[9];

            const { verification, validation } = await prepare(badGuy);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            expect(
                happyTokenPoolDeployed
                    .connect(badGuy)
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);

            async function prepare(signer) {
                const transfer_amount = BigNumber('1e26').toFixed();
                await testTokenCDeployed.connect(creator).transfer(signer.address, transfer_amount);
                const approve_amount = BigNumber('1e10').toFixed();
                exchange_amount = approve_amount;
                await testTokenCDeployed.connect(signer).approve(happyTokenPoolDeployed.address, approve_amount);
                return getVerification(PASSWORD, signer.address);
            }
        });

        it('Should throw error when happyTokenPoolDeployed is expired', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000;
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp;
            fpp.start_time = fpp.end_time - 10;
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            await testTokenCDeployed.connect(creator).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when password wrong', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            await expect(
                happyTokenPoolDeployed.swap(pool_id, 'wrong password', tokenC_address_index, exchange_amount, [
                    pool_id,
                ]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when "approved amount" less than "exchange amount"', async () => {
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = BigNumber('2e10').toFixed();

            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should better not draw water with a sieve', async () => {
            const approve_amount = BigNumber('0').toFixed();
            exchange_amount = BigNumber('0').toFixed();

            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when one account swap more than once', async () => {
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when swap-token-index is invalid', async () => {
            const ratio = 10 ** 10;
            fpp.exchange_ratios = [1, ratio];
            fpp.exchange_addrs = [eth_address];
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            expect(
                happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
            expect(
                happyTokenPoolDeployed.connect(signers[2]).swap(pool_id, verification, 100, exchange_amount, [pool_id]),
            ).to.be.rejectedWith(Error);
        });

        it('Should throw error when ratio is not valid', async () => {
            // slightly smaller than 128 bits unsigned integer
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            {
                // 128 bits integer overflow
                const tokenCRatio = BigNumber('1e38').toFixed();
                fpp.exchange_ratios = [1, 75000, 1, 100, 1, tokenCRatio];
                await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);
                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
                expect(
                    happyTokenPoolDeployed
                        .connect(signers[2])
                        .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
                ).to.be.rejectedWith(Error);
            }
        });

        it('Should throw error when balance is not enough', async () => {
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;

            const pool_user = signers[2];
            let tokenCBalance = await testTokenCDeployed.balanceOf(pool_user.address);
            assert.isTrue(tokenCBalance.gt(exchange_amount));

            // Transfer most tokens to another account, only "exchange_amount/2" left
            const leftAmount = ethers.BigNumber.from(exchange_amount).div(2);
            const transferAmount = tokenCBalance.sub(leftAmount);
            await testTokenCDeployed.connect(pool_user).transfer(creator.address, transferAmount);
            tokenCBalance = await testTokenCDeployed.balanceOf(pool_user.address);
            assert.isFalse(tokenCBalance.gt(exchange_amount));

            await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            await expect(
                happyTokenPoolDeployed
                    .connect(pool_user)
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]),
            ).to.be.rejectedWith('ERC20: transfer amount exceeds balance');

            // Transfer test tokens back
            await testTokenCDeployed.connect(creator).transfer(pool_user.address, transferAmount);

            tokenCBalance = await testTokenCDeployed.balanceOf(pool_user.address);
            assert.isTrue(tokenCBalance.gt(exchange_amount));
        });

        it('Should emit swapSuccess when swap successful', async () => {
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            const pool_user = signers[2];
            await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
            const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            await happyTokenPoolDeployed
                .connect(pool_user)
                .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC

            const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
            const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(exchange_amount)).toFixed(),
            );
            expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
            );

            expect(result).to.have.property('id').that.to.not.be.null;
            expect(result).to.have.property('swapper').that.to.not.be.null;
            expect(result.from_value.toString()).that.to.be.eq(String(exchange_amount));
            expect(result.to_value.toString()).that.to.be.eq(String(exchange_amount * ratio));
            expect(result).to.have.property('from_address').that.to.be.eq(testTokenCDeployed.address);
            expect(result).to.have.property('to_address').that.to.be.eq(testTokenADeployed.address);
            expect(result).to.have.property('claimed').that.to.be.eq(false);
        });

        it('Should swap the maximum number of token equals to limit', async () => {
            approve_amount = BigNumber('5e25').toFixed();
            exchange_amount = approve_amount;
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC

            expect(result.to_value.toString())
                .to.be.eq(fpp.limit)
                .and.to.not.be.eq(String(exchange_amount * ratio));
        });

        it('Should swap various numbers of token', async () => {
            fpp.total_tokens = BigNumber('100e18').toFixed();
            fpp.limit = BigNumber('50e18').toFixed();
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            // 0.004 ETH => 40 TESTA
            approve_amount = BigNumber('4e15').toFixed();
            exchange_amount = approve_amount;
            var vr = getVerification(PASSWORD, signers[4].address);
            await happyTokenPoolDeployed
                .connect(signers[4])
                .swap(pool_id, vr.verification, 0, exchange_amount, [pool_id], {
                    value: approve_amount,
                });

            {
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result_eth = parsedLog.args;
                const ratio_eth = fpp.exchange_ratios[1] / fpp.exchange_ratios[0]; // tokenA <=> tokenC
                expect(result_eth.to_value.toString()).that.to.be.eq(String(exchange_amount * ratio_eth));
            }

            // 0.02 TESTB => 40 TESTA
            _transfer_amount = BigNumber('1e26').toFixed();
            await testTokenBDeployed.connect(creator).transfer(signers[3].address, _transfer_amount);

            approve_amount = BigNumber('2e16').toFixed();
            exchange_amount = approve_amount;
            await testTokenBDeployed.connect(signers[3]).approve(happyTokenPoolDeployed.address, approve_amount);

            var vr = getVerification(PASSWORD, signers[3].address);
            await happyTokenPoolDeployed
                .connect(signers[3])
                .swap(pool_id, vr.verification, 1, exchange_amount, [pool_id]);

            {
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result_b = parsedLog.args;
                const ratio_b = fpp.exchange_ratios[3] / fpp.exchange_ratios[2]; // tokenA <=> tokenC

                expect(result_b.to_value.toString()).that.to.be.eq(String(exchange_amount * ratio_b));
            }

            // 80000 TESTC => 20 TESTA
            approve_amount = BigNumber('1.6e23').toFixed();
            exchange_amount = approve_amount;
            await testTokenCDeployed.connect(signers[2]).approve(happyTokenPoolDeployed.address, approve_amount);

            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);

            {
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result_c = parsedLog.args;

                const ratio_c = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC

                expect(result_c.to_value.toString()).that.to.not.be.eq(String(exchange_amount * ratio_c));
                expect(result_c.to_value.toString()).that.to.not.be.eq(fpp.limit);
                expect(result_c.to_value.toString()).that.to.be.eq(BigNumber('2e19').toFixed());
            }
        });

        it('Should swap the remaining token when the amount of swap token is greater than total token', async () => {
            const ratio = 10 ** 10;
            fpp.exchange_ratios = [1, ratio];
            fpp.exchange_addrs = [eth_address];
            fpp.limit = BigNumber('10000e18').toFixed();
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            // first, swap to make total tokens less than limit
            const swapperFirstETH = signers[2].address;
            let exchange_ETH_amount = BigNumber('5e11').toFixed();
            const v1 = getVerification(PASSWORD, swapperFirstETH);
            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, v1.verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
                    value: exchange_ETH_amount,
                });

            // then, swap amount greater than total token
            let v2 = getVerification(PASSWORD, signers[3].address);
            const { remaining } = await getAvailability(happyTokenPoolDeployed, pool_id, signers[3].address);
            exchange_ETH_amount = BigNumber('1e12').toFixed();
            await happyTokenPoolDeployed
                .connect(signers[3])
                .swap(pool_id, v2.verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
                    value: exchange_ETH_amount,
                });

            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;
            const from_value = result.from_value;
            const to_value = result.to_value;

            expect(remaining.toString()).to.be.eq(BigNumber('5e11').times(ratio).toFixed());
            expect(from_value.toString())
                .to.be.eq(BigNumber(remaining.toString()).div(ratio).toFixed())
                .and.to.not.be.eq(exchange_ETH_amount);
            expect(to_value.toString())
                .to.be.eq(remaining.toString())
                .and.to.not.be.eq(BigNumber(exchange_ETH_amount).times(ratio).toFixed());
        });

        describe('claim()', async () => {
            it('should does no affect when claimable is zero', async () => {
                fpp.lock_time = 0;
                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
                //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)
                await happyTokenPoolDeployed.connect(signers[3]).claim([pool_id]);
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
                expect(logs).to.have.length(0);
            });

            it('should emit multiple ClaimSuccess events when claim successfully and set claimable to zero', async () => {
                const pool_user = signers[2];
                const approve_amount = BigNumber('1e10');

                await testTokenBDeployed
                    .connect(pool_user)
                    .approve(happyTokenPoolDeployed.address, approve_amount.toFixed());
                await testTokenCDeployed
                    .connect(pool_user)
                    .approve(happyTokenPoolDeployed.address, approve_amount.toFixed());

                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
                const { id: pool_id2 } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
                //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, fpp.lock_time)

                const userTokenBBalanceBeforeSwap = await testTokenBDeployed.balanceOf(pool_user.address);
                const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenBBalanceBeforeSwap = await testTokenBDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );

                await happyTokenPoolDeployed
                    .connect(pool_user)
                    .swap(pool_id, verification, tokenC_address_index, approve_amount.toFixed(), [pool_id]);

                await happyTokenPoolDeployed
                    .connect(pool_user)
                    .swap(pool_id2, verification, tokenB_address_index, approve_amount.toFixed(), [pool_id]);

                const userTokenABalanceBeforeClaim = await testTokenADeployed.balanceOf(pool_user.address);
                const userTokenBBalanceAfterSwap = await testTokenBDeployed.balanceOf(pool_user.address);
                const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenABalanceBeforeClaim = await testTokenADeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenBBalanceAfterSwap = await testTokenBDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );

                expect(contractTokenBBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(contractTokenBBalanceBeforeSwap.toString()).plus(BigNumber(approve_amount)).toFixed(),
                );
                expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(approve_amount)).toFixed(),
                );
                expect(userTokenBBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(userTokenBBalanceBeforeSwap.toString()).minus(BigNumber(approve_amount)).toFixed(),
                );
                expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                    BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(approve_amount)).toFixed(),
                );

                const availabilityPrevious = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user.address);

                expect(availabilityPrevious.swapped.toString())
                    .to.be.eq(approve_amount.div(fpp.exchange_ratios[tokenC_address_index * 2]).toString())
                    .and.to.be.eq('2500000');
                expect(availabilityPrevious.claimed).to.be.false;

                const availabilityPrevious2 = await getAvailability(
                    happyTokenPoolDeployed,
                    pool_id2,
                    pool_user.address,
                );

                expect(availabilityPrevious2.swapped.toString())
                    .to.be.eq(approve_amount.multipliedBy(fpp.exchange_ratios[tokenB_address_index * 2 + 1]).toString())
                    .and.to.be.eq('20000000000000');
                expect(availabilityPrevious2.claimed).to.be.false;

                await helper.advanceTimeAndBlock(fpp.lock_time);

                // contains duplicated pool-id and an invalid pool id
                const invalid_pool_id = '0x1234567833dc44ce38f1024d3ea7d861f13ac29112db0e5b9814c54b12345678';
                await happyTokenPoolDeployed.connect(pool_user).claim([pool_id, pool_id2, pool_id2, invalid_pool_id]);

                const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user.address);
                expect(availabilityNow.claimed).to.be.true;

                const availabilityNow2 = await getAvailability(happyTokenPoolDeployed, pool_id2, pool_user.address);
                expect(availabilityNow2.claimed).to.be.true;

                const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );

                // tokenB ==> tokenA
                const ratio_b = fpp.exchange_ratios[3] / fpp.exchange_ratios[2];
                // tokenC ==> tokenA
                const ratio_c = fpp.exchange_ratios[5] / fpp.exchange_ratios[4];
                const exchangedTokenA_pool_1 = approve_amount * ratio_c;
                const exchangedTokenA_pool_2 = approve_amount * ratio_b;
                const exchangedTokenA_total = exchangedTokenA_pool_1 + exchangedTokenA_pool_2;

                expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                    BigNumber(userTokenABalanceBeforeClaim.toString()).plus(BigNumber(exchangedTokenA_total)).toFixed(),
                );
                expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                    BigNumber(contractTokenABalanceBeforeClaim.toString())
                        .minus(BigNumber(exchangedTokenA_total))
                        .toFixed(),
                );

                // "swapped amount" should not change
                expect(availabilityNow.swapped.toString())
                    .to.be.eq(exchangedTokenA_pool_1.toString())
                    .and.to.be.eq(availabilityPrevious.swapped.toString());

                expect(availabilityNow2.swapped.toString())
                    .to.be.eq(exchangedTokenA_pool_2.toString())
                    .and.to.be.eq(availabilityPrevious2.swapped.toString());

                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());

                expect(logs).to.have.length(2);

                let parsedLog = itoInterface.parseLog(logs[0]);
                const result = parsedLog.args;
                parsedLog = itoInterface.parseLog(logs[1]);
                const result2 = parsedLog.args;

                expect(result.to_value.toString()).to.be.eq(availabilityPrevious.swapped.toString());

                expect(result2.to_value.toString()).to.be.eq(availabilityPrevious2.swapped.toString());
            });

            it('should still be able to claim after destruct pool', async () => {
                const approve_amount = BigNumber('1e10');
                await testTokenCDeployed
                    .connect(signers[2])
                    .approve(happyTokenPoolDeployed.address, approve_amount.toFixed());

                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
                //await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, fpp.lock_time)
                await happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, approve_amount.toFixed(), [pool_id]);

                const availabilityPrevious = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address);
                expect(availabilityPrevious.claimed).to.be.false;

                await helper.advanceTimeAndBlock(fpp.lock_time);

                await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

                await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id]);
                const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address);

                expect(availabilityNow.swapped.toString()).and.to.be.eq(availabilityPrevious.swapped.toString());
                expect(availabilityNow.claimed).to.be.true;
                expect(availabilityNow.destructed).to.be.true;

                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result = parsedLog.args;

                expect(result.to_value.toString()).to.be.eq(availabilityPrevious.swapped.toString());
            });
        });

        describe('setUnlockTime()', async () => {
            it('should setUnlockTime work', async () => {
                const approve_amount = BigNumber('1e10');
                await testTokenCDeployed
                    .connect(signers[2])
                    .approve(happyTokenPoolDeployed.address, approve_amount.toFixed());

                const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
                await happyTokenPoolDeployed
                    .connect(signers[2])
                    .swap(pool_id, verification, tokenC_address_index, approve_amount.toFixed(), [pool_id]);

                const availabilityPrevious = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address);

                // should do nothing if pool is locked
                {
                    await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id]);
                    const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address);

                    expect(availabilityPrevious.swapped.toString())
                        .to.be.eq(availabilityNow.swapped.toString())
                        .and.to.be.eq(approve_amount.div(fpp.exchange_ratios[tokenC_address_index * 2]).toString())
                        .and.to.be.eq('2500000');
                    expect(availabilityNow.claimed).to.be.false;

                    const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());

                    expect(logs).to.have.length(0);
                }
                {
                    // can NOT set to 0
                    await expect(happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, 0)).to.be.rejectedWith(
                        Error,
                    );
                }
                if (true) {
                    // 48 bits integer overflow, expect error
                    const unlock_time = BigNumber('1000000000000', 16);
                    // console.log(unlock_time.toFixed());
                    await expect(
                        happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, unlock_time.toFixed()),
                    ).to.be.rejectedWith(Error);
                }
                const now_in_second = Math.floor(Date.now() / 1000);
                const new_unlock_time = now_in_second - base_timestamp;
                {
                    // only the "pool owner" can setUnlockTime
                    const account_not_creator = signers[4];
                    expect(
                        happyTokenPoolDeployed.connect(account_not_creator).setUnlockTime(pool_id, new_unlock_time),
                    ).to.be.rejectedWith('Pool Creator Only');
                }
                {
                    await happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, new_unlock_time);
                    {
                        await helper.advanceTimeAndBlock(1000);
                        const { unlock_time: poolUnlockTime } = await getAvailability(
                            happyTokenPoolDeployed,
                            pool_id,
                            signers[2].address,
                        );
                        expect(poolUnlockTime.toString()).and.to.be.eq(now_in_second.toString());
                    }
                    await happyTokenPoolDeployed.connect(signers[2]).claim([pool_id]);
                    const availabilityNow = await getAvailability(happyTokenPoolDeployed, pool_id, signers[2].address);
                    expect(availabilityNow.swapped.toString()).and.to.be.eq(availabilityPrevious.swapped.toString());
                    expect(availabilityNow.claimed).to.be.true;

                    const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
                    const parsedLog = itoInterface.parseLog(logs[0]);
                    const result = parsedLog.args;
                    expect(result.to_value.toString()).to.be.eq(availabilityPrevious.swapped.toString());
                }
            });
        });

        it('should everything work when unlock_time is 0(no lock)', async () => {
            const approve_amount = BigNumber('1e10');
            const pool_user = signers[2];
            await testTokenCDeployed
                .connect(pool_user)
                .approve(happyTokenPoolDeployed.address, approve_amount.toFixed());

            fpp.exchange_ratios = [1, 1, 1, 1, 1, 1];
            fpp.lock_time = 0;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
            const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
            const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
            const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            await happyTokenPoolDeployed
                .connect(pool_user)
                .swap(pool_id, verification, tokenC_address_index, approve_amount.toFixed(), [pool_id]);
            {
                const availability = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user.address);
                expect(availability.swapped.toString()).to.be.eq(approve_amount.toString());
                expect(availability.claimed).to.be.true;
            }
            const userTokenABalanceAfterSwap = await testTokenADeployed.balanceOf(pool_user.address);
            const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
            const contractTokenABalanceAfterSwap = await testTokenADeployed.balanceOf(happyTokenPoolDeployed.address);
            const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(happyTokenPoolDeployed.address);

            // tokens swapped immmediately
            expect(userTokenABalanceAfterSwap.toString()).to.be.eq(
                BigNumber(userTokenABalanceBeforeSwap.toString()).plus(BigNumber(approve_amount)).toFixed(),
            );
            expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(contractTokenCBalanceBeforeSwap.toString()).plus(BigNumber(approve_amount)).toFixed(),
            );
            expect(contractTokenABalanceAfterSwap.toString()).to.be.eq(
                BigNumber(contractTokenABalanceBeforeSwap.toString()).minus(BigNumber(approve_amount)).toFixed(),
            );
            expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(approve_amount)).toFixed(),
            );
            {
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.SwapSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result = parsedLog.args;
                expect(result).to.have.property('swapper').that.to.be.eq(pool_user.address);
                expect(result).to.have.property('claimed').that.to.be.eq(true);
            }
            {
                const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.ClaimSuccess());
                const parsedLog = itoInterface.parseLog(logs[0]);
                const result = parsedLog.args;
                expect(result).to.have.property('claimer').that.to.be.eq(pool_user.address);
            }
            // can not swap again
            {
                await expect(
                    happyTokenPoolDeployed
                        .connect(pool_user)
                        .swap(pool_id, verification, tokenC_address_index, approve_amount.toFixed(), [pool_id]),
                ).to.be.rejectedWith('Already swapped');
            }
            // can not setUnlockTime when pool lock_time is 0
            {
                const now_in_second = Math.floor(Date.now() / 1000);
                const new_unlock_time = now_in_second - base_timestamp;
                await expect(
                    happyTokenPoolDeployed.connect(creator).setUnlockTime(pool_id, new_unlock_time),
                ).to.be.rejectedWith(Error);
            }
            // can not claim
            {
                await happyTokenPoolDeployed.connect(pool_user).claim([pool_id]);
                const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                const userTokenCBalanceAfterClaim = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenCBalanceAfterClaim = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                assert.isTrue(userTokenABalanceAfterSwap.eq(userTokenABalanceAfterClaim));
                assert.isTrue(userTokenCBalanceAfterSwap.eq(userTokenCBalanceAfterClaim));
                assert.isTrue(contractTokenABalanceAfterSwap.eq(contractTokenABalanceAfterClaim));
                assert.isTrue(contractTokenCBalanceAfterSwap.eq(contractTokenCBalanceAfterClaim));
            }
            {
                const availability = await getAvailability(happyTokenPoolDeployed, pool_id, pool_user.address);
                expect(availability.swapped.toString()).to.be.eq(approve_amount.toString());
                expect(availability.claimed).to.be.true;
            }
        });
    });

    describe('destruct()', async () => {
        before(async () => {
            await testTokenADeployed.approve(happyTokenPoolDeployed.address, new BigNumber('1e27').toFixed());
        });

        it("Should throw error when you're not the creator of the happyTokenPoolDeployed", async () => {
            const account_not_creator = signers[4].address;
            const fakeTime = (new Date().getTime() + 1000 * 3600 * 24) / 1000;
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp;

            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            expect(happyTokenPoolDeployed.connect(account_not_creator).destruct(pool_id)).to.be.rejectedWith(Error);
        });

        it('Should throw error if happyTokenPoolDeployed is not expired', async () => {
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            expect(happyTokenPoolDeployed.connect(creator).destruct(pool_id)).to.be.rejectedWith(Error);
        });

        it('Should emit DestructSuccess event and withdraw all tokens', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp;
            fpp.exchange_ratios = [1, 75000, 1, 100, 1, 100];
            fpp.limit = BigNumber('100000e18').toFixed();
            fpp.total_tokens = BigNumber('1000000e18').toFixed();
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);
            let previous_eth_balance = await ethers.provider.getBalance(creator.address);
            const previous_tokenB_balance = await testTokenBDeployed.balanceOf(creator.address);
            const previous_tokenC_balance = await testTokenCDeployed.balanceOf(creator.address);

            const exchange_ETH_amount = BigNumber('1.3e18').toFixed();
            const { verification, validation } = getVerification(PASSWORD, signers[2].address);
            await happyTokenPoolDeployed
                .connect(signers[2])
                .swap(pool_id, verification, ETH_address_index, exchange_ETH_amount, [pool_id], {
                    value: exchange_ETH_amount,
                });

            const exchange_tokenB_amount = BigNumber('500e18').toFixed();
            await approveThenSwapToken(
                testTokenBDeployed,
                signers[5],
                tokenB_address_index,
                pool_id,
                exchange_tokenB_amount,
            );

            const exchange_tokenC_amount = BigNumber('2000e18').toFixed();
            const exchange_tokenC_pool_limit = BigNumber('1000e18').toFixed();
            await approveThenSwapToken(
                testTokenCDeployed,
                signers[6],
                tokenC_address_index,
                pool_id,
                exchange_tokenC_amount,
            );
            {
                const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);
                expect(result.destructed).to.false;
            }

            await helper.advanceTimeAndBlock(2000 * 1000);
            await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.DestructSuccess());
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;

            expect(result).to.have.property('id').that.to.be.eq(pool_id);
            expect(result).to.have.property('token_address').that.to.be.eq(testTokenADeployed.address);
            expect(result).to.have.property('remaining_balance');
            expect(result).to.have.property('exchanged_values');

            const ratioETH = fpp.exchange_ratios[1] / fpp.exchange_ratios[0];
            const ratioB = fpp.exchange_ratios[3] / fpp.exchange_ratios[2];
            const remaining_tokens = BigNumber(fpp.total_tokens)
                .minus(
                    BigNumber(ratioB)
                        .times(BigNumber(exchange_tokenB_amount))
                        .plus(BigNumber('100000e18'))
                        .plus(BigNumber(ratioETH).times(BigNumber(exchange_ETH_amount))),
                )
                .toFixed();

            expect(remaining_tokens).to.be.eq(result.remaining_balance.toString());

            const eth_balance = await ethers.provider.getBalance(creator.address);
            const r = BigNumber(eth_balance.sub(previous_eth_balance).toString());

            expect(r.minus(BigNumber('1e18')).isGreaterThan(0)).to.be.true;
            expect(r.minus(BigNumber('1.3e18')).isLessThan(0)).to.be.true;

            const transfer_amount = BigNumber('1e26').toFixed();
            const tokenB_balance = await testTokenBDeployed.balanceOf(creator.address);
            expect(tokenB_balance.toString()).to.be.eq(
                BigNumber(previous_tokenB_balance.toString())
                    .minus(BigNumber(transfer_amount))
                    .plus(BigNumber(exchange_tokenB_amount))
                    .toFixed(),
            );

            const tokenC_balance = await testTokenCDeployed.balanceOf(creator.address);
            expect(tokenC_balance.toString()).to.be.not.eq(
                BigNumber(previous_tokenC_balance.toString())
                    .minus(BigNumber(transfer_amount))
                    .plus(BigNumber(exchange_tokenC_amount))
                    .toFixed(),
            );
            expect(tokenC_balance.toString()).to.be.eq(
                BigNumber(previous_tokenC_balance.toString())
                    .minus(BigNumber(transfer_amount))
                    .plus(
                        BigNumber(exchange_tokenC_pool_limit), // 2000e18 exceeds limit
                    )
                    .toFixed(),
            );
            {
                // `exchanged_tokens` and `exchange_addrs` should still be available
                const result = await getAvailability(happyTokenPoolDeployed, pool_id, signers[1].address);
                expect(result.exchange_addrs).to.eql(fpp.exchange_addrs);
                expect(result.exchanged_tokens.map((bn) => bn.toString())).to.eql([
                    exchange_ETH_amount,
                    exchange_tokenB_amount,
                    exchange_tokenC_pool_limit,
                ]);
                expect(result.destructed).to.true;
            }
            {
                // destruct again, do nothing
                const contractTokenABalanceBeforeDestructAgain = await testTokenADeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenBBalanceBeforeDestructAgain = await testTokenBDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenCBalanceBeforeDestructAgain = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                await happyTokenPoolDeployed.connect(creator).destruct(pool_id);
                const contractTokenABalanceAfterDestructAgain = await testTokenADeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenBBalanceAfterDestructAgain = await testTokenBDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                const contractTokenCBalanceAfterDestructAgain = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed.address,
                );
                assert.isTrue(contractTokenABalanceBeforeDestructAgain.eq(contractTokenABalanceAfterDestructAgain));
                assert.isTrue(contractTokenBBalanceBeforeDestructAgain.eq(contractTokenBBalanceAfterDestructAgain));
                assert.isTrue(contractTokenCBalanceBeforeDestructAgain.eq(contractTokenCBalanceAfterDestructAgain));
            }
        });

        it('Should emit DestructSuccess event and withdraw all tokens when remaining_tokens is zero', async () => {
            const fakeTime = (new Date().getTime() + 1000 * 1000) / 1000;
            fpp.end_time = Math.ceil(fakeTime) - base_timestamp;
            fpp.exchange_ratios = [1, 75000, 1, 100, 1, 100];
            fpp.limit = BigNumber('50000e18').toFixed();
            fpp.total_tokens = BigNumber('50000e18').toFixed();
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed, fpp);

            const exchange_tokenB_amount = BigNumber('500e18').toFixed();
            await approveThenSwapToken(
                testTokenBDeployed,
                signers[3],
                tokenB_address_index,
                pool_id,
                exchange_tokenB_amount,
            );

            await happyTokenPoolDeployed.connect(creator).destruct(pool_id);

            const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.DestructSuccess());
            const parsedLog = itoInterface.parseLog(logs[0]);
            const result = parsedLog.args;

            expect(result).to.have.property('id').that.to.be.eq(pool_id);
            expect(result).to.have.property('token_address').that.to.be.eq(testTokenADeployed.address);
            expect(result.remaining_balance.toString()).that.to.be.eq('0');
            expect(result).to.have.property('exchanged_values');
        });
    });

    describe('smart contract upgrade', async () => {
        let pool_user;
        let verification;
        let happyTokenPoolDeployed_v1_0;
        let exchange_amount;

        before(async () => {
            pool_user = signers[2];
            const transfer_amount = BigNumber('1e26').toFixed();
            await testTokenBDeployed.connect(creator).transfer(pool_user.address, transfer_amount);
            await testTokenCDeployed.connect(creator).transfer(pool_user.address, transfer_amount);
        });

        beforeEach(async () => {
            const HappyTokenPool_v1_0 = await ethers.getContractFactory('HappyTokenPool_v1_0');
            const HappyTokenPoolProxy_v1_0 = await upgrades.deployProxy(HappyTokenPool_v1_0, [base_timestamp]);
            happyTokenPoolDeployed_v1_0 = new ethers.Contract(
                HappyTokenPoolProxy_v1_0.address,
                itoJsonABI_V1_0.abi,
                creator,
            );

            await testTokenADeployed
                .connect(creator)
                .approve(happyTokenPoolDeployed_v1_0.address, BigNumber('1e26').toFixed());
            const r = getVerification(PASSWORD, pool_user.address);
            verification = r.verification;

            exchange_amount = BigNumber('1e10').toFixed();
        });

        it('Should non-owner not be able to update implementation', async () => {
            // make sure `others` can NOT upgrade
            const proxyAdmin = await getProxyAdmin(happyTokenPoolDeployed_v1_0.address);
            const adminOnChain = await proxyAdmin.getProxyAdmin(happyTokenPoolDeployed_v1_0.address);
            expect(proxyAdmin.address.toUpperCase()).that.to.be.eq(adminOnChain.toUpperCase());
            const owner = await proxyAdmin.owner();
            expect(owner.toUpperCase()).that.to.be.eq(creator.address.toUpperCase());
            await expect(
                proxyAdmin
                    .connect(pool_user)
                    .upgrade(happyTokenPoolDeployed_v1_0.address, qualificationTesterDeployed.address),
            ).to.be.rejectedWith('caller is not the owner');
        });

        it('Should ITO v1.0 be compatible with latest, upgrade after claim', async () => {
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
            const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
            const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(
                happyTokenPoolDeployed_v1_0.address,
            );
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
            const exchanged_tokenA_amount = exchange_amount * ratio;
            {
                await testTokenCDeployed
                    .connect(pool_user)
                    .approve(happyTokenPoolDeployed_v1_0.address, approve_amount);

                const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed_v1_0.address,
                );
                await happyTokenPoolDeployed_v1_0
                    .connect(pool_user)
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
                {
                    const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability).to.not.have.property('claimed');
                }
                // Check SwapSuccess event
                {
                    const logs = await ethers.provider.getLogs(happyTokenPoolDeployed_v1_0.filters.SwapSuccess());
                    const parsedLog = itoInterface_V1_0.parseLog(logs[0]);
                    const result = parsedLog.args;
                    expect(result).to.have.property('id').that.to.not.be.null;
                    expect(result).to.have.property('swapper').that.to.not.be.null;
                    expect(result.from_value.toString()).that.to.be.eq(String(exchange_amount));
                    expect(result.to_value.toString()).that.to.be.eq(String(exchanged_tokenA_amount));
                    expect(result).to.have.property('from_address').that.to.be.eq(testTokenCDeployed.address);
                    expect(result).to.have.property('to_address').that.to.be.eq(testTokenADeployed.address);
                    expect(result).to.not.have.property('claimed');
                }
                // check token C balance after swap
                {
                    const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                    const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(contractTokenCBalanceBeforeSwap.toString())
                            .plus(BigNumber(exchange_amount))
                            .toFixed(),
                    );
                    expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
                    );
                }
                //-------------------------------------------------------------------------------------------------------------
                await helper.advanceTimeAndBlock(fpp.lock_time);
                await happyTokenPoolDeployed_v1_0.connect(pool_user).claim([pool_id]);
                {
                    const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
                    // previous behavior(tag: v1.0), changed already
                    expect(availability.swapped.toString()).to.be.eq('0');
                    expect(availability).to.not.have.property('claimed');
                }
                // check token A balance after claim
                {
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
            }

            // upgrade contract to latest
            await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool);
            const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
            {
                const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                // minor problem
                expect(availability.swapped.toString()).to.be.eq('0');
                expect(availability.claimed).to.be.false;
                await deployedUpgraded.connect(pool_user).claim([pool_id]);
                // claim-again, check token A balance
                {
                    await happyTokenPoolDeployed_v1_0.connect(pool_user).claim([pool_id]);
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
            }
        });

        it('Should ITO v1.0 be compatible with latest, upgrade before claim', async () => {
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
            const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
            const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(
                happyTokenPoolDeployed_v1_0.address,
            );
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
            const exchanged_tokenA_amount = exchange_amount * ratio;
            {
                await testTokenCDeployed
                    .connect(pool_user)
                    .approve(happyTokenPoolDeployed_v1_0.address, approve_amount);

                const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed_v1_0.address,
                );
                await happyTokenPoolDeployed_v1_0
                    .connect(pool_user)
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
                {
                    const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability).to.not.have.property('claimed');
                }
                // Check SwapSuccess event
                {
                    const logs = await ethers.provider.getLogs(happyTokenPoolDeployed_v1_0.filters.SwapSuccess());
                    const parsedLog = itoInterface_V1_0.parseLog(logs[0]);
                    const result = parsedLog.args;
                    expect(result).to.have.property('id').that.to.not.be.null;
                    expect(result).to.have.property('swapper').that.to.not.be.null;
                    expect(result.from_value.toString()).that.to.be.eq(String(exchange_amount));
                    expect(result.to_value.toString()).that.to.be.eq(String(exchanged_tokenA_amount));
                    expect(result).to.have.property('from_address').that.to.be.eq(testTokenCDeployed.address);
                    expect(result).to.have.property('to_address').that.to.be.eq(testTokenADeployed.address);
                    expect(result).to.not.have.property('claimed');
                }
                // check token C balance after swap
                {
                    const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                    const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(contractTokenCBalanceBeforeSwap.toString())
                            .plus(BigNumber(exchange_amount))
                            .toFixed(),
                    );
                    expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
                    );
                }
                {
                    const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability).to.not.have.property('claimed');
                }
            }
            //-------------------------------------------------------------------------------------------------------------
            // upgrade contract to latest
            await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool);
            const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
            //-------------------------------------------------------------------------------------------------------------
            {
                await helper.advanceTimeAndBlock(fpp.lock_time);
                await deployedUpgraded.connect(pool_user).claim([pool_id]);
                {
                    const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability.claimed).to.be.true;
                }
                // check token A balance after claim
                {
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        deployedUpgraded.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
            }

            {
                const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                expect(availability.claimed).to.be.true;
                await deployedUpgraded.connect(pool_user).claim([pool_id]);
                // claim-again, check token A balance
                {
                    await happyTokenPoolDeployed_v1_0.connect(pool_user).claim([pool_id]);
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
            }
        });

        it('Should ITO v1.0 be compatible with latest, unlocktime == 0, upgrade after swap', async () => {
            fpp.lock_time = 0;
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
            const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
            const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(
                happyTokenPoolDeployed_v1_0.address,
            );
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
            const exchanged_tokenA_amount = exchange_amount * ratio;
            await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);
            {
                const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed_v1_0.address,
                );
                await happyTokenPoolDeployed_v1_0
                    .connect(pool_user)
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
                {
                    const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability).to.not.have.property('claimed');
                }

                // check token C balance after swap
                {
                    const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                    const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(contractTokenCBalanceBeforeSwap.toString())
                            .plus(BigNumber(exchange_amount))
                            .toFixed(),
                    );
                    expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
                    );
                }
                // check token A balance after swap
                {
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
                {
                    const availability = await getAvailability(happyTokenPoolDeployed_v1_0, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability).to.not.have.property('claimed');
                }
            }
            //-------------------------------------------------------------------------------------------------------------
            // upgrade contract to latest
            await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool);
            const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
            //-------------------------------------------------------------------------------------------------------------
            {
                await deployedUpgraded.connect(pool_user).claim([pool_id]);
                {
                    const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability.claimed).to.be.true;
                }
                // check token A balance after claim
                {
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        deployedUpgraded.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
            }
        });

        it('Should ITO v1.0 be compatible with latest, unlocktime == 0, upgrade before swap', async () => {
            fpp.lock_time = 0;
            const approve_amount = BigNumber('1e10').toFixed();
            exchange_amount = approve_amount;
            const { id: pool_id } = await getResultFromPoolFill(happyTokenPoolDeployed_v1_0, fpp);
            const userTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(pool_user.address);
            const contractTokenABalanceBeforeSwap = await testTokenADeployed.balanceOf(
                happyTokenPoolDeployed_v1_0.address,
            );
            const ratio = fpp.exchange_ratios[5] / fpp.exchange_ratios[4]; // tokenA <=> tokenC
            const exchanged_tokenA_amount = exchange_amount * ratio;
            await testTokenCDeployed.connect(pool_user).approve(happyTokenPoolDeployed_v1_0.address, approve_amount);
            //-------------------------------------------------------------------------------------------------------------
            // upgrade contract to latest
            await upgrades.upgradeProxy(happyTokenPoolDeployed_v1_0.address, HappyTokenPool);
            const deployedUpgraded = new ethers.Contract(happyTokenPoolDeployed_v1_0.address, itoJsonABI.abi, creator);
            //-------------------------------------------------------------------------------------------------------------
            {
                const userTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                const contractTokenCBalanceBeforeSwap = await testTokenCDeployed.balanceOf(
                    happyTokenPoolDeployed_v1_0.address,
                );
                await happyTokenPoolDeployed_v1_0
                    .connect(pool_user)
                    .swap(pool_id, verification, tokenC_address_index, exchange_amount, [pool_id]);
                {
                    const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability.claimed).to.be.true;
                }

                // check token C balance after swap
                {
                    const userTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(pool_user.address);
                    const contractTokenCBalanceAfterSwap = await testTokenCDeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(contractTokenCBalanceBeforeSwap.toString())
                            .plus(BigNumber(exchange_amount))
                            .toFixed(),
                    );
                    expect(userTokenCBalanceAfterSwap.toString()).to.be.eq(
                        BigNumber(userTokenCBalanceBeforeSwap.toString()).minus(BigNumber(exchange_amount)).toFixed(),
                    );
                }
                // check token A balance after swap
                {
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        happyTokenPoolDeployed_v1_0.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
                {
                    const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability.claimed).to.be.true;
                }
            }
            {
                await deployedUpgraded.connect(pool_user).claim([pool_id]);
                {
                    const availability = await getAvailability(deployedUpgraded, pool_id, pool_user.address);
                    expect(availability.swapped.toString()).to.be.eq(exchanged_tokenA_amount.toString());
                    expect(availability.claimed).to.be.true;
                }
                // check token A balance after claim
                {
                    const userTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(pool_user.address);
                    const contractTokenABalanceAfterClaim = await testTokenADeployed.balanceOf(
                        deployedUpgraded.address,
                    );
                    expect(contractTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(contractTokenABalanceBeforeSwap.toString())
                            .minus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                    expect(userTokenABalanceAfterClaim.toString()).to.be.eq(
                        BigNumber(userTokenABalanceBeforeSwap.toString())
                            .plus(BigNumber(exchanged_tokenA_amount))
                            .toFixed(),
                    );
                }
            }
        });
    });

    async function approveThenSwapToken(test_token, swapper, token_address_index, pool_id, exchange_amount) {
        const r = getVerification(PASSWORD, swapper.address);
        verification = r.verification;
        validation = r.validation;

        const transfer_amount = BigNumber('1e26').toFixed();
        await test_token.transfer(swapper.address, transfer_amount);
        const approve_amount = exchange_amount;
        await test_token.connect(swapper).approve(happyTokenPoolDeployed.address, approve_amount);
        await happyTokenPoolDeployed
            .connect(swapper)
            .swap(pool_id, verification, token_address_index, exchange_amount, [pool_id]);
    }

    function getVerification(password, account) {
        var hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(password));
        var hash_bytes = Uint8Array.from(Buffer.from(hash.slice(2), 'hex'));
        hash = hash_bytes.slice(0, 5);
        hash = '0x' + Buffer.from(hash).toString('hex');
        return {
            verification: soliditySha3(hexToNumber(hash), account),
            validation: sha3(account),
        };
    }

    async function getResultFromPoolFill(happyTokenPoolDeployed, fpp) {
        await happyTokenPoolDeployed.fill_pool(...Object.values(fpp));
        const logs = await ethers.provider.getLogs(happyTokenPoolDeployed.filters.FillSuccess());
        const result = itoInterface.parseLog(logs[0]);
        return result.args;
    }

    async function getAvailability(happyTokenPoolDeployed, pool_id, account) {
        const signer = await ethers.getSigner(account);
        happyTokenPoolDeployed = happyTokenPoolDeployed.connect(signer);
        return happyTokenPoolDeployed.check_availability(pool_id);
    }

    async function getProxyAdmin(deployedProxyAddr) {
        const adminStoragePosition = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
        const storage = await ethers.provider.getStorageAt(deployedProxyAddr, adminStoragePosition);
        const addrStoragePrefix = '0x000000000000000000000000';
        assert.isTrue(storage.startsWith(addrStoragePrefix));
        const adminAddr = '0x' + storage.substring(addrStoragePrefix.length);
        const proxyAdmin = new ethers.Contract(adminAddr, proxyAdminABI.abi, creator);
        return proxyAdmin;
    }
});

describe('qualification', () => {
    it('should check the integrity of qualification contract', async () => {
        const isERC165 = await qualificationTesterDeployed.supportsInterface(erc165_interface_id);
        const isQualification = await qualificationTesterDeployed.supportsInterface(qualification_interface_id);
        expect(isERC165).to.be.true;
        expect(isQualification).to.be.true;

        const unknown_interface_id = '0x87ab3aaa';
        const invalid_interface_id = '0xffffffff';
        const isok_1 = await qualificationTesterDeployed.supportsInterface(unknown_interface_id);
        const isok_2 = await qualificationTesterDeployed.supportsInterface(invalid_interface_id);
        expect(isok_1).to.be.false;
        expect(isok_2).to.be.false;
    });

    describe('logQualified()', () => {
        it('should always return false once swap before start_time', async () => {
            const fakeMerkleProof = '0x1234567833dc44ce38f1024d3ea7d861f13ac29112db0e5b9814c54b12345678';
            await qualificationTesterDeployed2
                .connect(signers[10])
                .logQualified(signers[10].address, [fakeMerkleProof]);
            let result = await getLogResult();
            expect(result).to.be.null;

            await helper.advanceTimeAndBlock(pending_qualification_timestamp + 1000);
            await qualificationTesterDeployed2
                .connect(signers[11])
                .logQualified(signers[11].address, [fakeMerkleProof]);
            result = await getLogResult();
            expect(result.qualified).to.be.true;

            await qualificationTesterDeployed2
                .connect(signers[10])
                .logQualified(signers[10].address, [fakeMerkleProof]);
            result = await getLogResult();
            expect(result).to.be.null;
        });

        async function getLogResult() {
            const logs = await ethers.provider.getLogs(qualificationTesterDeployed2.filters.Qualification());
            if (logs.length === 0) return null;
            const result = qualificationInterface.parseLog(logs[0]);
            return result.args;
        }
    });
});
