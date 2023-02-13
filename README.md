# OpenBook crank script

OpenBook needs to be cranked to process orderbook events.
The initial code was taken from the same crank script for openbook in 
mango-v3-client, so most credit goes to Mango team.

#### Install deps first:

```
yarn install
```

#### Run:

make sure to create a JSON file containing the keypair formatted as a byte array e.g. [1,3,4...]

```
ENDPOINT_URL=... WALLET_PATH=./path/to/wallet.json ./start-cranker.sh
```

Or run with KEYPAIR directly:

```
ENDPOINT_URL=... KEYPAIR=[1,3,4...] ./start-cranker.sh
```

to run in the background, pass "-d" or "--daemon"

#### Optional Environment Variables:

```
  CLUSTER              // Cluster to use. 'mainnet' or 'devnet'. Default is 
                       // mainnet.
  CONSUME_EVENTS_LIMIT // Max number of events to consume in each TX. Default is
                       // 30 events.
  CU_PRICE             // Minimum additional micro lamports for all 
                       // transactions. Default is 0. Raise this above 0 if
                       // you want all transactions to pay a priority fee for 
                       // every market.
  INTERVAL             // Sleep interval, in ms, between each loop. Default is 
                       // 1000 ms
  MARKETS_FILE         // Specify the full path to an alternate markets.json 
                       // file. Default is '../markets.json'. This option will
                       // let you run multiple instances with different 
                       // settings for the markets. e.g. bump with "high fees"
                       // or "medium fees" or other markets not included in the
                       // default markets.json file.
  MAX_TX_INSTRUCTIONS  // Max number of instructions for each transaction. 
                       // Default is 1.
  MAX_UNIQUE_ACCOUNTS  // Max number of unique accounts to process in each
                       // transaction. Default is 10.
  POLL_MARKETS         // If true, ignore the local markets.json file and crank
                       // the top markets, by volume, on openserum.com above a
                       // minimum threshold of 1000 (hard-coded). Default is 
                       // undefined (false).
  PRIORITY_CU_LIMIT    // Compute unit limit per instruction. Default is 50000.
  PRIORITY_CU_PRICE    // Additional micro lamports for PRIORITY_MARKETS & 
                       // PRIORITY_QUEUE_LIMIT. Default is 100000.
  PRIORITY_MARKETS     // Input to a comma separated list of market IDs that 
                       // receive fee bump. Transactions for the markets on this 
                       // list will include higher priority fees.
                       // e.g. PRIORITY_MARKETS=ID-1,ID-2,ID-3.
  PRIORITY_QUEUE_LIMIT // Force PRIORITY_CU_PRICE for transactions when the size 
                       // of the event queue exceeds this value. Default is 100. 
  PROGRAM_ID           // OpenBook program to use. Default for mainnet is
                       // srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX.
```

#### TODO:

- Dynamic priority fee using getRecentPrioritizationFees
- Dynamic frequency based on queue length
