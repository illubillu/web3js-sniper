const Web3 = require('web3'); //web3js
const fs = require('fs'); //filesystem
const BlocknativeSdk = require('bnc-sdk'); //blocknative  
const WebSocket = require('ws');
const readline = require('readline');
const axios = require('axios'); 
const { request } = require('http');

async function isVerified(token) { //pings bscscan api to see if a token contract is verified 
    let url = 'https://api.bscscan.com/api?module=contract&action=getabi&address=' + token + '&apikey=PI13VMXVUA6368MJHRF4V18YPSPQWWD9CU';
    let verified;                
    await axios.get(url).then(function(response) {
        verified = (response.data.status == '1') ? true : false; 
    })

    if (verified) console.log('contact is verified'); else console.log('contract not verified')
    return verified;  
}

//input file data
let x = fs.readFileSync('pcsAbi.json');
const pancakeAbi = JSON.parse(x);

x = fs.readFileSync('BEP-20_token.json');
const tokenAbi = JSON.parse(x);

x = fs.readFileSync('pancakeFactoryAbi.json');
const factoryAbi = JSON.parse(x);

const w3 = new Web3(new Web3.providers.WebsocketProvider("wss://ancient-still-dew.bsc.quiknode.pro/c3ccdca47ef46d5a4b59dd62cc27f37ef1143be6/"));

//intialize account
const account = w3.eth.accounts.privateKeyToAccount('5801e5db363292ea3714b8fa6f3f19d695d8f4bb3aa12ee2735ba0fe9afeeec5');
const key = '5801e5db363292ea3714b8fa6f3f19d695d8f4bb3aa12ee2735ba0fe9afeeec5';
w3.eth.defaultAccount = account.address;

//initialize addresses
const pancakeAddy = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
const wethAddy = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const tokenAddy = '0x2Cc3DABcDB7650b4c1B1726A4B8D383Bd07b96a9';
const factoryAddy = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

//initialize contracts
const pancakeRouter = new w3.eth.Contract(pancakeAbi, pancakeAddy); //pancakeswap router
const pancakeFactory = new w3.eth.Contract(factoryAbi, factoryAddy); //pancake factory 

async function main() {
    if (w3.eth.net.isListening()) {
        console.log('w3 connected');
    }
    else {
        throw 'w3 doesnt work';
    }

    const factoryEmitter = pancakeFactory.events.PairCreated();
    factoryEmitter.on('data', (x) => {
        console.log(x);
    })
}

main();