import { useState, useEffect } from 'react';
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { getPollVotes, buildVoteTransaction, buildSponsorTransaction, server, NETWORK_PASSPHRASE, getNativeBalance, TransactionBuilder } from './stellar';
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

  const handleSponsor = async () => {
    if (!pubKey) {
      setStatus("danger");
      setStatusMsg("Please connect your wallet first.");
      return;
    }

    try {
      setStatus("pending");
      setStatusMsg("Building XLM transaction...");
      setTxHash("");

      // 10 XLM sponsorship
      const tx = await buildSponsorTransaction(pubKey, "10.0000000");

      setStatusMsg("Please sign the XLM transfer in your wallet...");
      
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx, {
        networkPassphrase: NETWORK_PASSPHRASE
      });

      setStatusMsg("Submitting payment to network...");
      const parsedSignedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
      const txResult = await server.sendTransaction(parsedSignedTx);

      if (txResult.status === "ERROR") {
          throw new Error("Transaction failed on the network");
      }

      let txStatus = txResult.status;
      while (txStatus === "PENDING") {
          await new Promise(r => setTimeout(r, 2000));
          const res = await server.getTransaction(txResult.hash);
          txStatus = res.status;
          if (txStatus === "FAILED") throw new Error("Transaction execution failed");
      }

      setStatus("success");
      setStatusMsg(`Thank you! 10 XLM sponsorship successful!`);
      setTxHash(txResult.hash);
      
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
      setStatusMsg("Transaction failed: " + msg.substring(0, 50));
      setTimeout(() => { setStatus(""); setStatusMsg(""); }, 5000);
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
      
      let xdrString = tx;
      if (typeof tx !== 'string') {
        if (typeof tx.toXDR === 'function') xdrString = tx.toXDR();
        else if (typeof tx.toEnvelope === 'function') xdrString = tx.toEnvelope().toXDR('base64');
      }

      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdrString, {
        networkPassphrase: NETWORK_PASSPHRASE
      });

      setStatusMsg("Submitting transaction to network...");
      const parsedSignedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
      const txResult = await server.sendTransaction(parsedSignedTx); 

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
      if (msg.includes("Wallet not found") || msg.includes("not installed")) {
        setStatusMsg("Error: Wallet extension not found.");
      } else if (msg.includes("reject") || msg.includes("User declined") || msg.includes("cancel")) {
        setStatusMsg("Error: Transaction was rejected by the user.");
      } else if (msg.includes("balance") || msg.includes("insufficient") || msg.includes("tx_insufficient_balance")) {
        setStatusMsg("Error: Insufficient balance to cover fees.");
      } else if (msg.includes("Already voted") || msg.includes("already voted")) {
        setStatusMsg("Error: You have already voted!");
      } else {
        setStatusMsg("Transaction failed: " + msg.substring(0, 50));
      }
      setTimeout(() => { setStatus(""); setStatusMsg(""); }, 5000);
    }
  };

  const totalVotes = votes.A + votes.B;
  const pctA = totalVotes === 0 ? 0 : Math.round((votes.A / totalVotes) * 100);
  const pctB = totalVotes === 0 ? 0 : Math.round((votes.B / totalVotes) * 100);

  return (
    <div className="app-container">
      <div className="hero-section">
        <h1>Stellar Live Poll</h1>
        <p className="hero-subtitle">The decentralized, verifiable voting platform on Soroban</p>
        
        {!pubKey ? (
          <button className="btn btn-connect" onClick={connectWallet} style={{ fontSize: '1.2rem', padding: '1rem 2.5rem' }}>
            Connect Wallet to Vote
          </button>
        ) : (
          <div className="wallet-dashboard" style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <div className="balance-badge" style={{ background: 'transparent', border: 'none' }}>
              <span className="balance-label">Available Balance</span>
              <span className="balance-value" style={{ fontSize: '1.2rem' }}>{balance} XLM</span>
            </div>
            <button className="btn btn-secondary" title={pubKey}>
              {pubKey.substring(0, 4)}...{pubKey.substring(pubKey.length - 4)}
            </button>
            <button className="btn sponsor-btn" onClick={handleSponsor}>
              ⭐ Sponsor 10 XLM
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
              Verify on Explorer
            </a>
          )}
        </div>
      )}

      <div className="main-layout">
        <div className="cards-grid">
          
          <div className="card glass-panel" style={{ border: '2px solid rgba(139, 92, 246, 0.5)' }}>
            <div className="header-actions">
              <div>
                <h2>
                  Best Smart Contract Language? 
                  <span className="live-badge">LIVE</span>
                </h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: {totalVotes}</p>
              </div>
            </div>

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

          <div className="card glass-panel">
            <div className="header-actions">
              <div>
                <h2>Favorite Web3 Ecosystem?</h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: 42</p>
              </div>
            </div>
            <div className="poll-options">
              <div className="poll-option" onClick={() => { setStatus("pending"); setStatusMsg("Coming soon! Only first poll is live on mainnet."); setTimeout(() => { setStatus(""); setStatusMsg(""); }, 3000); }}>
                <div className="poll-progress" style={{ width: `75%` }}></div>
                <div className="poll-content">
                  <span>Stellar</span>
                  <span className="poll-votes">75% (31)</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => { setStatus("pending"); setStatusMsg("Coming soon! Only first poll is live on mainnet."); setTimeout(() => { setStatus(""); setStatusMsg(""); }, 3000); }}>
                <div className="poll-progress" style={{ width: `25%` }}></div>
                <div className="poll-content">
                  <span>Ethereum</span>
                  <span className="poll-votes">25% (11)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card glass-panel">
            <div className="header-actions">
              <div>
                <h2>Most Promising Hackathon Track?</h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: 128</p>
              </div>
            </div>
            <div className="poll-options">
              <div className="poll-option" onClick={() => { setStatus("pending"); setStatusMsg("Coming soon! Only first poll is live on mainnet."); setTimeout(() => { setStatus(""); setStatusMsg(""); }, 3000); }}>
                <div className="poll-progress" style={{ width: `45%` }}></div>
                <div className="poll-content">
                  <span>DeFi</span>
                  <span className="poll-votes">45% (58)</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => { setStatus("pending"); setStatusMsg("Coming soon! Only first poll is live on mainnet."); setTimeout(() => { setStatus(""); setStatusMsg(""); }, 3000); }}>
                <div className="poll-progress" style={{ width: `55%` }}></div>
                <div className="poll-content">
                  <span>Smart Contracts</span>
                  <span className="poll-votes">55% (70)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card glass-panel">
            <div className="header-actions">
              <div>
                <h2>Preferred Wallet Extension?</h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: 89</p>
              </div>
            </div>
            <div className="poll-options">
              <div className="poll-option" onClick={() => { setStatus("pending"); setStatusMsg("Coming soon! Only first poll is live on mainnet."); setTimeout(() => { setStatus(""); setStatusMsg(""); }, 3000); }}>
                <div className="poll-progress" style={{ width: `60%` }}></div>
                <div className="poll-content">
                  <span>Freighter</span>
                  <span className="poll-votes">60% (53)</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => { setStatus("pending"); setStatusMsg("Coming soon! Only first poll is live on mainnet."); setTimeout(() => { setStatus(""); setStatusMsg(""); }, 3000); }}>
                <div className="poll-progress" style={{ width: `40%` }}></div>
                <div className="poll-content">
                  <span>xBull</span>
                  <span className="poll-votes">40% (36)</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar Feed */}
        <div className="activity-feed glass-panel" style={{ padding: '2rem' }}>
          <h3 style={{ marginBottom: '1.5rem', color: '#e2e8f0' }}>Recent Activity</h3>
          
          <div className="activity-item">
            <div className="activity-avatar">GC</div>
            <div>
              <p style={{ fontWeight: '600' }}>New Vote Cast</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rust (Soroban) • 2 mins ago</p>
            </div>
          </div>
          
          <div className="activity-item">
            <div className="activity-avatar" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>⭐</div>
            <div>
              <p style={{ fontWeight: '600' }}>Platform Sponsor</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>10 XLM Received • 5 mins ago</p>
            </div>
          </div>

          <div className="activity-item">
            <div className="activity-avatar">GB</div>
            <div>
              <p style={{ fontWeight: '600' }}>New Vote Cast</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Solidity • 12 mins ago</p>
            </div>
          </div>

          <div className="activity-item">
            <div className="activity-avatar">XJ</div>
            <div>
              <p style={{ fontWeight: '600' }}>New Vote Cast</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rust (Soroban) • 25 mins ago</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
