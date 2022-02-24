const Dai = artifacts.require('Dai.sol');
const Yas = artifacts.require('Yas.sol');
const Bat = artifacts.require('Bat.sol');
const Rep = artifacts.require('Rep.sol');
const Dex = artifacts.require('Dex.sol');

const [DAI, YAS, BAT, REP] = ['DAI', 'YAS','BAT','REP']
    .map(ticker => web3.utils.fromAscii(ticker));

module.exports = async function (deployer, network) {
  if(network === 'mumbai'){
    await deployer.deploy(Dai);
    await deployer.deploy(Yas);
    await deployer.deploy(Bat);
    await deployer.deploy(Rep);
    await deployer.deploy(Dex);
    const dex = await Dex.deployed();
    await dex.addToken(
        DAI, Dai.address
    );
    await dex.addToken(
        YAS, Yas.address
    );
    await dex.addToken(
        BAT, Bat.address
    );
    await dex.addToken(
        REP, Rep.address
    );

};

}