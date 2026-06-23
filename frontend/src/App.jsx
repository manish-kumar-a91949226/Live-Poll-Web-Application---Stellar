import { useState, useEffect } from 'react';
import { StellarWalletsKit, WalletNetwork, allowAllModules, XBULL_ID } from '@creit.tech/stellar-wallets-kit';
import { getPollVotes, buildVoteTransaction, server, NETWORK_PASSPHRASE } from './stellar';
import './App.css';

function App() {
  const [kit, setKit] = useState(null);
  const [pubKey, setPubKey] = useState(null);
  const [status, setStatus] = useState(""); // pending, success, danger
  const [statusMsg, setStatusMsg] = useState("");
  const [votes, setVotes] = useState({ A: 0, B: 0 });

  const fetchVotes = async () => {
    const v = await getPollVotes();
    setVotes(v);
  };

  useEffect(() => {
    // Initialize StellarWalletsKit
    const swk = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: XBULL_ID,
      modules: allowAllModules(),
    });
    setKit(swk);

    fetchVotes();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchVotes, 10000);
    return () => clearInterval(interval);
  }, []);

  const connectWallet = async () => {
    try {
      if (!kit) return;
      await kit.openModal({
        onWalletSelected: async (option) => {
          kit.setWallet(option.id);
          const publicKey = await kit.getPublicKey();
          setPubKey(publicKey);
        }
      });
    } catch (e) {
      console.error(e);
      setStatus("danger");
      setStatusMsg("Failed to connect wallet: " + e.message);
    }
  };

  const handleVote = async (optionStr) => {
    if (!pubKey) {
      setStatus("danger");
      setStatusMsg("Please connect your wallet first.");
      return;
    }

    try {
      setStatus("pending");
      setStatusMsg("Building transaction...");

      const optionNum = optionStr === 'A' ? 1 : 2;
      const tx = await buildVoteTransaction(pubKey, optionNum);

      setStatusMsg("Please sign the transaction in your wallet...");
      
      const signedTxXdr = await kit.signTx({
        xdr: tx.toXDR(),
        publicKeys: [pubKey],
        network: NETWORK_PASSPHRASE
      });

      setStatusMsg("Submitting transaction to network...");
      const txResult = await server.sendTransaction(signedTxXdr.signedTxXdr || signedTxXdr); // Handle different return formats from wallets

      if (txResult.status === "ERROR") {
          throw new Error("Transaction failed on the network");
      }

      // Wait for it to be confirmed
      let txStatus = txResult.status;
      while (txStatus === "PENDING") {
          await new Promise(r => setTimeout(r, 2000));
          const res = await server.getTransaction(txResult.hash);
          txStatus = res.status;
          if (txStatus === "FAILED") throw new Error("Transaction execution failed");
      }

      setStatus("success");
      setStatusMsg(`Vote cast for Option ${optionStr} successfully!`);
      fetchVotes(); // refresh immediately
      
      setTimeout(() => {
        setStatus("");
        setStatusMsg("");
      }, 5000);

    } catch (e) {
      console.error(e);
      setStatus("danger");
      
      const msg = e.message || String(e);
      // Handle the required 3 error types
      if (msg.includes("Wallet not found") || msg.includes("not installed")) {
        setStatusMsg("Error: Wallet extension not found.");
      } else if (msg.includes("reject") || msg.includes("User declined") || msg.includes("cancel")) {
        setStatusMsg("Error: Transaction was rejected by the user.");
      } else if (msg.includes("balance") || msg.includes("insufficient") || msg.includes("tx_insufficient_balance")) {
        setStatusMsg("Error: Insufficient balance to cover fees.");
      } else if (msg.includes("Already voted") || msg.includes("already voted")) {
        setStatusMsg("Error: You have already voted!");
      } else {
        setStatusMsg("Transaction failed: " + msg);
      }
    }
  };

  const totalVotes = votes.A + votes.B;
  const pctA = totalVotes === 0 ? 0 : Math.round((votes.A / totalVotes) * 100);
  const pctB = totalVotes === 0 ? 0 : Math.round((votes.B / totalVotes) * 100);

  return (
    <div className="app-container">
      <h1>Stellar Live Poll</h1>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2>Best Smart Contract Language?</h2>
          {!pubKey ? (
            <button className="btn" onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <button className="btn btn-secondary" title={pubKey}>
              {pubKey.substring(0, 4)}...{pubKey.substring(pubKey.length - 4)}
            </button>
          )}
        </div>

        {statusMsg && (
          <div className={`status-badge status-${status}`} style={{ marginBottom: '1rem', width: '100%', textAlign: 'center' }}>
            {statusMsg}
          </div>
        )}

        <div className="poll-options">
          <div className="poll-option" onClick={() => handleVote('A')}>
            <div className="poll-progress" style={{ width: `${pctA}%` }}></div>
            <div className="poll-content">
              <span>Rust (Soroban)</span>
              <span className="poll-votes">{pctA}% ({votes.A})</span>
            </div>
          </div>
          <div className="poll-option" onClick={() => handleVote('B')}>
            <div className="poll-progress" style={{ width: `${pctB}%` }}></div>
            <div className="poll-content">
              <span>Solidity</span>
              <span className="poll-votes">{pctB}% ({votes.B})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
