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
let x = fs.readFileSync('uniswapAbi.json');
const pancakeAbi = JSON.parse(x);

x = fs.readFileSync('ERC-20_token.json');
const tokenAbi = JSON.parse(x);

x = fs.readFileSync('factoryAbi.json');
const factoryAbi = JSON.parse(x);

const w3 = new Web3(new Web3.providers.WebsocketProvider('wss://ropsten.infura.io/ws/v3/30d4b8199c704c1eb0d6f8350fefb2f7')); //instantiate w3 - global var

//intialize account
const key = '5801e5db363292ea3714b8fa6f3f19d695d8f4bb3aa12ee2735ba0fe9afeeec5';
const account = w3.eth.accounts.privateKeyToAccount(key);
w3.eth.defaultAccount = account.address;

//initialize addresses
const routerAddress = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
const wethAddress = '0xc778417e063141139fce010982780140aa0cd5ab';
const tokenAddress = '';
const factoryAddress = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';

//initialize contracts
const pancakeRouter = new w3.eth.Contract(pancakeAbi, routerAddress); //pancakeswap router
const pancakeFactory = new w3.eth.Contract(factoryAbi, factoryAddress); //pancake factory 

//helper functions
const rl = readline.createInterface({
    input : process.stdin, 
    output : process.stdout
})

function print(input) {
    process.stdout.write(String(input));
}

function unix() { 
    return Math.round((new Date()).getTime() / 1000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

async function sign_send(tx) { //signs and sends given tx
    signed_tx = await w3.eth.accounts.signTransaction(tx, key);
    tx_receipt = await w3.eth.sendSignedTransaction(signed_tx.rawTransaction);
    return tx_receipt;
}

async function awaitSell(amountToSell, tokenAddress) {
    await new Promise((resolve) => {
        rl.question('enter s to sell:\n', async (ans) => {
        if (ans == 's') {          
            console.log('now selling ' + amountToSell + ' tokens');
            let encodedSell = pancakeRouter.methods.swapExactTokensForETH(amountToSell, 0, [tokenAddress, wethAddress], account.address, unix() + 60).encodeABI(); 
            let sellTx = {
                data : encodedSell, 
                gas : '210000', 
                gasPrice : w3.utils.toWei('5', 'gwei'),
                to : routerAddress
            }
            sellTx = await sign_send(sellTx);
            console.log('> token sell tx complete hash: ' + sellTx.transactionHash);
            
            resolve(); 
        }
    })})
}

async function awaitApprove(tokenContract, token) {
    console.log('approving token...');
    let encodedApprove = tokenContract.methods.approve(routerAddress, w3.utils.toWei('10', 'ether')).encodeABI();
    let approveTx = {
        data : encodedApprove,
        gas : '210000', 
        gasPrice : w3.utils.toWei('5', 'gwei'),
        to : token
    }

    approveReceipt = await sign_send(approveTx); 
    console.log('> approve tx complete with hash: ' + approveReceipt.transactionHash); 
}

async function main() {
    if (w3.eth.net.isListening()) {
        console.log('w3 connected');
    }
    else {
        throw 'w3 doesnt work';
    }

    //intialize blocknative
    const blocknativeApiKey = '947e3bae-6884-441e-aae7-4310f0349320';
    const options = {
        dappId : blocknativeApiKey, //api key
        networkId : 1, //eth netid
        ws: WebSocket
    }

   //intialize tokenContract
   var tokenContract = new w3.eth.Contract(tokenAbi, tokenAddress); 

   const blocknative = new BlocknativeSdk(options); //instantiate blocknative  

   const amountToBuy = '.1'; 

   //configure blocknative, filtering for pending addliq/swaptokensforeth txns 
   await blocknative.configuration({
    "scope" : routerAddress, 
    "filters" : [{"status" : "confirmed"}, {"contractCall.methodName": "addLiquidityETH"}, {"contractCall.params.token" : tokenAddress}], 
    "watchAddress" : true
}).then(console.log('blocknative configured successfuly')).catch(console.log);

    //instantiate emitter on pancakeRouter
    var {emitter, details} = blocknative.account(routerAddress);

    let buyImmediately;
    let monitorLiq = false; //true: option to snipe on liqudiity - false: paste contract and buy immediately 

  if (monitorLiq){ 
    if (!(await isVerified(tokenAddress))) {
      //  throw 'token contract is not verified.';
    }

     await new Promise((resolve) => {
        rl.question('buy immediately after liq-add? y for yes, n for no (manual control)\n', (ans) => {
        if (ans == 'y') {
            console.log('will buy token immediately on liq add');
            buyImmediately = true;
            resolve();
        } else {
            console.log('will alert when liq is added');
            buyImmediately = false;
            resolve();
        }
    })}
    )

    var buyReceipt, approveReceipt, sellReceipt;

    console.log('now listening...');

    //begin listening for events - use case: only if you have the contract address prior to launch 
    await new Promise((resolve, reject) => {
        emitter.on('all', async (tx) => {
            console.log('found addliquidity tx...');
            console.log(tx); 

            //turn emitter off
            emitter.off('all');

            if (buyImmediately) {
                console.log('buying token now...');

                let encodedBuy = pancakeRouter.methods.swapExactETHForTokens(0, [wethAddress, tokenAddress], account.address, unix() + 30).encodeABI();
                let buyTx = {
                    value : w3.utils.toWei(amountToBuy, 'ether'),
                    data : encodedBuy, 
                    to : routerAddress,
                    gas : '210000', 
                    gasPrice : w3.utils.toWei('15', 'gwei')
                }

                buyReceipt = await sign_send(buyTx);
                console.log('buy tx complete with hash: ' + buyReceipt.transactionHash);
                
                await awaitApprove(tokenContract, tokenAddress); //approve token 
                
                await blocknative.configuration({
                    "scope" : routerAddress, 
                    "filters" : [{"status" : "pending"}, {"contractCall.methodName" : ["removeLiquidityETH", "removeLiquidityETHWithPermit", "removeLiquidityETHSupportingFeeOnTransferTokens", "removeLiquidityETHWithPermitSupportingFeeOnTransferTokens"]}, {"contractCall.params.token" : tokenAddress}],
                    "watchAddress" : true
                })

                console.log('mointoring for rugpull...')
                await new Promise(async (resolve) => {
                    emitter.on('all', async (tx) => {
                        console.log('found remove liquidity txn, frontrunning...'); 
                        console.log(tx);

                        emitter.off('all');                  

                        let rugPullerGasPrice = parseInt(tx.maxFeePerGas) - parseInt(tx.maxPriorityFeePerGas);
                        let frontRunGasPrice = String(Math.round(rugPullerGasPrice * 1.25)); //send txn with 25% higher gas

                        console.log('selling with gasPrice: ' + w3.utils.fromWei(frontRunGasPrice), 'gwei');

                        let bal = await tokenContract.methods.balanceOf(account.address).call(); 
                        console.log('now selling ' + bal + ' tokens...');

                        let encodedSell = pancakeRouter.methods.swapExactTokensForETH(bal, 0, [tokenAddress, wethAddress], account.address, unix() + 60).encodeABI(); 
                        
                        let sellTx = {
                            data : encodedSell,
                            to : routerAddress,
                            gas : '300000',
                            gasPrice : frontRunGasPrice
                        }

                        await sign_send(sellTx);
                        console.log('sell complete with hash: ' + sellTx.transactionHash);
                        resolve('sold via front run');
                    })
                    await awaitSell(bal, tokenAddress);
                }).then(console.log);
             } else {
                 //manual buy mode
                 let bought = false; 
                await new Promise((resolve) => {
                    rl.question('liq add was detected, enter b to buy, anything else to continue listening\n', async (ans) => {
                        if (ans == 'b') {
                            let encodedBuy = pancakeRouter.methods.swapExactETHForTokens(0, [wethAddress, tokenAddress], account.address, unix() + 30).encodeABI();
                            let buyTx = {
                                value : w3.utils.toWei(amountToBuy, 'ether'),
                                data : encodedBuy, 
                                to : routerAddress,
                                gas : '210000', 
                                gasPrice : w3.utils.toWei('6', 'gwei')
                            }       
                            buyReceipt = await sign_send(buyTx);
                            console.log('> buy tx complete with hash: ' + buyReceipt.transactionHash);  
                            
                            bought = true; 
                            } else {
                                console.log('didnt buy, still listening...')
                            }
                        resolve();
                        })
                    })
                if (bought) { 
                    await awaitApprove(tokenContract); //approve

                    await blocknative.configuration({
                        "scope" : routerAddress, 
                        "filters" : [{"status" : "pending"}, {"contractCall.methodName" : "removeLiquidityETH"}, {"contractCall.methodName" : "removeLiquidityETHWithPermit"}, {"contractCall.methodName" : "removeLiquidityETHWithPermitSupportingFeeOnTransferTokens"}, {"contractCall.methodName" : "removeLiquidityETHSupportingFeeOnTransferTokens"}, {"contractCall.params.token" : tokenAddress}],
                        "watchAddress" : true
                    })

                    let bal = await tokenContract.methods.balanceOf(account.address).call(); 

                    console.log('monitoring for rugpull...');
                    await new Promise(async (resolve) => {
                        emitter.on('all', async (tx) => {
                            console.log('found remove liquidity txn, frontrunning...'); 

                            emitter.off('all');                  

                            let rugPullerGasPrice = parseInt(tx.maxFeePerGas) - parseInt(tx.maxPriorityFeePerGas);
                            let frontRunGasPrice = String(Math.round(rugPullerGasPrice * 1.25)); //send txn with 25% higher gas
                            
                            let encodedSell = pancakeRouter.methods.swapExactTokensForETH(bal, 0, [tokenAddress, wethAddress], account.address, unix() + 60).encodeABI(); 
                            
                            let sellTx = {
                                data : encodedSell,
                                to : routerAddress,
                                gas : '300000',
                                gasPrice : frontRunGasPrice
                            }

                            await sign_send(sellTx);
                            console.log('sell complete with hash: ' + sellTx.transactionHash);
                            resolve('sold via front run');
                        })
                        await awaitSell(bal, tokenAddress);                      
                }).then(console.log);
                }
            }                      
    })})  }
    else { 
        let inputToken 
         //copypaste token address here
        await new Promise((resolve) => {
            rl.question('enter token address:\n', (ans) => {
               inputToken = ans;
               resolve();
            })
        })

        tokenContract = new w3.eth.Contract(tokenAbi, inputToken);

       // if (await isVerified(inputToken)) { 
            console.log('token contract verified, buying token now...');

            let encodedBuy = pancakeRouter.methods.swapExactETHForTokens(0, [wethAddress, inputToken], account.address, unix() + 30).encodeABI();
            let buyTx = {
                value : w3.utils.toWei(amountToBuy, 'ether'),
                data : encodedBuy, 
                to : routerAddress,
                gas : '200000', 
                gasPrice : w3.utils.toWei('5', 'gwei')
            }

            buyReceipt = await sign_send(buyTx);
            console.log('> buy tx complete with hash: ' + buyReceipt.transactionHash);
            
            await sleep(4597);
            await awaitApprove(tokenContract, inputToken); //approve token 

            let bal = await tokenContract.methods.balanceOf(account.address).call(); 

            await blocknative.configuration({
                "scope" : routerAddress, 
                "filters" : [{"status" : "pending"}, {"contractCall.methodName" : ["removeLiquidityETH", "removeLiquidityETHWithPermit", "removeLiquidityETHSupportingFeeOnTransferTokens", "removeLiquidityETHWithPermitSupportingFeeOnTransferTokens"]}, {"contractCall.params.token" : tokenAddress}],
                "watchAddress" : true
            })

            console.log('monitoring for rugpull...');
            await new Promise(async (resolve) => {
                emitter.on('all', async (tx) => {
                    if (tx.contractCall.methodName == '')
                    console.log('found remove liquidity txn, frontrunning...'); 
                    console.log(tx);

                    emitter.off('all');                  

                    let rugPullerGasPrice = parseInt(tx.maxFeePerGas) - parseInt(tx.maxPriorityFeePerGas);
                    let frontRunGasPrice = String(Math.round(rugPullerGasPrice * 1.25)); //send txn with 25% higher gas        
                    console.log('selling with gasPrice: ' + frontRunGasPrice);

                    let bal = await tokenContract.methods.balanceOf(account.address).call(); 

                    let encodedSell = pancakeRouter.methods.swapExactTokensForETH(bal, 0, [inputToken, wethAddress], account.address, unix() + 60).encodeABI(); 
                    
                    let sellTx = {
                        data : encodedSell,
                        to : routerAddress,
                        gas : '500000',
                        gasPrice : frontRunGasPrice
                    }

                    await sign_send(sellTx);
                    console.log('sell complete with hash: ' + sellTx.transactionHash);
                    resolve('sold via front run');
                })
                await awaitSell(bal, inputToken);
            }).then(console.log);
        //}  
    }
    

   return;
}

main();
