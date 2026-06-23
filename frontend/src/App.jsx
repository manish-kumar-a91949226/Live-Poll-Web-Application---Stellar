import { useState, useEffect } from 'react';
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { getPollVotes, buildVoteTransaction, buildVoteFeeTransaction, buildSponsorTransaction, server, NETWORK_PASSPHRASE, getNativeBalance, TransactionBuilder } from './stellar';
import './App.css';

function App() {
  const [pubKey, setPubKey] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [status, setStatus] = useState(""); // pending, success, danger
  const [statusMsg, setStatusMsg] = useState("");
  const [txHash, setTxHash] = useState("");
  const [votes, setVotes] = useState({
    1: { A: 0, B: 0 },
    2: { A: 0, B: 0 },
    3: { A: 0, B: 0 },
    4: { A: 0, B: 0 }
  });

  const fetchVotes = async () => {
    const newVotes = { ...votes };
    for (let i = 1; i <= 4; i++) {
      newVotes[i] = await getPollVotes(i);
    }
    setVotes(newVotes);
  };

  useEffect(() => {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: defaultModules(),
    });

    fetchVotes();
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

  const handleVote = async (pollId, optionStr) => {
    if (!pubKey) {
      setStatus("danger");
      setStatusMsg("Please connect your wallet first.");
      return;
    }

    try {
      setStatus("pending");
      setTxHash("");

      // STEP 1: Pay 1 XLM Fee
      setStatusMsg("Step 1/2: Please sign the 1 XLM Fee transaction...");
      const feeTx = await buildVoteFeeTransaction(pubKey);
      
      const { signedTxXdr: signedFeeTx } = await StellarWalletsKit.signTransaction(feeTx, {
        networkPassphrase: NETWORK_PASSPHRASE
      });

      setStatusMsg("Submitting fee transaction to network...");
      const parsedFeeTx = TransactionBuilder.fromXDR(signedFeeTx, NETWORK_PASSPHRASE);
      const feeTxResult = await server.sendTransaction(parsedFeeTx); 

      if (feeTxResult.status === "ERROR") throw new Error("Fee transaction failed on network");

      let feeStatus = feeTxResult.status;
      while (feeStatus === "PENDING") {
          await new Promise(r => setTimeout(r, 2000));
          const res = await server.getTransaction(feeTxResult.hash);
          feeStatus = res.status;
          if (feeStatus === "FAILED") throw new Error("Fee transaction execution failed");
      }

      // STEP 2: Cast the Vote
      setStatusMsg("Step 2/2: Please sign the Smart Contract Vote transaction...");
      const optionNum = optionStr === 'A' ? 1 : 2;
      const voteTx = await buildVoteTransaction(pubKey, optionNum, pollId);
      
      let xdrString = voteTx;
      if (typeof voteTx !== 'string') {
        if (typeof voteTx.toXDR === 'function') xdrString = voteTx.toXDR();
        else if (typeof voteTx.toEnvelope === 'function') xdrString = voteTx.toEnvelope().toXDR('base64');
      }

      const { signedTxXdr: signedVoteTx } = await StellarWalletsKit.signTransaction(xdrString, {
        networkPassphrase: NETWORK_PASSPHRASE
      });

      setStatusMsg("Submitting vote transaction to network...");
      const parsedVoteTx = TransactionBuilder.fromXDR(signedVoteTx, NETWORK_PASSPHRASE);
      const voteTxResult = await server.sendTransaction(parsedVoteTx); 

      if (voteTxResult.status === "ERROR") throw new Error("Vote transaction failed on network");

      let voteStatus = voteTxResult.status;
      while (voteStatus === "PENDING") {
          await new Promise(r => setTimeout(r, 2000));
          const res = await server.getTransaction(voteTxResult.hash);
          voteStatus = res.status;
          if (voteStatus === "FAILED") throw new Error("Vote transaction execution failed");
      }

      setStatus("success");
      setStatusMsg(`Vote cast for Option ${optionStr} successfully!`);
      setTxHash(voteTxResult.hash);
      
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
      } else {
        setStatusMsg("Transaction failed: " + msg.substring(0, 50));
      }
      setTimeout(() => { setStatus(""); setStatusMsg(""); }, 5000);
    }
  };

  const getPollStats = (pollId) => {
    const v = votes[pollId] || { A: 0, B: 0 };
    const total = v.A + v.B;
    return {
      A: v.A,
      B: v.B,
      total,
      pctA: total === 0 ? 0 : Math.round((v.A / total) * 100),
      pctB: total === 0 ? 0 : Math.round((v.B / total) * 100)
    };
  };

  const poll1 = getPollStats(1);
  const poll2 = getPollStats(2);
  const poll3 = getPollStats(3);
  const poll4 = getPollStats(4);

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
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: {poll1.total}</p>
              </div>
            </div>

            <div className="poll-options">
              <div className="poll-option" onClick={() => handleVote(1, 'A')}>
                <div className="poll-progress" style={{ width: `${poll1.pctA}%` }}></div>
                <div className="poll-content">
                  <span>Rust (Soroban) <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll1.pctA}% ({poll1.A})</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => handleVote(1, 'B')}>
                <div className="poll-progress" style={{ width: `${poll1.pctB}%` }}></div>
                <div className="poll-content">
                  <span>Solidity <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll1.pctB}% ({poll1.B})</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card glass-panel" style={{ border: '2px solid rgba(139, 92, 246, 0.5)' }}>
            <div className="header-actions">
              <div>
                <h2>
                  Favorite Web3 Ecosystem?
                  <span className="live-badge">LIVE</span>
                </h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: {poll2.total}</p>
              </div>
            </div>
            <div className="poll-options">
              <div className="poll-option" onClick={() => handleVote(2, 'A')}>
                <div className="poll-progress" style={{ width: `${poll2.pctA}%` }}></div>
                <div className="poll-content">
                  <span>Stellar <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll2.pctA}% ({poll2.A})</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => handleVote(2, 'B')}>
                <div className="poll-progress" style={{ width: `${poll2.pctB}%` }}></div>
                <div className="poll-content">
                  <span>Ethereum <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll2.pctB}% ({poll2.B})</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card glass-panel" style={{ border: '2px solid rgba(139, 92, 246, 0.5)' }}>
            <div className="header-actions">
              <div>
                <h2>
                  Most Promising Hackathon Track?
                  <span className="live-badge">LIVE</span>
                </h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: {poll3.total}</p>
              </div>
            </div>
            <div className="poll-options">
              <div className="poll-option" onClick={() => handleVote(3, 'A')}>
                <div className="poll-progress" style={{ width: `${poll3.pctA}%` }}></div>
                <div className="poll-content">
                  <span>DeFi <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll3.pctA}% ({poll3.A})</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => handleVote(3, 'B')}>
                <div className="poll-progress" style={{ width: `${poll3.pctB}%` }}></div>
                <div className="poll-content">
                  <span>Smart Contracts <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll3.pctB}% ({poll3.B})</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card glass-panel" style={{ border: '2px solid rgba(139, 92, 246, 0.5)' }}>
            <div className="header-actions">
              <div>
                <h2>
                  Preferred Wallet Extension?
                  <span className="live-badge">LIVE</span>
                </h2>
                <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>Total votes cast: {poll4.total}</p>
              </div>
            </div>
            <div className="poll-options">
              <div className="poll-option" onClick={() => handleVote(4, 'A')}>
                <div className="poll-progress" style={{ width: `${poll4.pctA}%` }}></div>
                <div className="poll-content">
                  <span>Freighter <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll4.pctA}% ({poll4.A})</span>
                </div>
              </div>
              <div className="poll-option" onClick={() => handleVote(4, 'B')}>
                <div className="poll-progress" style={{ width: `${poll4.pctB}%` }}></div>
                <div className="poll-content">
                  <span>xBull <span style={{fontSize: "0.8rem", color: "var(--primary-color)"}}>(Fee: 1 XLM)</span></span>
                  <span className="poll-votes">{poll4.pctB}% ({poll4.B})</span>
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
