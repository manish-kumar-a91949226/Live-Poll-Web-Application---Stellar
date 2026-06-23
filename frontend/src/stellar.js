import { Contract, Networks, TransactionBuilder as TB, rpc, xdr, Address, nativeToScVal, Horizon } from '@stellar/stellar-sdk';
export const TransactionBuilder = TB;

const RPC_URL = "https://soroban-testnet.stellar.org:443";
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const CONTRACT_ID = "CALMB3XPIMAG63YDARE52FJXIITT3RUB3JWC4ZRKZKS7BYJZZ2MF2VHR";

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
 * Builds the vote transaction
 */
export async function buildVoteTransaction(publicKey, optionNum) {
    const account = await server.getAccount(publicKey);
    const contract = new Contract(CONTRACT_ID);
    
    // Convert optionNum to ScVal u32
    const optionScVal = nativeToScVal(optionNum, { type: 'u32' });
    const voterScVal = new Address(publicKey).toScVal();

    let tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: NETWORK_PASSPHRASE
    })
    .addOperation(contract.call('vote', voterScVal, optionScVal))
    .setTimeout(30)
    .build();

    // Simulate to populate footprint
    const simulatedTx = await server.prepareTransaction(tx);
    
    // Safely extract XDR string
    if (typeof simulatedTx === 'string') return simulatedTx;
    if (typeof simulatedTx.toEnvelope === 'function') return simulatedTx.toEnvelope().toXDR('base64');
    if (typeof simulatedTx.toXDR === 'function') return simulatedTx.toXDR();
    if (simulatedTx.build) {
        const built = simulatedTx.build();
        if (typeof built.toEnvelope === 'function') return built.toEnvelope().toXDR('base64');
        if (typeof built.toXDR === 'function') return built.toXDR();
    }
    
    // Fallback: build our own envelope
    return tx.toEnvelope().toXDR('base64');
}
