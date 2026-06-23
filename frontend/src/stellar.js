import { Contract, Networks, TransactionBuilder as TB, rpc, xdr, Address, nativeToScVal, Horizon, Operation, Asset } from '@stellar/stellar-sdk';
export const TransactionBuilder = TB;

const RPC_URL = "https://soroban-testnet.stellar.org:443";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const CONTRACT_ID = "CBUG37SP3SNYGOS65YSKYY236XHNFN3IJEKRGGLGPSQKXPIU7DRIUARJ";
export const SPONSOR_DESTINATION = "GBV7SLQKG4S7S3M3F4WCUJKK775IL24X6QGYH3YCGYSZNZWSK7IJCGPX"; // Mock destination for donations

export const server = new rpc.Server(RPC_URL);
export const horizonServer = new Horizon.Server("https://horizon-testnet.stellar.org");

/**
 * Get native XLM balance for a user
 */
export async function getNativeBalance(publicKey) {
  try {
    const account = await horizonServer.loadAccount(publicKey);
    const nativeBalance = account.balances.find(b => b.asset_type === 'native');
    return nativeBalance ? nativeBalance.balance : "0.00";
  } catch (e) {
    console.error("Failed to fetch balance:", e);
    return "0.00";
  }
}

/**
 * Get current votes from the contract
 */
export async function getPollVotes() {
  const contract = new Contract(CONTRACT_ID);
  
  // To read state without signing, we can simulate the transaction or
  // just read the storage from the RPC. However, simulateTransaction is easier.
  const tx = new TransactionBuilder(
    await server.getAccount("GA7YVOT3N2F7RMB74I6I7DYY7F7U4IVTMB3MMQ3CWW2B7QO2K2F6P25R"), // dummy source
    { fee: "100", networkPassphrase: NETWORK_PASSPHRASE }
  )
  .addOperation(contract.call('get_votes'))
  .setTimeout(30)
  .build();

  try {
    const simResult = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(simResult)) {
        const res = simResult.result.retval; // Should be a ScVal containing a tuple of (u32, u32)
        // Parse the tuple: [countA, countB]
        if (res.switch() === xdr.ScValType.scvVec() && res.vec().length === 2) {
            const countA = res.vec()[0].u32();
            const countB = res.vec()[1].u32();
            return { A: countA, B: countB };
        }
    }
    return { A: 0, B: 0 };
  } catch (e) {
    console.error("Failed to fetch votes:", e);
    return { A: 0, B: 0 };
  }
}

/**
 * Builds the vote transaction (requires 1 XLM payment)
 */
export async function buildVoteTransaction(publicKey, optionNum) {
  const accountResponse = await server.getAccount(publicKey);
  const contract = new Contract(CONTRACT_ID);
  
  const voterVal = new Address(publicKey).toScVal();
  const optionVal = nativeToScVal(optionNum, { type: 'u32' });

  const tx = new TransactionBuilder(accountResponse, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination: SPONSOR_DESTINATION,
      asset: Asset.native(),
      amount: "1.0000000",
    }))
    .addOperation(contract.call("vote", voterVal, optionVal))
    .setTimeout(30)
    .build();

  const simulatedTx = await server.simulateTransaction(tx);
  if (simulatedTx.error) {
    throw new Error(simulatedTx.error);
  }

  const preparedTx = await server.prepareTransaction(tx);
  return preparedTx.toEnvelope().toXDR('base64');
}

export async function buildSponsorTransaction(publicKey, amount) {
  const accountResponse = await server.getAccount(publicKey);
  
  const tx = new TransactionBuilder(accountResponse, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination: SPONSOR_DESTINATION,
      asset: Asset.native(),
      amount: amount.toString(),
    }))
    .setTimeout(30)
    .build();

  return tx.toEnvelope().toXDR('base64');
}
