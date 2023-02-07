# OpenBook crank script

OpenBook needs to be cranked to process orderbook events.
The initial code was taken from the same crank script for openbook in mango-v3-client, so most credit goes to Mango team.

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

optional env args:

```
  BUMP_MARKETS          // comma seperated list to force PRIORITY_CU_PRICE for market addresses
  CU_PRICE          // minimum additional micro lamports for all transactions
  PRIORITY_QUEUE_LIMIT  // force PRIORITY_CU_PRICE for transactions when events exceed this value
  PRIORITY_CU_PRICE     // additional micro lamports for BUMP_MARKETS & PRIORITY_QUEUE_LIMIT
```

#### TODO:

- Dynamic priority fee using getRecentPrioritizationFees
- Dynamic frequency based on queue length