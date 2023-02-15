import {
  AccountInfo,
  Commitment,
  Connection,
  PublicKey,
} from '@solana/web3.js';

import * as fzstd from 'fzstd';

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