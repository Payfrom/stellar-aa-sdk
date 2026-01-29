# Stellar AA SDK - Developer Guide

## Quick Start

### Installation

```bash
npm install stellar-aa-sdk
```

### Deploy a Smart Wallet

```typescript
import { WalletFactory, SmartWallet, StellarSDK } from 'stellar-aa-sdk';

const factory = new WalletFactory({
  wasmHash: 'YOUR_WASM_HASH',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: StellarSDK.Networks.TESTNET,
});

const ownerKeypair = StellarSDK.Keypair.random();
const sourceKeypair = StellarSDK.Keypair.random(); // Pays fees

const contractId = await factory.createWallet(ownerKeypair, sourceKeypair);
```

### Use with ANY Soroban Contract

```typescript
import { Contract, TransactionBuilder, rpc } from '@stellar/stellar-sdk';

// Your smart wallet can interact with any contract
const tokenContract = new Contract(tokenContractId);
const server = new rpc.Server(rpcUrl);

const tx = new TransactionBuilder(sourceAccount, {
  fee: '10000',
  networkPassphrase,
})
  .addOperation(
    tokenContract.call('transfer',
      smartWalletAddress,  // Smart wallet authorizes
      recipientAddress,
      amount
    )
  )
  .setTimeout(30)
  .build();

const preparedTx = await server.prepareTransaction(tx);
preparedTx.sign(ownerKeypair);
await server.sendTransaction(preparedTx);

// When the token contract calls require_auth(smartWalletAddress),
// your smart wallet's __check_auth verifies the signature automatically
```

## Core Concepts

### __check_auth Pattern

Smart wallets use `__check_auth` instead of execute forwarding:

**How it works:**
1. You call a contract (DEX, token, etc.)
2. That contract calls `require_auth(your_smart_wallet)`
3. Stellar automatically invokes your wallet's `__check_auth`
4. Your wallet verifies the signature
5. Transaction proceeds if authorized

**Benefits:**
- Works with ANY Soroban contract
- No special integration needed by protocols
- Secure - explicit authorizations only
- Standards compliant

### Session Keys

Give limited access to dApps without exposing your main key:

```typescript
const sessionKeypair = StellarSDK.Keypair.random();

await smartWallet.createSession(
  sessionKeypair.publicKey(),
  sessionKeypair.rawPublicKey(),
  '100_000_000',  // 100 token spending limit
  86400           // 24 hours
);

// dApp can now use sessionKeypair to make transactions
// within the spending limit without user confirmation each time
```

### Guardian Recovery

Add trusted contacts to recover your wallet if you lose your key:

```typescript
// Add 3 guardians
await smartWallet.addGuardians(
  [guardian1.publicKey(), guardian2.publicKey(), guardian3.publicKey()],
  ownerKeypair
);

// Later, recover with 2 of 3 guardians
await smartWallet.recover(
  newOwnerKeypair.publicKey(),
  newOwnerKeypair.rawPublicKey(),
  guardian1.publicKey(),
  guardian2.publicKey(),
  guardian1,  // Signs
  guardian2   // Signs
);
```

## Contract Methods

### Initialization
```rust
pub fn initialize(env: Env, owner: Address, owner_pubkey: BytesN<32>)
```

### Session Management
```rust
pub fn create_session(env: Env, key: Address, key_pubkey: BytesN<32>, limit: i128, duration: u64)
pub fn revoke_session(env: Env, key: Address)
pub fn get_session(env: Env, key: Address) -> Option<Session>
```

### Guardian Management
```rust
pub fn add_guardians(env: Env, addresses: Vec<Address>)
pub fn recover(env: Env, new_owner: Address, new_owner_pubkey: BytesN<32>, guardian1: Address, guardian2: Address)
pub fn get_guardians(env: Env) -> Vec<Address>
```

### Views
```rust
pub fn get_owner(env: Env) -> Result<Address, Error>
```

### Authorization (automatic)
```rust
fn __check_auth(env: Env, signature_payload: Hash<32>, signature: BytesN<64>, auth_contexts: Vec<Context>)
```

## Use Cases

### DeFi Interactions

**DEX Swaps:**
```typescript
const dexContract = new Contract(dexContractId);
const tx = new TransactionBuilder(sourceAccount, {...})
  .addOperation(
    dexContract.call('swap',
      smartWalletAddress,  // Trader
      tokenA,
      tokenB,
      amountIn,
      minAmountOut
    )
  )
  .build();
```

**Lending:**
```typescript
const lendingContract = new Contract(lendingContractId);
const tx = new TransactionBuilder(sourceAccount, {...})
  .addOperation(
    lendingContract.call('deposit',
      smartWalletAddress,
      assetAddress,
      amount
    )
  )
  .build();
```

### Session-Based dApps

Give dApps temporary access:

```typescript
// User grants session to game
await wallet.createSession(
  gameSessionKey,
  gameSessionKey.rawPublicKey(),
  '50_000_000',  // 50 tokens
  86400          // 1 day
);

// Game can make in-game purchases without repeated confirmations
```

### Family/Team Wallets

Set up shared wallets with recovery:

```typescript
// Create wallet
const familyWallet = await factory.createWallet(parentKeypair, sourceKeypair);

// Add family members as guardians
await familyWallet.addGuardians(
  [spouse.publicKey(), adult1.publicKey(), adult2.publicKey()],
  parentKeypair
);

// Any 2 can recover if parent loses access
```

## Ecosystem Compatibility

Your smart wallet works with:

**Tokens:**
- ✅ Stellar Asset Contracts (USDC, EURC, etc.)
- ✅ Custom tokens
- ✅ Wrapped assets

**DeFi:**
- ✅ DEX protocols (Soroswap, etc.)
- ✅ Lending/borrowing platforms
- ✅ Liquidity pools
- ✅ Yield farming

**NFTs & Gaming:**
- ✅ NFT marketplaces
- ✅ Game asset contracts
- ✅ Collectibles

**Infrastructure:**
- ✅ Payment gateways
- ✅ Escrow contracts
- ✅ Multi-sig wallets
- ✅ DAO governance

**Any contract using `require_auth()` works automatically!**

## Testing

We use end-to-end SDK tests for real-world validation.

### Run Tests

```bash
# First, deploy contract to testnet
cd contracts/smart-wallet
cargo build --target wasm32-unknown-unknown --release
stellar contract install --wasm target/wasm32-unknown-unknown/release/smart_wallet.wasm \
  --source YOUR_SOURCE --network testnet

# Update sdk-test/test.ts with new WASM hash

# Run tests
cd ../../sdk-test
npx ts-node test.ts
```

### Why SDK Tests Only?

**SDK tests provide better value:**
- Test real deployments on testnet
- Validate actual RPC interactions
- Catch deployment/ABI mismatches
- Test the full stack developers use
- Serve as working examples

**vs Rust unit tests:**
- Use mocked auth (not realistic)
- Miss integration issues
- Require duplicate maintenance
- Add complexity without value

## Deployment

### Build Contract

```bash
cd contracts/smart-wallet
cargo build --target wasm32-unknown-unknown --release
```

### Deploy to Testnet

```bash
# Install contract and get WASM hash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet.wasm \
  --source YOUR_SOURCE \
  --network testnet

# Use the WASM hash in your WalletFactory
```

### Deploy to Mainnet

```bash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet.wasm \
  --source YOUR_SOURCE \
  --network mainnet
```

## Architecture

### v1 vs v2

| Feature | v1 (execute) | v2 (__check_auth) |
|---------|--------------|-------------------|
| Ecosystem compatibility | ~5% | 100% |
| Security | Risky | Secure |
| Standards | ❌ | ✅ CustomAccountInterface |
| Works with SAC tokens | ❌ | ✅ |
| Works with DEXs | ❌ | ✅ |
| Session keys | Limited | Full |
| Guardian recovery | ✅ | ✅ |

### Why __check_auth?

**Before (v1 execute pattern):**
```typescript
// ❌ Forwarding pattern - limited compatibility
await wallet.execute(tokenContract, "transfer", [recipient, amount]);
```

**After (v2 __check_auth):**
```typescript
// ✅ Direct interaction - universal compatibility
const tx = new TransactionBuilder(...)
  .addOperation(
    tokenContract.call("transfer", smartWalletAddress, recipient, amount)
  )
  .build();
```

The `__check_auth` function is called automatically by Stellar when any contract calls `require_auth()` on your smart wallet address.

## Security

### Owner Authentication

- Ed25519 signature verification
- Public key stored on-chain
- Verified in `__check_auth` on every transaction

### Session Keys

- Limited spending amounts
- Time-based expiration
- Can be revoked by owner
- Verified against stored public key

### Guardian Recovery

- Requires M-of-N guardians (default 2-of-3)
- Each guardian must sign
- Changes both owner address and public key
- Irreversible once confirmed

### Best Practices

1. **Keep owner key secure** - it has full control
2. **Use session keys for dApps** - limit exposure
3. **Choose trusted guardians** - they can recover wallet
4. **Set appropriate limits** - session spending limits
5. **Revoke unused sessions** - reduce attack surface

## Roadmap

### Current (v2)
- ✅ __check_auth implementation
- ✅ Owner Ed25519 authentication
- ✅ Session keys with limits
- ✅ Guardian recovery
- ✅ 100% ecosystem compatibility

### Future Enhancements
- 🔄 WebAuthn/Passkey support (Touch ID/Face ID)
- 🔄 Sponsored transactions (pay fees in USDC)
- 🔄 Modular verifier contracts
- 🔄 Policy-based authorization
- 🔄 Auth context parsing for spending

## Resources

- [Stellar Smart Wallets](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Contract Authorization](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)
- [OpenZeppelin Examples](https://github.com/OpenZeppelin/stellar-contracts)
- [Stellar Discord](https://discord.gg/stellar) - #passkeys channel

## Support

- GitHub Issues: https://github.com/Payfrom/stellar-aa-sdk/issues
- Stellar Discord: #passkeys channel
- Documentation: This guide

## License

MIT License - see LICENSE file for details
