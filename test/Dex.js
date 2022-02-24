const { expectRevert } = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

const Dai = artifacts.require('Dai.sol');
const Yas = artifacts.require('Yas.sol');
const Bat = artifacts.require('Bat.sol');
const Rep = artifacts.require('Rep.sol');
const Dex = artifacts.require('Dex.sol');

const SIDE = {
    BUY :0,
    SELL :1
};

contract('Dex', (accounts) => {
    let dai, yas, bat, rep, dex;
    const [trader1, trader2] = [accounts[1], accounts[2]]; //took accounts[0] as admin by default

    //const ticker = web3.utils.fromAscii('DAI'); converting into bytes32 
    const [DAI, YAS, BAT, REP] = ['DAI', 'YAS','BAT','REP']
    .map(ticker => web3.utils.fromAscii(ticker));

    beforeEach(async() => {
        //Deploying ERC20 Tokens
        ([dai, yas, bat, rep] = await Promise.all([
            Dai.new(),
            Yas.new(),
            Bat.new(),
            Rep.new()
        ]));

        //Deploying the DEX Smart Contract
        dex = await Dex.new();
        await Promise.all([
            dex.addToken(DAI,dai.address),
            dex.addToken(YAS,yas.address),
            dex.addToken(BAT,bat.address),
            dex.addToken(REP,rep.address)
        ]);

        //Define an amount of token that we are going to allocate to the two addresses
        //utility function that allows to convert some Ether amount to Wei
        const amount = web3.utils.toWei('1000'); //1 = 10 ^ 18 cents of token
        const seedTokenBalance = async(token, trader) => {
            await token.faucet(trader, amount); //after that, trader is going to approve the dex to transfer his tokens
            await token.approve(
                dex.address,
                amount,
                {from: trader}
                );
        };

        //loop through all our tokens and call seedTokenBalance Function
        await Promise.all(
            [dai, yas, bat, rep].map(
                token => seedTokenBalance(token, trader1)
            )
        );
        await Promise.all(
            [dai, yas, bat, rep].map(
                token => seedTokenBalance(token, trader2)
            )
        );
    });

    it('do NOT add token if not asked by admin', async() => {
        await expectRevert(
            dex.addToken(DAI, dai.address, {from: trader1}),
            'only admin');
    });

    it('do NOT add token that is already added', async() => {
        await expectRevert(
            dex.addToken(DAI, dai.address),
            'token already exists'
        )
    });

    it.only('should deposit tokens' , async() => {
        const amount = web3.utils.toWei('100');
        
        await dex.deposit(
            amount,
            DAI,
            {from: trader1}
        );

        const balance = await dex.traderBalances(trader1, DAI);
        assert(balance.toString() === amount);
    });

    it('should NOT deposit tokens that do not exist', async() => {
        await expectRevert(
            dex.deposit(
                web3.utils.toWei('100'),
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                {from: trader1}
            ),
            'token does not exist'
        );
    });

    it('should withdraw tokens when token exists and Balance is not low', async() => {
        const amount = web3.utils.toWei('100');
        await dex.deposit(
            amount,
            DAI,
            {from: trader1}
        );

        await dex.withdraw(
            amount,
            DAI,
            {from: trader1}
        );

        const [balanceDex, balanceDai] = await Promise.all([
            dex.traderBalances(trader1, DAI),
            dai.balanceOf(trader1)
        ]);
        assert(balanceDex.isZero());
        assert(balanceDai.toString() === web3.utils.toWei('1000'));
    });

    it('should NOT withdraw tokens when token does not exist', async() => {
        await expectRevert(
            dex.withdraw(
                web3.utils.toWei('100'),
                web3.utils.fromAscii('TOKEN-DOES-NOT-EXIST'),
                {from: trader1}
            ),
            'token does not exist'
        );
    });

    it('should NOT withdraw tokens when traderBalance < amount', async() =>{
        const amount = web3.utils.toWei('100');
        await dex.deposit(
            amount,
            DAI,
            {from: trader1}
        );

        await expectRevert(
            dex.withdraw(
            web3.utils.toWei('1000'),
            DAI,
            {from: trader1}), 'balance too low'
        );
    });

    it('Should create limit order when token exists, token is not dai and trader has sufficient balance',
    async() =>{
        await dex.deposit(
            web3.utils.toWei('100'),
            DAI,
            {from: trader1}
        );

        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10'),
            10,
            SIDE.BUY,
            {from: trader1}
        );

        //inspect the order book and make sure that we can find our order

        let buyOrders = await dex.getOrders(REP, SIDE.BUY);
        let sellOrders = await dex.getOrders(REP, SIDE.SELL);
        assert(buyOrders.length === 1);
        assert(buyOrders[0].trader === trader1);
        assert(buyOrders[0].ticker === web3.utils.padRight(REP, 64)); 
        //why not REP? the ticker that we ll get back from the smart contract will be padded with 0 on the right.
        assert(buyOrders[0].price === '10');
        assert(buyOrders[0].amount === web3.utils.toWei('10'));
        assert(sellOrders.length === 0);

        //Check if another trader makes an order at a superior price , it gets placed in the orderbook and at the right place.
        await dex.deposit(
            web3.utils.toWei('200'),
            DAI,
            {from: trader2}
        );

        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10'),
            11,
            SIDE.BUY,
            {from: trader2}
        );
        buyOrders = await dex.getOrders(REP, SIDE.BUY);
        sellOrders = await dex.getOrders(REP, SIDE.SELL);
        assert(buyOrders.length === 2);
        assert(buyOrders[0].trader === trader2);
        assert(buyOrders[1].trader === trader1);
        assert(sellOrders.length === 0);

        //Check if another trader makes an order at an inferior price , it gets placed in the orderbook and at the right place.
        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10'),
            9,
            SIDE.BUY,
            {from: trader2}
        );
        buyOrders = await dex.getOrders(REP, SIDE.BUY);
        sellOrders = await dex.getOrders(REP, SIDE.SELL);
        assert(buyOrders.length === 3);
        assert(buyOrders[0].trader === trader2);
        assert(buyOrders[1].trader === trader1);
        assert(buyOrders[2].trader === trader2);
        assert(buyOrders[2].price === '9');        
        assert(sellOrders.length === 0);

    });

    it('should NOT create limit order if token does not exist', async() => {
        await expectRevert(
            dex.createLimitOrder(
                web3.utils.fromAscii('TOKEN_DOES_NOT_EXIST'),
                web3.utils.toWei('10'),
                10,
                SIDE.BUY,
                {from: trader1}
            ),
            'token does not exist'
        );
    });

    it('should NOT create limit order if token is DAI', async() => {
        await expectRevert(
            dex.createLimitOrder(
                DAI,
                web3.utils.toWei('10'),
                10,
                SIDE.BUY,
                {from: trader1}
            ),
            'cannot trade DAI'
        );
    });

    it('should NOT create limit order if TOKEN BALANCE is too low', async() => {
        await dex.deposit(
            web3.utils.toWei('99'),
            REP,
            {from: trader1}
        );
        await expectRevert(
            dex.createLimitOrder(
                REP,
                web3.utils.toWei('100'),
                10,
                SIDE.SELL,
                {from: trader1}
            ),
            'token balance too low'
        )
    });

    it('should NOT create limit order if DAI BALANCE is too low', async() => {
        await dex.deposit(
            web3.utils.toWei('99'),
            DAI,
            {from: trader1}
        );
        await expectRevert(
            dex.createLimitOrder(
                REP,
                web3.utils.toWei('10'),
                10,
                SIDE.BUY,
                {from: trader1}
            ),
            'dai balance too low'
        )
    });

    it('should create market order and match against limit order', async() => {
        await dex.deposit(
            web3.utils.toWei('200'),
            DAI,
            {from: trader1}
        );
        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10'),
            10,
            SIDE.BUY,
            {from: trader1}
        );
        await dex.deposit(
            web3.utils.toWei('100'),
            REP,
            {from: trader2}
        );
        await dex.createMarketOrder(
            REP,
            web3.utils.toWei('5'),            
            SIDE.SELL,
            {from: trader2}
        );
        let balances = await Promise.all([
            dex.traderBalances(trader1, DAI),
            dex.traderBalances(trader1, REP),
            dex.traderBalances(trader2, DAI),
            dex.traderBalances(trader2, REP)
        ]);

        //make sure that the limit order of the first trader has been partially filled
        let orders = await dex.getOrders(REP, SIDE.BUY);
        assert(orders[0].filled === web3.utils.toWei('5'));
        assert(balances[0].toString() === web3.utils.toWei('150'));
        assert(balances[1].toString() === web3.utils.toWei('5'));
        assert(balances[2].toString() === web3.utils.toWei('50'));
        assert(balances[3].toString() === web3.utils.toWei('95'));

        //check if first limit order is completely filled and another limit order is created,
        //then first limit order should be popped off!
        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('10'),
            9,
            SIDE.BUY,
            {from: trader1}
        );
        await dex.createMarketOrder(
            REP,
            web3.utils.toWei('5'),            
            SIDE.SELL,
            {from: trader2}
        ); //this market order will completely fill earlier limit order at better price
        balances = await Promise.all([
            dex.traderBalances(trader1, DAI),
            dex.traderBalances(trader1, REP),
            dex.traderBalances(trader2, DAI),
            dex.traderBalances(trader2, REP)
        ]);
        orders = await dex.getOrders(REP, SIDE.BUY);
        assert(orders[0].length === 1);
        assert(orders[0].price === '9');
        assert(orders[0].filled === web3.utils.toWei('0'));
        assert(balances[0].toString() === web3.utils.toWei('100'));
        assert(balances[1].toString() === web3.utils.toWei('10'));
        assert(balances[2].toString() === web3.utils.toWei('100'));
        assert(balances[3].toString() === web3.utils.toWei('90'));    
    });

    it('should NOT create market order if token does not exist', async() => {
        await expectRevert(
            dex.createMarketOrder(
                web3.utils.fromAscii('TOKEN_DOES_NOT_EXIST'),
                web3.utils.toWei('10'),
                SIDE.BUY,
                {from: trader1}
            ),
            'token does not exist'
        );
    });

    it('should NOT create market order if token is DAI', async() => {
        await expectRevert(
            dex.createMarketOrder(
                DAI,
                web3.utils.toWei('10'),
                SIDE.BUY,
                {from: trader1}
            ),
            'cannot trade DAI'
        );
    });

    it('should NOT create market order if TOKEN BALANCE is too low', async() => {
        await dex.deposit(
            web3.utils.toWei('99'),
            REP,
            {from: trader1}
        );
        await expectRevert(
            dex.createMarketOrder(
                REP,
                web3.utils.toWei('100'),
                SIDE.SELL,
                {from: trader1}
            ),
            'token balance too low'
        )
    });

    it('should NOT create market order if DAI balance is too low', async() => {
        await dex.deposit(
            web3.utils.toWei('100'),
            REP,
            {from: trader1}
        );

        await dex.createLimitOrder(
            REP,
            web3.utils.toWei('100'),
            10,
            SIDE.SELL,
            {from: trader1}
        );
        //trader2 will try to buy this token without any dai balance
        await expectRevert(
            dex.createMarketOrder(
                REP,
                web3.utils.toWei('100'),
                SIDE.BUY,
                {from: trader2}
            ),
            'dai balance too low'
        );
    });
});