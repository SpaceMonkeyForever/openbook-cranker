/**
 This will probably move to its own repo at some point but easier to keep it here for now
 */
import * as os from 'os';
import * as fs from 'fs';
import {
  Keypair,
  Commitment,
  Connection,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  BlockhashWithExpiryBlockHeight,
  TransactionInstruction,
} from '@solana/web3.js';
import { getMultipleAccounts, sleep } from '../utils/utils';
import BN from 'bn.js';
import {
  decodeEventQueue,
  DexInstructions,
  Market,
} from '@project-serum/serum';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Logger } from 'tslog';
import axios  from "axios"

const URL_MARKETS_BY_VOLUME = 'https://openserum.io/api/serum/markets.json?min24hVolume=';
const VOLUME_THRESHOLD = 1000;
const {
  ENDPOINT_URL,
  WALLET_PATH,
  KEYPAIR,
  PROGRAM_ID,
  INTERVAL,
  MAX_UNIQUE_ACCOUNTS,
  CONSUME_EVENTS_LIMIT,
  CLUSTER,
  PRIORITY_QUEUE_LIMIT, // queue length at which to apply the priority fee
  PRIORITY_CU_PRICE,    // extra microlamports per cu for high fee markets
  PRIORITY_CU_LIMIT,    // compute limit
  POLL_MARKETS,         // optional for using Top markets
  MAX_TX_INSTRUCTIONS,  // max instructions per transaction
  CU_PRICE,             // extra microlamports per cu for any transaction
  PRIORITY_MARKETS,     // input to add comma seperated list of markets that force fee bump
  MARKETS_FILE          // Specify the full path to an alternate markets.json file.
} = process.env;

// Read the alternate markets file if provided
const marketsFile = MARKETS_FILE || '../markets.json';
const markets = require(marketsFile);

const cluster = CLUSTER || 'mainnet';
const interval = INTERVAL || 1000;
const maxUniqueAccounts = parseInt(MAX_UNIQUE_ACCOUNTS || '10');
const consumeEventsLimit = new BN(CONSUME_EVENTS_LIMIT || '30');
const priorityMarkets = PRIORITY_MARKETS ? PRIORITY_MARKETS.split(',') : [] ;
const priorityQueueLimit = parseInt(PRIORITY_QUEUE_LIMIT || "100");
const cuPrice = parseInt(CU_PRICE || "0");
const priorityCuPrice = parseInt(PRIORITY_CU_PRICE || "100000");
const CuLimit = parseInt(PRIORITY_CU_LIMIT || "50000");
const maxTxInstructions = parseInt(MAX_TX_INSTRUCTIONS || "1");
const serumProgramId = new PublicKey(
  PROGRAM_ID || cluster == 'mainnet'
    ? 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX'
    : 'EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj',
);
const walletFile = WALLET_PATH || os.homedir() + '/.config/solana/devnet.json';
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      KEYPAIR || fs.readFileSync(walletFile, 'utf-8'),
    ),
  ),
);

const log: Logger = new Logger({name: "openbook-cranker", displayFunctionName: false, displayFilePath: "hidden", minLevel: "info"});

log.info(payer.publicKey.toString());

const connection = new Connection(ENDPOINT_URL!, 'processed' as Commitment);

// blockhash loop
let recentBlockhash: BlockhashWithExpiryBlockHeight;
try {
  connection.getLatestBlockhash(
    "finalized"
  ).then((blockhash) => {
    recentBlockhash = blockhash;
  });
}
catch (e) {
  log.error(`Couldn't get blockhash: ${e}`);
}
setInterval(async () => {
  try {
    recentBlockhash = await connection.getLatestBlockhash("finalized");
  } catch (e) {
    log.error(`Couldn't get blockhash: ${e}`);
  }
},1000)

async function run() {
  // list of markets to crank
  let marketsList;
  let count = 0;
  const TotalRetry = 3
  if (POLL_MARKETS === 'true') {
    while (count < TotalRetry) {
      try {
        log.info(`Fetching markets from OpenSerum API (attempt ${count + 1}). Volume threshold: ${VOLUME_THRESHOLD}`);
        const { data } = await axios.get(
          URL_MARKETS_BY_VOLUME + VOLUME_THRESHOLD,
        );
        marketsList = data;
        break;
      } catch (e) {
        if (count > TotalRetry) {
          log.error(e);
          throw e;
        } else {
          count++;
        }
      }
    }
  } else {
    marketsList = markets[cluster];
  }
  // load selected markets
  const spotMarkets = await Promise.all(
    marketsList.map((m) => {
      return Market.load(
        connection,
        new PublicKey(m.address),
        {
          skipPreflight: true,
          commitment: 'processed' as Commitment,
        },
        serumProgramId,
      );
    }),
  );

  log.info("Cranking the following markets");
  marketsList.forEach(m => log.info(`${m.name}: ${m.address}`));

  const quoteToken = new Token(
    connection,
    spotMarkets[0].quoteMintAddress,
    TOKEN_PROGRAM_ID,
    payer,
  );
  const quoteWallet = await quoteToken
    .getOrCreateAssociatedAccountInfo(payer.publicKey)
    .then((a) => a.address);

  const baseWallets = await Promise.all(
    spotMarkets.map((m) => {
      const token = new Token(
        connection,
        m.baseMintAddress,
        TOKEN_PROGRAM_ID,
        payer,
      );

      return token
        .getOrCreateAssociatedAccountInfo(payer.publicKey)
        .then((a) => a.address);
    }),
  );

  const eventQueuePks = spotMarkets.map(
    (market) => market['_decoded'].eventQueue,
  );

  // noinspection InfiniteLoopJS
  while (true) {
    try {
      let crankInstructionsQueue: TransactionInstruction[] = [];
      let instructionBumpMap = new Map();

      const eventQueueAccts = await getMultipleAccounts(
        connection,
        eventQueuePks,
      );

      for (let i = 0; i < eventQueueAccts.length; i++) {
        const accountInfo = eventQueueAccts[i].accountInfo;
        const events = decodeEventQueue(accountInfo.data);

        if (events.length === 0) {
          continue;
        }

        const accounts: Set<string> = new Set();
        for (const event of events) {
          accounts.add(event.openOrders.toBase58());

          // Limit unique accounts to first 10
          if (accounts.size >= maxUniqueAccounts) {
            break;
          }
        }

        const openOrdersAccounts = [...accounts]
          .map((s) => new PublicKey(s))
          .sort((a, b) => a.toBuffer().swap64().compare(b.toBuffer().swap64()));

        const instr = DexInstructions.consumeEvents({
          market: spotMarkets[i].publicKey,
          eventQueue: spotMarkets[i]['_decoded'].eventQueue,
          coinFee: baseWallets[i],
          pcFee: quoteWallet,
          openOrdersAccounts,
          limit: consumeEventsLimit,
          programId: serumProgramId,
        });

        crankInstructionsQueue.push(instr);

        //if the queue is large then add the priority fee
        if(events.length > priorityQueueLimit){
          instructionBumpMap.set(instr,1);
        }

        //bump transaction fee if market address is included in PRIORITY_MARKETS env
        if(priorityMarkets.includes(spotMarkets[i].publicKey.toString())){
          instructionBumpMap.set(instr,1);
        }

        log.info(`market ${spotMarkets[i].publicKey} creating consume events for ${events.length} events`);

      }

      //send the crank transaction if there are markets that need cranked
      if(crankInstructionsQueue.length > 0){

        //chunk the instructions to ensure transactions are not too large
        let chunkedCrankInstructions: any[] = [];
        let chunkSize = maxTxInstructions;
        for (let i = 0; i < crankInstructionsQueue.length; i += chunkSize) {
          chunkedCrankInstructions.push(crankInstructionsQueue.slice(i, i + chunkSize));
        }

        chunkedCrankInstructions.forEach(function (transactionInstructions){

          let shouldBumpFee = false;
          let crankTransaction = new Transaction({... recentBlockhash});

          crankTransaction.add(
              ComputeBudgetProgram.setComputeUnitLimit({
                units: (CuLimit * maxTxInstructions),
              })
          );

          transactionInstructions.forEach(function (crankInstruction) {
            //check the instruction for flag to bump fee
            instructionBumpMap.get(crankInstruction) ? shouldBumpFee = true : null;
          });

          if(shouldBumpFee || cuPrice){
            crankTransaction.add(
                ComputeBudgetProgram.setComputeUnitPrice({
                  microLamports: shouldBumpFee ? priorityCuPrice : cuPrice,
                })
            );
          }

          crankTransaction.add(...transactionInstructions);

          crankTransaction.sign(payer);

          //send the transaction
          connection.sendRawTransaction(crankTransaction.serialize(), {
            skipPreflight: true,
            maxRetries: 2,
          }).then(txId => log.info(`Cranked ${transactionInstructions.length} market(s): ${txId}`));

        })

      }

      await sleep(interval);

    } catch (e) {
      log.error(e);
    }
  }
}

run();
