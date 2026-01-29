# Smart Wallet Soroban Contract

This directory contains the Rust source code for the `smart-wallet` Soroban smart contract. This contract implements account abstraction for the Stellar network using Stellar's `CustomAccountInterface` and `__check_auth` pattern, enabling universal compatibility with the entire Soroban ecosystem.

## Architecture

### __check_auth Pattern

This contract uses Stellar's recommended `__check_auth` pattern instead of execute forwarding:

**How it works:**
1. User calls any Soroban contract (DEX, token, lending, etc.)
2. That contract calls `require_auth(smart_wallet_address)`
3. Stellar automatically invokes this contract's `__check_auth` function
4. The contract verifies the signature (owner or session key)
5. Transaction proceeds if authorized

**Benefits:**
- ✅ Works with **100%** of Soroban ecosystem
- ✅ No special integration needed by protocols
- ✅ Secure - explicit authorizations only
- ✅ Standards compliant (`CustomAccountInterface`)

## Features

The `smart-wallet` contract provides:

- **Owner Management**: Single owner with Ed25519 signature verification
- **Session Keys**: Temporary keys with spending limits and expiration, enabling delegated operations without full key exposure
- **Guardian System**: Social recovery with 2-of-N guardian signatures
- **Universal Compatibility**: Works with ANY Soroban contract using `require_auth()`
- **Secure Authentication**: Uses `__check_auth` with on-chain public key verification

## Contract Methods

### Initialization

```rust
pub fn initialize(env: Env, owner: Address, owner_pubkey: BytesN<32>)
```
Initializes the wallet with an `owner` address and their Ed25519 public key. Can only be called once.

### Session Management

```rust
pub fn create_session(
    env: Env,
    key: Address,
    key_pubkey: BytesN<32>,
    limit: i128,
    duration: u64
) -> Result<(), Error>
```
Creates a session key with spending `limit` and `duration` (seconds). Stores the session key's public key for signature verification. Only callable by owner.

```rust
pub fn revoke_session(env: Env, key: Address) -> Result<(), Error>
```
Revokes a session key. Only callable by owner.

```rust
pub fn get_session(env: Env, key: Address) -> Option<Session>
```
Returns session details (view function).

### Guardian Management

```rust
pub fn add_guardians(env: Env, addresses: Vec<Address>) -> Result<(), Error>
```
Adds guardians for social recovery. Only callable by owner.

```rust
pub fn get_guardians(env: Env) -> Vec<Address>
```
Returns list of guardian addresses (view function).

```rust
pub fn recover(
    env: Env,
    new_owner: Address,
    new_owner_pubkey: BytesN<32>,
    guardian1: Address,
    guardian2: Address
) -> Result<(), Error>
```
Changes wallet owner to `new_owner`. Requires signatures from 2 guardians.

### View Functions

```rust
pub fn get_owner(env: Env) -> Result<Address, Error>
```
Returns current owner address.

### Authorization (Automatic)

```rust
fn __check_auth(
    env: Env,
    signature_payload: Hash<32>,
    signature: BytesN<64>,
    auth_contexts: Vec<Context>
) -> Result<(), Error>
```
Automatically called by Stellar when any contract calls `require_auth()` on this wallet. Verifies Ed25519 signatures against stored public keys (owner or session keys). **You don't call this directly** - Stellar invokes it automatically.

## Errors

The contract defines the following custom errors:

- `NotOwner`: Caller is not the wallet owner
- `NotInitialized`: Contract has not been initialized
- `AlreadyInitialized`: Contract has already been initialized
- `Unauthorized`: Signature verification failed
- `SessionExpired`: The session key has expired
- `SessionLimitExceeded`: The session key's spending limit has been reached
- `InvalidSession`: The provided session key is not valid
- `InsufficientGuardians`: Not enough guardians provided for recovery

## Building and Deploying

### Prerequisites

You need the Soroban CLI and Rust toolchain. See [Soroban Docs - Getting Started](https://soroban.stellar.org/docs/getting-started/setup).

### Build

Navigate to this directory (`contracts/smart-wallet`) and run:

```bash
stellar contract build
```

Or manually:

```bash
cargo build --target wasm32-unknown-unknown --release
```

This generates the WASM file in `target/wasm32-unknown-unknown/release/smart_wallet.wasm`.

### Deploy to Testnet

```bash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet.wasm \
  --source YOUR_STELLAR_ACCOUNT \
  --network testnet
```

This returns a WASM hash that you'll use in the SDK's `WalletFactory`.

**Current v2 Testnet WASM Hash**: `d6ab7a7ab47085df18aa8c526581d24a792b232f84f04ac3d85d4ee519a70eb0`

### Deploy to Mainnet

```bash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet.wasm \
  --source YOUR_STELLAR_ACCOUNT \
  --network mainnet
```

## Usage with SDK

After deploying, use the WASM hash with the TypeScript SDK:

```typescript
import { WalletFactory } from 'stellar-aa-sdk';

const factory = new WalletFactory({
  wasmHash: 'd6ab7a7ab47085df18aa8c526581d24a792b232f84f04ac3d85d4ee519a70eb0',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

const contractId = await factory.createWallet(ownerKeypair, sourceKeypair);
```

See the [SDK README](../../sdk/README.md) for complete usage examples.

## Why v2?

This v2 implementation fixes critical issues from v1:

| Feature | v1 (execute) | v2 (__check_auth) |
|---------|--------------|-------------------|
| Architecture | execute forwarding | CustomAccountInterface |
| Ecosystem compatibility | ~5% | **100%** |
| Works with SAC tokens | ❌ | ✅ |
| Works with DEXs | ❌ | ✅ |
| Standards compliant | ❌ | ✅ |
| Security | Risky | Secure |

**v2 implements Stellar's recommended patterns for universal ecosystem compatibility.**

## Contract Size

The contract is **~270 lines** of clean, focused code with zero external dependencies beyond the Soroban SDK.

## Testing

We use SDK integration tests instead of Rust unit tests for better real-world validation. See [sdk-test/test.ts](../../sdk-test/test.ts).

## Resources

- [Stellar Smart Wallets](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Contract Authorization](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)
- [CustomAccountInterface](https://developers.stellar.org/docs/build/guides/contract-accounts/custom-account)
- [OpenZeppelin Examples](https://github.com/OpenZeppelin/stellar-contracts)
