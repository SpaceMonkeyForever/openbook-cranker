import {
  AccountInfo,
  Commitment,
  Connection,
  PublicKey,
} from '@solana/web3.js';

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getMultipleAccounts(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment?: Commitment,
  minContextSlot?: number,
): Promise<
  {
    publicKey: PublicKey;
    context: { slot: number };
    accountInfo: AccountInfo<Buffer>;
  }[]
> {
  const len = publicKeys.length;
  if (len === 0) {
    return [];
  }
  if (len > 100) {
    const mid = Math.floor(publicKeys.length / 2);
    return Promise.all([
      getMultipleAccounts(connection, publicKeys.slice(0, mid), commitment),
      getMultipleAccounts(connection, publicKeys.slice(mid, len), commitment),
    ]).then((a) => a[0].concat(a[1]));
  }
  const publicKeyStrs = publicKeys.map((pk) => pk.toBase58());

  // load connection commitment as a default
  commitment ||= connection.commitment;

  // set no minimum context slot by default
  minContextSlot ||= 0;

  const args = commitment ? [publicKeyStrs, { commitment,minContextSlot }] : [publicKeyStrs, {minContextSlot}];

  // @ts-ignore
  const resp = await connection._rpcRequest('getMultipleAccounts', args);
  if (resp.error) {
    throw new Error(resp.error.message);
  }
  if (resp.result) {
    const nullResults = resp.result.value.filter((r) => r?.account === null);
    if (nullResults.length > 0)
      throw new Error(
        `gma returned ${
          nullResults.length
        } null results. ex: ${nullResults[0]?.pubkey.toString()}`,
      );
  }
  return resp.result.value.map(
    ({ data, executable, lamports, owner }, i: number) => ({
      publicKey: publicKeys[i],
      context: resp.result.context,
      accountInfo: {
        data: Buffer.from(data[0], 'base64'),
        executable,
        owner: new PublicKey(owner),
        lamports,
      },
    }),
  );
}