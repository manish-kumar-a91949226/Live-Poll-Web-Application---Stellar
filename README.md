# Stellar Live Poll - Level 2

A multi-wallet decentralized application that allows users to cast votes on a smart contract deployed to the Stellar Testnet. This project demonstrates wallet integration, real-time sync, and smart contract interaction.

## Features
- **Multi-Wallet Support:** Users can connect using their preferred wallet (Freighter, Albedo, xBull, etc.) through `@creit.tech/stellar-wallets-kit`.
- **Stellar Smart Contract (Soroban):** Written in Rust and deployed to the Testnet. Ensures only one vote per wallet and tracks live totals securely on-chain.
- **Real-Time Data Sync:** The frontend fetches and synchronizes vote tallies from the chain automatically.
- **Transaction Status UI:** Distinct banners to communicate the state of transactions: `Pending`, `Success`, or `Failed`.
- **Robust Error Handling:** Specifically handles errors such as missing extensions, user rejection, and insufficient balance.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- A Stellar Testnet wallet (e.g., Freighter extension installed)

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Run Locally
```bash
npm run dev
```

Visit `http://localhost:5173` to view the live poll.

## Deployed Contract Information
- **Network:** Stellar Testnet
- **Contract ID:** `CALMB3XPIMAG63YDARE52FJXIITT3RUB3JWC4ZRKZKS7BYJZZ2MF2VHR`
- **Transaction Hash (Upload):** `(See on testnet explorer)`
- **Transaction Hash (Contract Initialization):** `(See on testnet explorer)`

## Error Handling Demonstrated
1. **Wallet Not Found:** If no wallet extensions are installed, attempting to connect will throw a user-friendly error instructing them to install a wallet.
2. **User Rejected:** If the user declines the signature request in their wallet, a specific error UI is displayed.
3. **Insufficient Balance:** Attempting to cast a vote without enough XLM to pay the fee will catch the network error and tell the user they need more testnet funds.

## Screenshots

![Wallet Options Available](https://via.placeholder.com/600x400.png?text=Wallet+Options)

*Example placeholder for wallet options screenshot*
