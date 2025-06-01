

import {
    ComputeBudgetProgram,
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    TransactionInstructionCtorFields,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { assert } from "chai";

const signerSeed = JSON.parse(process.env.SIGNER);
const programSeed = require("../ASM17t4PaGg88b4w8pmHamdH37wuf1u6vUpKQEVui5aE.json");

const programKeypair = Keypair.fromSecretKey(new Uint8Array(programSeed));
const program = programKeypair.publicKey;

const connection = new Connection("http://127.0.0.1:8899", {
    commitment: "confirmed"
});

const signer = Keypair.fromSecretKey(new Uint8Array(signerSeed));

const senderKeypair = Keypair.generate();
const receiverKeypair = Keypair.generate();
const sender = senderKeypair.publicKey;
const receiver = receiverKeypair.publicKey;

const confirm = async (signature: string): Promise<string> => {
    const block = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
        signature,
        ...block
    });
    return signature;
};

const getLogs = async (signature: string): Promise<string[]> => {
    const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
    });
    return tx?.meta?.logMessages ?? [];
};


function extractComputeUnits(logs: string[]): number | null {
    for (const log of logs) {
        const match = log.match(/consumed (\d+) of \d+ compute units/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }
    return null;
}


const signAndSend = async (tx: Transaction, signers: Keypair[] = [senderKeypair]): Promise<string> => {
    try {
        const block = await connection.getLatestBlockhash();
        tx.recentBlockhash = block.blockhash;
        tx.lastValidBlockHeight = block.lastValidBlockHeight;
        tx.feePayer = signer.publicKey;
        tx.partialSign(signer);
        tx.partialSign(...signers);
        const signature = await connection.sendTransaction(tx, [signer, ...signers], { skipPreflight: false });
        return signature;
    } catch (error) {
        console.error("Transaction failed:", error);
        throw error;
    }
};

const airdrop = async (pubkey: PublicKey, sol = 10): Promise<void> => {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: sig, ...await connection.getLatestBlockhash() }, "confirmed");
};


const createProgramAccount = async (keypair: Keypair, initialLamports: number): Promise<void> => {
    const tx = new Transaction();
    tx.add(
        SystemProgram.createAccount({
            fromPubkey: signer.publicKey,
            newAccountPubkey: keypair.publicKey,
            lamports: initialLamports,
            space: 0,
            programId: program,
        })
    );

    const signature = await signAndSend(tx, [keypair]);
    await confirm(signature);
};


const transferTx = (amount: number): Transaction => {
    const tx = new Transaction();

    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(amount));

    tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }),
        new TransactionInstruction({
            keys: [
                {
                    pubkey: sender,
                    isSigner: true,
                    isWritable: true
                },
                {
                    pubkey: receiver,
                    isSigner: false,
                    isWritable: true
                }
            ],
            programId: program,
            data: buf
        } as TransactionInstructionCtorFields)
    );

    return tx;
};

const toLogHex = (value: number | bigint): string => {
    const hex = BigInt(value).toString(16);
    return `Program log: 0x${hex}, 0x0, 0x0, 0x0, 0x0`;
};

describe("Transfer tests", function () {
    this.timeout(0);

    before(async () => {
        await airdrop(signer.publicKey, 10);

        await createProgramAccount(senderKeypair, 1000000);
        await createProgramAccount(receiverKeypair, 1000000);

        const senderAccount = await connection.getAccountInfo(sender);
        const receiverAccount = await connection.getAccountInfo(receiver);

        assert(senderAccount, "Sender account not initialized");
        assert(receiverAccount, "Receiver account not initialized");
        assert.equal(
            senderAccount.owner.toBase58(),
            program.toBase58(),
            "Sender not owned by your program"
        );
        assert.equal(
            receiverAccount.owner.toBase58(),
            program.toBase58(),
            "Receiver not owned by your program"
        );
    });

    it("transfers 100 lamports", async () => {
        const logs = await signAndSend(transferTx(100))
            .then(confirm)
            .then(getLogs);

        const cuUsed = extractComputeUnits(logs);
        console.log(`Compute units used for 100 lamports transfer: ${cuUsed ?? 'unknown'}`);

        assert.include(logs, toLogHex(100), "Expected log for 100 lamports transfer");
    });

    it("transfers 1000 lamports", async () => {
        const logs = await signAndSend(transferTx(1000))
            .then(confirm)
            .then(getLogs);

        const cuUsed = extractComputeUnits(logs);
        console.log(`Compute units used for 1000 lamports transfer: ${cuUsed ?? 'unknown'}`);

        assert.include(logs, toLogHex(1000), "Expected log for 1000 lamports transfer");
    });

    it("transfers 100_000 lamports", async () => {
        const logs = await signAndSend(transferTx(100_000))
            .then(confirm)
            .then(getLogs);

        const cuUsed = extractComputeUnits(logs);
        console.log(`Compute units used for 100000 lamports transfer: ${cuUsed ?? 'unknown'}`);

        assert.include(logs, toLogHex(100_000), "Expected log for 100_000 lamports transfer");
    });
});
