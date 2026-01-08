# Stellar Account Abstraction SDK

Clean, modular SDK for Stellar smart wallet contract interactions.

## Project Structure

```
sdk/
├── src/
│   ├── index.ts          # Main exports (clean entry point)
│   ├── SmartWallet.ts    # SmartWallet class (interact with deployed wallets)
│   ├── WalletFactory.ts  # Factory pattern for creating new wallet instances
│   └── types.ts          # Shared TypeScript interfaces
├── package.json
└── README.md
```

## File Responsibilities

### `index.ts`
- **Purpose**: Clean exports, SDK entry point
- **Exports**: SmartWallet, WalletFactory, types, StellarSDK re-export
- **No implementation logic** - just imports/exports

### `SmartWallet.ts`
- **Purpose**: Interact with an existing smart wallet contract
- **Methods**:
  - `initialize()` - Set wallet owner
  - `createSession()` - Create session key with limits
  - `executeSession()` - Execute with session key
  - `addGuardians()` - Add recovery guardians
  - `recover()` - Recover wallet with guardian signatures
  - `getOwner()`, `getGuardians()`, `getSession()` - Query wallet state

### `WalletFactory.ts`
- **Purpose**: Deploy new smart wallet instances for users
- **Methods**:
  - `createWallet()` - Deploy + initialize new wallet for a user
  - Returns unique `contractId` for each user

### `types.ts`
- **Purpose**: Shared TypeScript interfaces
- **Types**: `Session`, `WalletConfig`, exported by all modules

## Usage

### Install
```bash
npm install stellar-aa-sdk
```

### Import
```typescript
import {
  SmartWallet,
  WalletFactory,
  StellarSDK
} from 'stellar-aa-sdk';

const { Keypair, Networks } = StellarSDK;
```

### Deploy new wallet (Factory Pattern)
```typescript
const factory = new WalletFactory({
  wasmHash: 'YOUR_DEPLOYED_WASM_HASH',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET
});

// Create wallet for new user
const userKey = Keypair.random();
const contractId = await factory.createWallet(
  userKey.publicKey(),
  userKey
);

// Save contractId in your database
console.log('User wallet deployed:', contractId);
```

### Use existing wallet
```typescript
const wallet = new SmartWallet({
  contractId: 'CXXXXX...', // From your database
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET
});

// Create session
await wallet.createSession(sessionKey, '1000000', 3600, ownerKey);

// Execute with session
await wallet.executeSession(
  sessionKey,
  targetContract,
  'function_name',
  args,
  amount,
  sessionKeypair
);
```

## Development

### Build
```bash
npm run build
```

### Publish
```bash
npm publish
```

## Architecture

**One WASM deployment → Many contract instances**

```
┌────────────────────────────────────┐
│  Smart Wallet WASM (deployed once) │
│  Hash: abc123...                   │
└────────────────────────────────────┘
              ↓
    ┌─────────────────────┐
    │   WalletFactory     │
    │  (uses WASM hash)   │
    └─────────────────────┘
              ↓
    ┌─────────┬─────────┬─────────┐
    │ User A  │ User B  │ User C  │
    │ Wallet  │ Wallet  │ Wallet  │
    │ CAAAA...│ CBBBB...│ CCCCC...│
    └─────────┴─────────┴─────────┘
```

Each user gets their own contract instance (unique `contractId`) created from the same WASM code.

## Clean Code Principles

✅ **Single Responsibility**: Each file has one clear purpose
✅ **Separation of Concerns**: Factory, Wallet, Types are separate
✅ **Clean Entry Point**: `index.ts` is just exports
✅ **Type Safety**: All interfaces in dedicated `types.ts`
✅ **Extensibility**: Easy to add new features without touching existing files
