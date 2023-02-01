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

env args to pay attention to:

```
  HIGH_FEE_MARKETS,      // markets to apply a priority fee for e.g. [0,1] to apply on the first two markets in markets.json
  DEFAULT_CU_PRICE,     // extra microlamports per cu for any market
  PRIORITY_CU_PRICE,     // extra microlamports per cu for high fee markets
```

#### TODO:

- Crank multiple markets in the same TX
- Poll the list of top markets using https://openserum.io/api/serum/markets.json?min24hVolume=100000
- Dynamic priority fee using getRecentPrioritizationFees
- Dynamic frequency based on queue length