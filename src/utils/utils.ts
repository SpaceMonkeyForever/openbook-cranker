import {
  AccountInfo,
  Commitment,
  Connection,
  PublicKey,
} from '@solana/web3.js';

import * as fzstd from 'fzstd';
import {Market} from "@project-serum/serum";
import * as buffer_layout from "buffer-layout";
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunk(array, size) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) => array.slice(index * size, (index + 1) * size));
}

export async function getMultipleAccounts(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment?: Commitment,
  minContextSlot?: number,
): Promise<{
  publicKey: PublicKey;
  context: { slot: number };
  accountInfo: AccountInfo<Buffer>;
}[]> {

  if (!publicKeys.length) {
    throw new Error('no Public Keys provided to getMultipleAccounts');
  }

  //set the maximum number of accounts per call
  let chunkedPks = chunk(publicKeys, 100);

  //asynchronously fetch each chunk of accounts and combine the results
  return (await Promise.all(chunkedPks.map(async function (pkChunk) {

    // load connection commitment as a default
    commitment ||= connection.commitment;
    //use zstd to compress large responses
    let encoding = 'base64+zstd';
    // set no minimum context slot by default
    minContextSlot ||= 0;

    const args = [pkChunk, {commitment, encoding, minContextSlot}];

    // @ts-ignore
    const gmaResult = await connection._rpcRequest('getMultipleAccounts', args);

    if (gmaResult.error) {
      throw new Error(gmaResult.error.message);
    }

    return gmaResult.result.value.map(
      ({data, executable, lamports, owner}, i) => ({
        publicKey: pkChunk[i],
        context: gmaResult.result.context,
        accountInfo: {
          data: Buffer.from(fzstd.decompress(Buffer.from(data[0], 'base64'))),
          executable,
          owner: new PublicKey(owner),
          lamports,
        },
      }),
    );
  }))).flat();

}

//load multiple markets at once instead of calling getAccountInfo for each market 3 times
//by default it is 1 call to get the market and 2 calls to get the decimals for baseMint and quoteMint
//this can be condensed into 2 calls total per 100 markets
export async function loadMultipleOpenbookMarkets(connection,programId,marketsList){

  let marketsMap = new Map();
  let decimalMap = new Map();
  let uniqueMints = new Set();

  //get all the market data for an openbook market
  let pubKeys = marketsList.map((item) => new PublicKey(item.address));
  let marketsAccountInfos = await getMultipleAccounts(connection, pubKeys, 'processed');
  marketsAccountInfos.forEach(function (result) {
    let layout = Market.getLayout(programId);
    let decoded = layout.decode(result.accountInfo.data);
    uniqueMints.add(decoded.baseMint);
    uniqueMints.add(decoded.quoteMint);
    marketsMap.set(result.publicKey.toString(), {
      decoded: decoded,
      baseMint: decoded.baseMint,
      quoteMint: decoded.quoteMint,
      programId: programId
    });
  });

  //get all the token's decimal values
  const MINT_LAYOUT = buffer_layout.struct([buffer_layout.blob(44), buffer_layout.u8('decimals'), buffer_layout.blob(37)]);
  let uniqueMintsPubKeys: any[] = Array.from(uniqueMints);
  let uniqueMintsAccountInfos = await getMultipleAccounts(connection, uniqueMintsPubKeys, 'processed');
  uniqueMintsAccountInfos.forEach(function (result) {
    const {decimals} = MINT_LAYOUT.decode(result.accountInfo.data);
    decimalMap.set(result.publicKey.toString(), decimals);
  });

  //loop back through the markets and load the market with the decoded data and the base/quote decimals
  let spotMarkets: Market[] = [];
  marketsMap.forEach(function (market) {
    let baseMint = market.baseMint.toString();
    let quoteMint = market.quoteMint.toString();
    let openbookMarket = new Market(market.decoded, decimalMap.get(baseMint), decimalMap.get(quoteMint), {}, programId, null);
    spotMarkets.push(openbookMarket);
  });

  return spotMarkets;
}

//get the associated accounts but don't check if they exist.
export async function getMultipleTokenAccounts(connection,owner,tokenAccounts){

  //token.associatedProgramId & token.programId will be the same for each token
  const token = new Token(connection, tokenAccounts[0].toString(), TOKEN_PROGRAM_ID, owner);
  let associatedAccounts: PublicKey[] = [];

  for (const tokenAccount of tokenAccounts) {
    const associatedAddress = await Token.getAssociatedTokenAddress(token.associatedProgramId, token.programId, tokenAccount, owner.publicKey);
    associatedAccounts.push(associatedAddress);
  }

  return associatedAccounts;
}