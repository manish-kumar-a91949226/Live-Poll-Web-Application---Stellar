import pkg from '@stellar/stellar-sdk';
const { Keypair, TransactionBuilder, Networks, Contract, Asset, Operation, rpc, Address } = pkg;
import fs from 'fs';
import fetch from 'node-fetch';

const rpcUrl = "https://soroban-testnet.stellar.org:443";
const networkPassphrase = Networks.TESTNET;
const server = new rpc.Server(rpcUrl);

async function main() {
    console.log("Generating keypair...");
    const keypair = Keypair.random();
    console.log("Public Key:", keypair.publicKey());
    console.log("Secret Key:", keypair.secret());

    console.log("Funding account via Friendbot...");
    await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);

    // Wait a bit for the account to be created
    await new Promise(r => setTimeout(r, 5000));

    console.log("Loading account...");
    let account = await server.getAccount(keypair.publicKey());

    console.log("Uploading WASM...");
    const wasm = fs.readFileSync('./target/wasm32-unknown-unknown/release/backend.wasm');

    let uploadOp = Operation.uploadContractWasm({ wasm });

    let tx = new TransactionBuilder(account, { fee: "100000", networkPassphrase })
        .addOperation(uploadOp)
        .setTimeout(30)
        .build();
    
    tx = await server.prepareTransaction(tx);
    tx.sign(keypair);

    console.log("Submitting WASM upload transaction...");
    let sendResult = await server.sendTransaction(tx);
    
    if (sendResult.status === "ERROR") {
        console.error("Upload failed", sendResult);
        return;
    }

    let status = "PENDING";
    let getTxResult;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        getTxResult = await server.getTransaction(sendResult.hash);
        status = getTxResult.status;
        if (status !== "NOT_FOUND" && status !== "PENDING") break;
    }

    if (status !== "SUCCESS") {
        console.error("Upload transaction failed", getTxResult);
        return;
    }

    console.log("returnValue:", getTxResult.returnValue);
    // Extract the wasm id
    let wasmId = getTxResult.returnValue._value;
    if (Buffer.isBuffer(wasmId)) {
        wasmId = wasmId.toString('hex');
    } else if (getTxResult.returnValue.bytes) {
        wasmId = getTxResult.returnValue.bytes().toString('hex');
    }
    console.log("WASM uploaded with ID:", wasmId);

    // Now instantiate the contract
    account = await server.getAccount(keypair.publicKey());

    let createOp = Operation.createCustomContract({
        address: new pkg.Address(keypair.publicKey()),
        wasmHash: Buffer.from(wasmId, 'hex')
    });

    let tx2 = new TransactionBuilder(account, { fee: "100000", networkPassphrase })
        .addOperation(createOp)
        .setTimeout(30)
        .build();

    tx2 = await server.prepareTransaction(tx2);
    tx2.sign(keypair);

    console.log("Submitting instantiation transaction...");
    let sendResult2 = await server.sendTransaction(tx2);

    let status2 = "PENDING";
    let getTxResult2;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        getTxResult2 = await server.getTransaction(sendResult2.hash);
        status2 = getTxResult2.status;
        if (status2 !== "NOT_FOUND" && status2 !== "PENDING") break;
    }

    if (status2 !== "SUCCESS") {
        console.error("Instantiation failed", getTxResult2);
        return;
    }

    // Initialize the contract state
    const contractIdStr = pkg.scValToNative(getTxResult2.returnValue);
    console.log("Contract deployed! ID:", contractIdStr);
    const contractId = contractIdStr;

    // Call init
    account = await server.getAccount(keypair.publicKey());
    let initOp = Operation.invokeContractFunction({
        contract: contractId,
        function: 'init',
        args: []
    });

    let tx3 = new TransactionBuilder(account, { fee: "100000", networkPassphrase })
        .addOperation(initOp)
        .setTimeout(30)
        .build();

    tx3 = await server.prepareTransaction(tx3);
    tx3.sign(keypair);

    let sendResult3 = await server.sendTransaction(tx3);
    let status3 = "PENDING";
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        let res = await server.getTransaction(sendResult3.hash);
        status3 = res.status;
        if (status3 !== "NOT_FOUND" && status3 !== "PENDING") break;
    }
    
    console.log("Contract initialized!");

    fs.writeFileSync('./contract_info.json', JSON.stringify({
        contractId,
        deployer: keypair.publicKey(),
        secret: keypair.secret()
    }, null, 2));
    console.log("Wrote contract_info.json");
}

main().catch(console.error);
