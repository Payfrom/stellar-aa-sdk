# SDK for Stellar Account Abstraction Smart Wallet

This package provides the TypeScript SDK for interacting with the Stellar Account Abstraction (AA) Smart Wallet contract on Soroban. It simplifies the process of deploying new smart wallets, managing their ownership, setting up session keys, adding guardians, and facilitating recovery.

## Installation

You can install the SDK using npm:

```bash
npm install stellar-aa-sdk
```

## Usage

The SDK primarily exposes two main classes: `WalletFactory` for deploying new smart wallets and `SmartWallet` for interacting with existing deployed wallets.

### Account Funding Requirements

Before using the SDK, ensure the following accounts are funded:

1. **Source Account** - Required to pay for wallet deployment and owner operations
2. **Guardian Accounts** - Required if you plan to use the recovery feature (guardians must sign recovery transactions)

For testnet, you can use [Friendbot](https://friendbot.stellar.org) to fund accounts. See examples below.

### `WalletFactory`

Used to deploy new instances of the `SmartWallet` contract.

#### Constructor

`new WalletFactory(config: FactoryConfig)`

-   `config`: An object containing:
    -   `wasmHash`: The WASM hash of the `smart-wallet` contract to deploy.
        -   **Testnet WASM Hash**: `8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0`
        -   **Mainnet WASM Hash**: `MAINNET_WASM_HASH_HERE` (Not available yet)
        
        You can obtain the WASM hash after deploying your `smart-wallet` contract to a specific network (see [`contracts/smart-wallet/README.md`](../contracts/smart-wallet/README.md) for deployment instructions).
    -   `rpcUrl`: The URL of the Soroban RPC server.
    -   `networkPassphrase`: The network passphrase (e.g., `Networks.TESTNET`).

#### Methods

##### `createWallet(ownerPublicKey: string, sourceKeypair: StellarSDK.Keypair): Promise<string>`

Deploys a new `SmartWallet` contract and initializes it with the specified `ownerPublicKey`.

-   `ownerPublicKey`: The public key of the account that will be the initial owner of the smart wallet.
-   `sourceKeypair`: A `StellarSDK.Keypair` of an account that will pay for the deployment transaction and sign it. This account needs to be funded.
-   Returns: A `Promise` that resolves to the `contractId` of the newly deployed smart wallet.

**Example:**

```typescript
import { WalletFactory, StellarSDK } from 'stellar-aa-sdk';

const { Keypair, Networks } = StellarSDK;

const rpcUrl = "https://soroban-testnet.stellar.org";
const networkPassphrase = Networks.TESTNET;
const wasmHash = "8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0"; // Testnet WASM hash

// Helper to fund account via Friendbot (Testnet only)
async function fundAccount(publicKey: string) {
    const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) throw new Error("Failed to fund account");
    await response.json();
    await new Promise(resolve => setTimeout(resolve, 3000));
}

async function deployNewWallet() {
    const factory = new WalletFactory({ wasmHash, rpcUrl, networkPassphrase });

    const ownerKeypair = Keypair.random();
    const sourceKeypair = Keypair.random();

    // Fund the source account (required to pay for deployment)
    await fundAccount(sourceKeypair.publicKey());

    console.log("Deploying wallet for owner:", ownerKeypair.publicKey());
    const contractId = await factory.createWallet(ownerKeypair.publicKey(), sourceKeypair);
    console.log("Deployed Smart Wallet with ID:", contractId);

    return { contractId, ownerKeypair };
}

// deployNewWallet().catch(console.error);
```

### `SmartWallet`

Used to interact with an already deployed `SmartWallet` contract.

#### Constructor

`new SmartWallet(config: WalletConfig)`

-   `config`: An object containing:
    -   `contractId`: The contract ID of the deployed `SmartWallet`.
    -   `rpcUrl`: The URL of the Soroban RPC server.
    -   `networkPassphrase`: The network passphrase.

#### Methods

##### Owner Operations

These operations require the `sourceKeypair` to be the current owner of the `SmartWallet`.

-   `initialize(ownerPublicKey: string, sourceKeypair: StellarSDK.Keypair): Promise<GetTransactionResponse>`
    Initializes the wallet. This should only be called once after deployment. `WalletFactory.createWallet` handles this automatically.

-   `execute(targetContractId: string, functionName: string, args: unknown[], sourceKeypair: StellarSDK.Keypair): Promise<GetTransactionResponse>`
    Allows the `SmartWallet` owner to execute an arbitrary function on another Soroban contract.

-   `addGuardians(guardianAddresses: string[], sourceKeypair: StellarSDK.Keypair): Promise<GetTransactionResponse>`
    Adds new public keys to the list of guardians for recovery.

##### Session Operations

-   `createSession(sessionKeyPublicKey: string, limit: string, durationSeconds: number, sourceKeypair: StellarSDK.Keypair): Promise<GetTransactionResponse>`
    Creates a new session key with a defined spending `limit` (in stroops) and `durationSeconds`. The `sourceKeypair` must be the owner.

-   `executeSession(sessionKeyPublicKey: string, targetContractId: string, functionName: string, args: unknown[], amount: string, sourceKeypair: StellarSDK.Keypair): Promise<GetTransactionResponse>`
    Executes a contract call using a session key. The `sourceKeypair` must be the session keypair. The `amount` represents the value being spent against the session's limit.

##### Recovery Operations

-   `recover(newOwnerPublicKey: string, guardian1PublicKey: string, guardian2PublicKey: string, guardian1Keypair: StellarSDK.Keypair, guardian2Keypair: StellarSDK.Keypair): Promise<GetTransactionResponse>`
    Recovers the wallet by setting a `newOwnerPublicKey`. This requires two guardians to sign the transaction. The method uses Soroban's authorization framework with `authorizeEntry` to properly sign multi-party auth requirements.

##### View Functions (Read-only)

These methods perform simulations and do not require transaction signing.

-   `getOwner(): Promise<string>`
    Returns the public key of the current owner of the `SmartWallet`.

-   `getGuardians(): Promise<string[]>`
    Returns an array of public keys of the registered guardians.

-   `getSession(sessionKeyPublicKey: string): Promise<Session | null>`
    Returns the details of a specific session key, or `null` if not found.

### Example Usage (Continued from Factory Deployment)

```typescript
import { SmartWallet, StellarSDK } from 'stellar-aa-sdk';

// Assuming contractId and ownerKeypair are obtained from WalletFactory.createWallet()
const { contractId, ownerKeypair } = await deployNewWallet(); // Call the example from above

const rpcUrl = "https://soroban-testnet.stellar.org";
const networkPassphrase = StellarSDK.Networks.TESTNET;

async function interactWithWallet(contractId: string, ownerKeypair: StellarSDK.Keypair) {
    const smartWallet = new SmartWallet({ contractId, rpcUrl, networkPassphrase });

    console.log("\n--- Interacting with Smart Wallet ---");

    // Get Owner
    const owner = await smartWallet.getOwner();
    console.log("Current Owner:", owner);

    // Add Guardians
    // NOTE: Guardian accounts must be funded before they can sign recovery transactions
    const guardian1Keypair = StellarSDK.Keypair.random();
    const guardian2Keypair = StellarSDK.Keypair.random();

    // Fund guardians (required for recovery)
    await fundAccount(guardian1Keypair.publicKey());
    await fundAccount(guardian2Keypair.publicKey());

    await smartWallet.addGuardians(
        [guardian1Keypair.publicKey(), guardian2Keypair.publicKey()],
        ownerKeypair
    );
    console.log("Guardians added:", await smartWallet.getGuardians());

    // Create Session
    const sessionKeypair = StellarSDK.Keypair.random();
    await smartWallet.createSession(
        sessionKeypair.publicKey(),
        "5000000", // 5 XLM limit
        3600,      // 1 hour duration
        ownerKeypair
    );
    console.log("Session created for:", sessionKeypair.publicKey());
    console.log("Session info:", await smartWallet.getSession(sessionKeypair.publicKey()));

    // Recover Wallet
    const newOwnerKeypair = StellarSDK.Keypair.random();
    console.log("Initiating recovery with new owner:", newOwnerKeypair.publicKey());
    await smartWallet.recover(
        newOwnerKeypair.publicKey(),
        guardian1Keypair.publicKey(),
        guardian2Keypair.publicKey(),
        guardian1Keypair,
        guardian2Keypair
    );
    console.log("Wallet recovered. New owner is:", await smartWallet.getOwner());
}

// interactWithWallet(contractId, ownerKeypair).catch(console.error);
```

## Types and Utilities

The SDK also re-exports `StellarSDK` for convenience and provides utility functions from `soroban-utils.ts` for common Soroban transaction patterns, although these are mostly used internally by `SmartWallet` and `WalletFactory`. Key types like `Session`, `WalletConfig`, and `FactoryConfig` are also exported.

---
**Note**: For a complete working example, refer to the [`sdk-test/test.ts`](../sdk-test/test.ts) file, which demonstrates the full lifecycle and interaction patterns.