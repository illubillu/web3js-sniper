#web3js-sniper

#Libraries used + docs:
  -Web3JS: https://web3js.readthedocs.io/en/v1.7.5/
  -Blocknative: https://docs.blocknative.com/
  -Axios: https://axios-http.com/docs/intro
  
#Program description: 
#Given a web3 websocket, router address, token address and account key programatically sign and send DEX txns to the blockchain
#Implements functionality to monitor the DEX factory of choice for any newly minted token pairs, determine if these tokens were created wiht sufficient liquidity, 
determine whether the token contract is verified, then submit a buy txn if and only if that is the case
#Implements the ability to look into the mempool via the Blocknative SDK
