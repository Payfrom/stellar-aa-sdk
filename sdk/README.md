# Stellar Account Abstraction SDK

**Production-ready Account Abstraction for Stellar** - Build smart wallets that work with the entire Soroban ecosystem.

## What is This?

A TypeScript SDK for building smart contract wallets on Stellar that:
- ✅ Work with **ANY** Soroban contract (DEXs, tokens, lending, NFTs, etc.)
- ✅ Support session keys for delegated access
- ✅ Enable social recovery with guardians
- ✅ Follow Stellar's standards (`CustomAccountInterface` with `__check_auth`)
- ✅ Provide full TypeScript SDK with simple API

## Installation

```bash
npm install stellar-aa-sdk
```

## Quick Start

### Deploy a Smart Wallet

```typescript
import { WalletFactory, SmartWallet, StellarSDK } from 'stellar-aa-sdk';

const { Keypair, Networks } = StellarSDK;

const factory = new WalletFactory({
  wasmHash: 'YOUR_WASM_HASH',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

const ownerKeypair = Keypair.random();
const sourceKeypair = Keypair.random(); // Pays fees

// Fund source account first (testnet: https://friendbot.stellar.org)

const contractId = await factory.createWallet(ownerKeypair, sourceKeypair);
```

### Interact with ANY Soroban Contract

Your smart wallet works with **any** Soroban contract using the `__check_auth` pattern:

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

// When the token contract calls require_auth(smartWalletAddress),
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

## API Reference

### WalletFactory

#### Constructor

```typescript
new WalletFactory(config: FactoryConfig)
```

**Config:**
- `wasmHash`: WASM hash of the smart-wallet contract
  - **Testnet**: `d6ab7a7ab47085df18aa8c526581d24a792b232f84f04ac3d85d4ee519a70eb0`
  - Deploy your own: See [deployment guide](https://github.com/Payfrom/stellar-aa-sdk)
- `rpcUrl`: Soroban RPC server URL
- `networkPassphrase`: Network passphrase (e.g., `Networks.TESTNET`)

#### Methods

##### `createWallet(ownerKeypair: Keypair, sourceKeypair: Keypair): Promise<string>`

Deploys and initializes a new smart wallet.

- `ownerKeypair`: Keypair that will own the smart wallet
- `sourceKeypair`: Keypair that pays for deployment (must be funded)
- Returns: Contract ID of the deployed wallet

### SmartWallet

#### Constructor

```typescript
new SmartWallet(config: WalletConfig)
```

**Config:**
- `contractId`: Contract ID of the deployed smart wallet
- `rpcUrl`: Soroban RPC server URL
- `networkPassphrase`: Network passphrase

#### Methods

##### Session Management

```typescript
createSession(
  sessionKeyAddress: string,
  sessionKeyPubkey: Buffer,
  limit: string,
  durationSeconds: number,
  ownerKeypair: Keypair
): Promise<GetTransactionResponse>
```

Creates a session key with spending limit and expiration.

```typescript
revokeSession(
  sessionKeyAddress: string,
  ownerKeypair: Keypair
): Promise<GetTransactionResponse>
```

Revokes a session key.

```typescript
getSession(sessionKeyAddress: string): Promise<Session | null>
```

Gets session details (read-only).

##### Guardian Management

```typescript
addGuardians(
  guardianAddresses: string[],
  ownerKeypair: Keypair
): Promise<GetTransactionResponse>
```

Adds guardians for social recovery.

```typescript
getGuardians(): Promise<string[]>
```

Gets list of guardians (read-only).

```typescript
recover(
  newOwnerAddress: string,
  newOwnerPubkey: Buffer,
  guardian1Address: string,
  guardian2Address: string,
  guardian1Keypair: Keypair,
  guardian2Keypair: Keypair
): Promise<GetTransactionResponse>
```

Recovers wallet with 2-of-N guardian signatures.

##### View Functions

```typescript
getOwner(): Promise<string>
```

Gets current owner address (read-only).

## Complete Example

```typescript
import { WalletFactory, SmartWallet, StellarSDK } from 'stellar-aa-sdk';

const { Keypair, Networks } = StellarSDK;

async function example() {
  // Setup
  const rpcUrl = "https://soroban-testnet.stellar.org";
  const networkPassphrase = Networks.TESTNET;
  const wasmHash = "d6ab7a7ab47085df18aa8c526581d24a792b232f84f04ac3d85d4ee519a70eb0";

  // Deploy wallet
  const factory = new WalletFactory({ wasmHash, rpcUrl, networkPassphrase });
  const ownerKeypair = Keypair.random();
  const sourceKeypair = Keypair.random();

  // Fund source (testnet)
  await fetch(`https://friendbot.stellar.org?addr=${sourceKeypair.publicKey()}`);

  const contractId = await factory.createWallet(ownerKeypair, sourceKeypair);
  const wallet = new SmartWallet({ contractId, rpcUrl, networkPassphrase });

  // Add guardians
  const guardian1 = Keypair.random();
  const guardian2 = Keypair.random();
  await wallet.addGuardians(
    [guardian1.publicKey(), guardian2.publicKey()],
    ownerKeypair
  );

  // Create session key
  const sessionKeypair = Keypair.random();
  await wallet.createSession(
    sessionKeypair.publicKey(),
    sessionKeypair.rawPublicKey(),
    '100_000_000',  // 100 token limit
    86400,          // 24 hours
    ownerKeypair
  );

  // Later: Recover with guardians
  const newOwner = Keypair.random();
  await wallet.recover(
    newOwner.publicKey(),
    newOwner.rawPublicKey(),
    guardian1.publicKey(),
    guardian2.publicKey(),
    guardian1,
    guardian2
  );
}
```

## Universal Compatibility

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

## Use Cases

### Session-Based dApps

Give dApps temporary access without exposing your main key:

```typescript
await wallet.createSession(
  dappKey.publicKey(),
  dappKey.rawPublicKey(),
  '50_000_000',  // 50 token limit
  86400          // 1 day
);
```

### Social Recovery

Set up trusted contacts to recover your wallet:

```typescript
await wallet.addGuardians([friend1, friend2, family], ownerKeypair);

// Later, recover with 2 of 3
await wallet.recover(newOwner, newOwnerPubkey, friend1, friend2, key1, key2);
```

### DeFi Trading

Interact with any DEX or DeFi protocol:

```typescript
const tx = new TransactionBuilder(sourceAccount, {...})
  .addOperation(
    dexContract.call('swap', smartWalletAddress, tokenA, tokenB, amount)
  )
  .build();
```

## Testing

See [sdk-test/test.ts](https://github.com/Payfrom/stellar-aa-sdk/tree/master/sdk-test) for complete working examples.

## Why v2?

| Feature | v1 (execute) | v2 (__check_auth) |
|---------|--------------|-------------------|
| Ecosystem compatibility | ~5% | **100%** |
| Works with SAC tokens | ❌ | ✅ |
| Works with DEXs | ❌ | ✅ |
| Standards compliant | ❌ | ✅ |
| Security | Risky | Secure |

**v2 implements Stellar's recommended patterns for full ecosystem compatibility.**

## Resources

- **GitHub**: https://github.com/Payfrom/stellar-aa-sdk
- **Full Guide**: See [GUIDE.md](https://github.com/Payfrom/stellar-aa-sdk/blob/master/GUIDE.md)
- **Stellar Docs**: [Smart Wallets](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- **Discord**: [Stellar Discord](https://discord.gg/stellar) #passkeys channel

## License

MIT License - see [LICENSE](https://github.com/Payfrom/stellar-aa-sdk/blob/master/LICENSE)

---

**Built for the Stellar ecosystem** - Making Account Abstraction accessible to everyone! 🚀
