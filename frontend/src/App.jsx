import { useState, useEffect } from 'react';
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { getPollVotes, buildVoteTransaction, server, NETWORK_PASSPHRASE, getNativeBalance } from './stellar';
import './App.css';

function App() {
  const [pubKey, setPubKey] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [status, setStatus] = useState(""); // pending, success, danger
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [votes, setVotes] = useState({ A: 0, B: 0 });

  const fetchVotes = async () => {
    const v = await getPollVotes();
    setVotes(v);
  };

  useEffect(() => {
    // Initialize StellarWalletsKit static class
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: defaultModules(),
    });

    fetchVotes();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchVotes, 10000);
    return () => clearInterval(interval);
  }, []);

  const connectWallet = async () => {
    try {
      const { address } = await StellarWalletsKit.authModal();
      setPubKey(address);
      const bal = await getNativeBalance(address);
      setBalance(bal);
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
      setTxHash("");

      const optionNum = optionStr === 'A' ? 1 : 2;
      const tx = await buildVoteTransaction(pubKey, optionNum);

      setStatusMsg("Please sign the transaction in your wallet...");
      
      let xdrString;
      if (typeof tx === 'string') {
        xdrString = tx;
      } else if (typeof tx.toXDR === 'function') {
        xdrString = tx.toXDR();
      } else if (typeof tx.toEnvelope === 'function') {
        xdrString = tx.toEnvelope().toXDR('base64');
      } else if (tx.build && typeof tx.build === 'function') {
        xdrString = tx.build().toXDR();
      } else {
        throw new Error("Could not parse transaction XDR from the prepared transaction");
      }

      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdrString, {
        networkPassphrase: NETWORK_PASSPHRASE
      });

      setStatusMsg("Submitting transaction to network...");
      const txResult = await server.sendTransaction(signedTxXdr); // Handle different return formats from wallets

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
      setTxHash(txResult.hash);
      
      fetchVotes(); // refresh immediately
      const newBal = await getNativeBalance(pubKey);
      setBalance(newBal);
      
      setTimeout(() => {
        setStatus("");
        setStatusMsg("");
        setTxHash("");
      }, 8000);

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
      
      <div className="card glass-panel">
        <div className="header-actions">
          <div>
            <h2>Best Smart Contract Language?</h2>
            <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: {totalVotes}</p>
          </div>
          {!pubKey ? (
            <button className="btn btn-connect" onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <div className="wallet-dashboard">
              <div className="balance-badge">
                <span className="balance-label">Balance</span>
                <span className="balance-value">{balance} XLM</span>
              </div>
              <button className="btn btn-secondary" title={pubKey}>
                {pubKey.substring(0, 4)}...{pubKey.substring(pubKey.length - 4)}
              </button>
            </div>
          )}
        </div>

        {statusMsg && (
          <div className={`status-badge status-${status}`}>
            {statusMsg}
            {txHash && (
              <a 
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} 
                target="_blank" 
                rel="noreferrer"
                className="tx-link"
              >
                View on Stellar Explorer
              </a>
            )}
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
