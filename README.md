# OpenBook crank script

OpenBook needs to be cranked to process orderbook events.
The initial code was taken from the same crank script for openbook in mango-v3-client, so most credit goes to Mango team.

install dependencies:

```
yarn install
```

Run:

make sure to create a JSON file containing the keypair formatted as a byte array e.g. [1,3,4...]

```
ENDPOINT_URL=... KEYPAIR=./path/to/wallet.json ./start-cranker.sh
```
