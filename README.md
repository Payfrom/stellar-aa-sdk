# Stellar Account Abstraction SDK

This repository contains the Stellar Account Abstraction (AA) SDK, enabling developers to build smart contract-powered accounts on the Stellar network. This project provides a flexible and powerful way to manage digital assets and execute operations with advanced logic beyond standard Stellar accounts, including features like multi-guardian recovery and session keys.

## Project Structure

The repository is organized into several key components:

-   **`contracts/`**: Contains the Soroban smart contracts, primarily the `smart-wallet` contract written in Rust.
-   **`sdk/`**: The TypeScript SDK for interacting with the deployed `smart-wallet` contracts. This is what developers will use to integrate account abstraction into their applications.
-   **`demo/`**: A Next.js application demonstrating the usage of the `sdk`.
-   **`sdk-test/`**: Integration tests for the `sdk`, showcasing its functionality and serving as a practical example.

## For Contributors: Setting up Your Development Environment

To contribute to this project, follow these steps:

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/stellar-aa-sdk.git
    cd stellar-aa-sdk
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Rust Toolchain (for contract development)**:
    If you plan to work on the smart contracts, you'll need the Rust toolchain with `wasm32-unknown-unknown` target. Follow the official Soroban documentation for setting up your Rust environment: [Soroban Docs - Setup](https://soroban.stellar.org/docs/getting-started/setup)

## For Developers: Using the Stellar AA SDK

### WASM Hash for Smart Wallet Contract Deployment

When deploying a new `SmartWallet` instance using the `WalletFactory`, you'll need the WASM hash of the `smart-wallet` contract. This hash identifies the specific compiled contract code on the Soroban network.

**Current WASM hashes for each network:**

-   **Testnet WASM Hash**: `8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0`
-   **Mainnet WASM Hash**: Not yet deployed

You can obtain the WASM hash after deploying your `smart-wallet` contract to a specific network (see [`contracts/smart-wallet/README.md`](./contracts/smart-wallet/README.md) for deployment instructions).

The `sdk/` directory contains the core TypeScript SDK. You can install it in your project via npm or yarn:

```bash
npm add @stellar-aa/sdk
```

### Key Features of the SDK:

-   **`WalletFactory`**: Deploy new `SmartWallet` instances on Soroban.
-   **`SmartWallet`**: Interact with deployed `SmartWallet` contracts, including:
    -   Initializing the wallet with an owner.
    -   Executing arbitrary contract calls (owner-only).
    -   Creating and managing **Session Keys** with spending limits and durations.
    -   Adding and managing **Guardians** for enhanced security.
    -   **Multi-guardian Recovery** to change the wallet owner in case of key loss or compromise.
    -   Viewing wallet state (owner, guardians, session info).

### Basic Usage Example (TypeScript):

```typescript
import { WalletFactory, SmartWallet, StellarSDK } from '@stellar-aa/sdk';

const { Keypair, Networks } = StellarSDK;

// --- Configuration ---
const rpcUrl = "https://soroban-testnet.stellar.org"; // Or your Soroban RPC endpoint
const networkPassphrase = Networks.TESTNET; // Or Networks.STANDALONE, etc.
const wasmHash = "8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0"; // Testnet WASM hash

// --- Setup Keypairs (for demonstration) ---
const ownerKeypair = Keypair.random(); // In a real app, this would come from a user wallet
const sourceKeypair = Keypair.random(); // Account to pay for transactions

// --- Helper: Fund account via Friendbot (Testnet only) ---
async function fundAccount(publicKey: string) {
    console.log(`Funding account ${publicKey.slice(0, 8)}...`);
    const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) {
        throw new Error("Failed to fund account");
    }
    await response.json();
    console.log("Account funded successfully");
    // Wait for account to be available
    await new Promise(resolve => setTimeout(resolve, 3000));
}

// --- Example Functions ---
async function setupAndUseSmartWallet() {
    // 1. Fund the source account (required to pay for deployment)
    console.log("Funding source account...");
    await fundAccount(sourceKeypair.publicKey());

    // 2. Deploy a new Smart Wallet
    console.log("\nDeploying Smart Wallet...");
    const factory = new WalletFactory({ wasmHash, rpcUrl, networkPassphrase });
    const contractId = await factory.createWallet(ownerKeypair.publicKey(), sourceKeypair);
    console.log(`Smart Wallet deployed with Contract ID: ${contractId}`);

    // 3. Interact with the Smart Wallet
    const smartWallet = new SmartWallet({ contractId, rpcUrl, networkPassphrase });

    // Get owner
    const owner = await smartWallet.getOwner();
    console.log(`Smart Wallet Owner: ${owner}`);

    // Create a session key
    console.log("\nCreating session key...");
    const sessionKeypair = Keypair.random();
    await smartWallet.createSession(
        sessionKeypair.publicKey(),
        "10000000", // limit (e.g., 10 XLM in stroops)
        3600,       // duration in seconds (1 hour)
        ownerKeypair // Owner must authorize
    );
    console.log(`Session Key ${sessionKeypair.publicKey()} created.`);

    // Later, execute with session key
    // This example assumes a target contract and function
    // await smartWallet.executeSession(
    //     sessionKeypair.publicKey(),
    //     "OTHER_CONTRACT_ID",
    //     "some_function",
    //     ["arg1", "arg2"],
    //     "100", // amount of operations/value allowed
    //     sessionKeypair // Session key must authorize
    // );
    // console.log("Executed with session key.");

    // Add guardians (guardians must be funded for recovery)
    console.log("\nAdding guardians...");
    const guardian1 = Keypair.random();
    const guardian2 = Keypair.random();

    // Fund guardian accounts (required for them to sign recovery transactions)
    await fundAccount(guardian1.publicKey());
    await fundAccount(guardian2.publicKey());

    await smartWallet.addGuardians(
        [guardian1.publicKey(), guardian2.publicKey()],
        ownerKeypair
    );
    console.log("Guardians added.");

    // Recover wallet with guardians
    console.log("\nInitiating wallet recovery...");
    const newOwnerKeypair = Keypair.random();
    await smartWallet.recover(
        newOwnerKeypair.publicKey(),
        guardian1.publicKey(),
        guardian2.publicKey(),
        guardian1, // Guardian 1 signs
        guardian2  // Guardian 2 signs
    );
    console.log(`Wallet recovered. New owner: ${await smartWallet.getOwner()}`);
}

// Uncomment to run the example:
// setupAndUseSmartWallet().catch(console.error);
```

### Running Tests

The `sdk-test/` directory contains comprehensive integration tests that demonstrate all SDK functionality:

```bash
cd sdk-test
npx ts-node test.ts
```

The test suite covers:
- WalletFactory deployment
- Smart wallet initialization
- Session key creation and management
- Guardian addition and verification
- Multi-guardian wallet recovery
- Persistent test accounts (stored in `test-account.json`)

### More Information

-   For detailed SDK usage, see [`sdk/README.md`](./sdk/README.md).
-   For smart contract details and development, see [`contracts/smart-wallet/README.md`](./contracts/smart-wallet/README.md).
-   For working integration tests, see [`sdk-test/test.ts`](./sdk-test/test.ts).
-   To see a demo application, explore the [`demo/`](./demo) directory.

---
**Note**: This project is under active development. Implementation could change as need arises.
