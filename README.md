# Stellar Account Abstraction SDK

**Production-ready Account Abstraction for Stellar** - Build smart wallets that work with the entire Soroban ecosystem.

## What is This?

A complete SDK for building smart contract wallets on Stellar that:
- ✅ Work with **ANY** Soroban contract (DEXs, tokens, lending, NFTs, etc.)
- ✅ Support session keys for delegated access
- ✅ Enable social recovery with guardians
- ✅ Follow Stellar's standards (`CustomAccountInterface`)
- ✅ Provide full TypeScript SDK

## Key Features

### 🌐 Universal Compatibility

Your smart wallet works with the **entire Stellar ecosystem**:
- Stellar Asset Contracts (USDC, EURC, etc.)
- DEX protocols (Soroswap, etc.)
- Lending/borrowing platforms
- NFT marketplaces
- Payment gateways
- DAO governance
- **Any contract using `require_auth()`**

### 🔑 Session Keys

Give dApps temporary access without exposing your main key:
```typescript
// Give game 50 tokens spending limit for 1 day
await wallet.createSession(
  gameKey,
  gameKey.rawPublicKey(),
  '50_000_000',
  86400
);
```

### 🛡️ Guardian Recovery

Set up social recovery with trusted contacts:
```typescript
// Add family/friends as guardians
await wallet.addGuardians([guardian1, guardian2, guardian3]);

// Recover with 2 of 3 if you lose your key
await wallet.recover(newOwner, newOwnerPubkey, guardian1, guardian2, g1Key, g2Key);
```

### 🔐 Secure & Standards-Based

- Implements Stellar's `CustomAccountInterface`
- Uses `__check_auth` pattern (not execute forwarding)
- Ed25519 signature verification
- No implicit authorizations

## Quick Start

### Installation

```bash
npm install stellar-aa-sdk
```

### Deploy a Smart Wallet

```typescript
import { WalletFactory, SmartWallet } from 'stellar-aa-sdk';
import { Keypair, Networks } from '@stellar/stellar-sdk';

// Create factory
const factory = new WalletFactory({
  wasmHash: 'YOUR_WASM_HASH',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

// Deploy wallet
const ownerKeypair = Keypair.random();
const sourceKeypair = Keypair.random(); // Pays fees

const contractId = await factory.createWallet(ownerKeypair, sourceKeypair);

// Use wallet
const wallet = new SmartWallet({
  contractId,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});
```

### Interact with ANY Soroban Contract

```typescript
import { Contract, TransactionBuilder, rpc } from '@stellar/stellar-sdk';

// Example: Transfer tokens
const tokenContract = new Contract(tokenContractId);
const server = new rpc.Server(rpcUrl);
const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

const tx = new TransactionBuilder(sourceAccount, {
  fee: '10000',
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    tokenContract.call('transfer',
      smartWalletAddress,  // Smart wallet authorizes this
      recipientAddress,
      amount
    )
  )
  .setTimeout(30)
  .build();

const preparedTx = await server.prepareTransaction(tx);
preparedTx.sign(ownerKeypair);
await server.sendTransaction(preparedTx);

// The token contract calls require_auth(smartWalletAddress)
// Stellar automatically invokes your wallet's __check_auth
// Your wallet verifies the signature and approves the transfer
```

## How It Works

### The __check_auth Pattern

Instead of forwarding calls (which breaks compatibility), this SDK uses Stellar's `__check_auth`:

1. You call any contract (DEX, token, etc.)
2. That contract calls `require_auth(your_smart_wallet)`
3. Stellar automatically invokes `your_wallet.__check_auth()`
4. Your wallet verifies the signature
5. Transaction proceeds if authorized

**Result**: Your smart wallet works with ANY Soroban contract automatically!

## Use Cases

### DeFi Trading
```typescript
// Swap on a DEX
await dexContract.call('swap', smartWalletAddress, tokenA, tokenB, amount);
```

### Session-Based dApps
```typescript
// Give dApp limited access for 24h
await wallet.createSession(dappKey, dappKey.rawPublicKey(), limit, 86400);
// dApp can make transactions without repeated confirmations
```

### Family Wallets
```typescript
// Add family members as guardians
await wallet.addGuardians([spouse, parent, sibling]);
// Any 2 can help recover if you lose access
```

## Project Structure

```
stellar-aa-sdk/
├── contracts/
│   └── smart-wallet/        # Rust smart contract
│       └── src/lib.rs       # 270 lines of clean code
├── sdk/
│   └── src/                 # TypeScript SDK
│       ├── SmartWallet.ts
│       ├── WalletFactory.ts
│       └── types.ts
├── sdk-test/
│   └── test.ts              # Integration tests
├── README.md                # This file
└── GUIDE.md                 # Comprehensive guide
```

## Development

### Build Contract

```bash
cd contracts/smart-wallet
cargo build --target wasm32-unknown-unknown --release
```

### Run Tests

```bash
cd sdk-test
npx ts-node test.ts
```

### Deploy to Testnet

```bash
stellar contract install \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet.wasm \
  --source YOUR_SOURCE \
  --network testnet
```

## Documentation

- **[GUIDE.md](./GUIDE.md)** - Complete developer guide with examples
- **[Contract README](./contracts/smart-wallet/README.md)** - Contract details
- **[SDK README](./sdk/README.md)** - SDK API reference

## API Overview

### WalletFactory

```typescript
createWallet(ownerKeypair, sourceKeypair) -> contractId
```

### SmartWallet

```typescript
// Initialization
initialize(ownerAddress, ownerPubkey, sourceKeypair)

// Session Management
createSession(keyAddress, keyPubkey, limit, duration, ownerKeypair)
revokeSession(keyAddress, ownerKeypair)
getSession(keyAddress) -> Session

// Guardian Management
addGuardians(addresses[], ownerKeypair)
getGuardians() -> Address[]
recover(newOwner, newOwnerPubkey, guardian1, guardian2, g1Key, g2Key)

// Views
getOwner() -> Address
```

## Why v2?

This is a complete refactor from v1 to fix critical issues:

| Feature | v1 | v2 |
|---------|----|----|
| Architecture | execute pattern | __check_auth |
| Ecosystem compatibility | ~5% | 100% |
| Works with SAC tokens | ❌ | ✅ |
| Works with DEXs | ❌ | ✅ |
| Standards compliant | ❌ | ✅ |
| Security | Risky | Secure |

**v2 implements Stellar's recommended patterns for full ecosystem compatibility.**

## Examples

See [sdk-test/test.ts](./sdk-test/test.ts) for complete working examples:
- Deploying wallets
- Creating sessions
- Adding guardians
- Recovering wallets
- Interacting with contracts

## Roadmap

**Current (v2)**:
- ✅ __check_auth implementation
- ✅ 100% ecosystem compatibility
- ✅ Session keys
- ✅ Guardian recovery

**Future**:
- 🔄 WebAuthn/Passkey support (Touch ID/Face ID)
- 🔄 Sponsored transactions (pay fees in USDC)
- 🔄 Modular verifier contracts
- 🔄 Policy-based authorization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `cd sdk-test && npx ts-node test.ts`
5. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/Payfrom/stellar-aa-sdk/issues)
- **Docs**: See [GUIDE.md](./GUIDE.md)

## Resources

- [Stellar Smart Wallets](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Contract Authorization](https://developers.stellar.org/docs/build/guides/auth/contract-authorization)
- [OpenZeppelin Examples](https://github.com/OpenZeppelin/stellar-contracts)

## License

MIT License - see [LICENSE](./LICENSE) file

---

**Built with ❤️ for the Stellar ecosystem**

Ready to make Account Abstraction accessible to everyone on Stellar! 🚀
