# Smart Wallet Soroban Contract

This directory contains the Rust source code for the `smart-wallet` Soroban smart contract. This contract implements account abstraction functionalities for the Stellar network, allowing for advanced wallet logic such as multi-signature recovery and session key management.

## Features

The `smart-wallet` contract provides the following key functionalities:

-   **Owner Management**: A single owner can control the wallet.
-   **Session Keys**: Create temporary keys with granular control over spending limits and durations, enabling delegated operations without full key exposure.
-   **Guardian System**: Designate multiple guardians who can collectively initiate a recovery process to change the wallet's owner.
-   **Arbitrary Contract Execution**: The owner can execute any Soroban contract call through the smart wallet.
-   **Recovery Mechanism**: Requires a predefined number of guardian signatures (currently 2) to change the wallet's owner.

## Contract Methods

The contract exposes the following public methods:

-   `initialize(env: Env, owner: Address)`:
    Initializes the wallet with an initial `owner` address. Can only be called once.

-   `execute(env: Env, target: Address, function: Symbol, args: Vec<Val>) -> Result<Val, Error>`:
    Allows the wallet `owner` to invoke a function on a `target` contract with specified `args`.

-   `create_session(env: Env, key: Address, limit: i128, duration: u64) -> Result<(), Error>`:
    Creates a new session key (`key`) with a `limit` (amount in stroops) and `duration` (in seconds). Only callable by the wallet owner.

-   `execute_session(env: Env, key: Address, target: Address, function: Symbol, args: Vec<Val>, amount: i128) -> Result<Val, Error>`:
    Executes a function on a `target` contract using a previously created `session key`. Checks for session expiration and spending limits against the `amount`.

-   `add_guardians(env: Env, addresses: Vec<Address>) -> Result<(), Error>`:
    Adds a list of `addresses` to the contract's guardian list. Only callable by the wallet owner.

-   `recover(env: Env, new_owner: Address, guardian1: Address, guardian2: Address) -> Result<(), Error>`:
    Changes the wallet's owner to `new_owner`. This method requires authorization from two specified guardians (`guardian1` and `guardian2`).

-   `get_owner(env: Env) -> Result<Address, Error>` (View function):
    Returns the current owner's address.

-   `get_guardians(env: Env) -> Vec<Address>` (View function):
    Returns a list of registered guardian addresses.

-   `get_session(env: Env, key: Address) -> Option<Session>` (View function):
    Returns the details of a specific session key, if it exists.

## Errors

The contract defines the following custom errors:

-   `NotOwner`: Caller is not the wallet owner.
-   `NotInitialized`: Contract has not been initialized.
-   `AlreadyInitialized`: Contract has already been initialized.
-   `SessionExpired`: The session key has expired.
-   `SessionLimitExceeded`: The session key's spending limit has been reached.
-   `InvalidSession`: The provided session key is not valid.
-   `InsufficientGuardians`: Not enough guardians provided for recovery, or provided addresses are not guardians.

## Building and Deploying

To build and deploy this smart contract, you will need the Soroban SDK CLI and Rust toolchain set up. Refer to the official Soroban documentation for detailed instructions: [Soroban Docs - Getting Started](https://soroban.stellar.org/docs/getting-started/setup)

### Build

Navigate to this directory (`contracts/smart-wallet`) and run the following command to build the WASM file:

```bash
stellar contract build
```

This will generate a `.wasm` file in the `target/wasm32v1-none/release/` directory.

### Deploy

Once built, you can deploy the contract to a Soroban network using the `stellar contract deploy` command. You will need a funded account and access to a Soroban RPC endpoint.

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/smart_wallet.wasm \
  --source-account <account_name> \
  --network testnet
```

This will return a WASM hash (e.g., `8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0`). The WASM hash is what you'll use when initializing the `WalletFactory` in the SDK to deploy multiple wallet instances from the same contract code.

**Current Testnet WASM Hash**: `8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0`
