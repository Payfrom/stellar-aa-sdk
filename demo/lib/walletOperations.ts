import { Keypair } from '@stellar/stellar-sdk';
import { SmartWallet } from './SmartWallet';
import { ensureAccountFunded, RPC_URL } from './utils';

export interface OperationOptions {
  contractId: string;
  onStatus?: (message: string) => void;
}

/**
 * Initialize a wallet with owner
 */
export async function initializeWallet(
  contractId: string,
  ownerSecret: string,
  onStatus?: (message: string) => void
) {
  const wallet = new SmartWallet(contractId, RPC_URL, StellarSDK.Networks.TESTNET);
  const ownerKeypair = Keypair.fromSecret(ownerSecret);
  const ownerPublicKey = ownerKeypair.publicKey();

  onStatus?.('Initializing wallet...');
  await wallet.initialize(ownerPublicKey, ownerKeypair);

  return { wallet, ownerPublicKey };
}

/**
 * Create a session key
 */
export async function createSessionKey(
  contractId: string,
  ownerSecret: string,
  sessionKey: string,
  sessionLimit: string,
  sessionDuration: number,
  onStatus?: (message: string) => void
) {
  const wallet = new SmartWallet(contractId, RPC_URL, StellarSDK.Networks.TESTNET);
  const ownerKeypair = Keypair.fromSecret(ownerSecret);
  const ownerPublicKey = ownerKeypair.publicKey();

  // Ensure owner account is funded
  await ensureAccountFunded(ownerPublicKey, wallet.getServer(), onStatus);

  // Verify wallet is initialized and owner matches
  onStatus?.('Verifying wallet...');
  const currentOwner = await wallet.getOwner();
  if (currentOwner !== ownerPublicKey) {
    throw new Error(`Wallet owner mismatch!\n\nWallet owner: ${currentOwner}\nYour account: ${ownerPublicKey}\n\nYou must use the owner's secret key.`);
  }

  onStatus?.(`Creating session...\n\nSession Key: ${sessionKey}\nLimit: ${sessionLimit} stroops\nDuration: ${sessionDuration}s`);
  await wallet.createSession(sessionKey, sessionLimit, sessionDuration, ownerKeypair);

  return wallet;
}

/**
 * Add guardians to wallet
 */
export async function addGuardiansToWallet(
  contractId: string,
  ownerSecret: string,
  guardians: string[],
  onStatus?: (message: string) => void
) {
  const wallet = new SmartWallet(contractId, RPC_URL, StellarSDK.Networks.TESTNET);
  const ownerKeypair = Keypair.fromSecret(ownerSecret);
  const ownerPublicKey = ownerKeypair.publicKey();

  // Ensure owner account is funded
  await ensureAccountFunded(ownerPublicKey, wallet.getServer(), onStatus);

  // Verify wallet
  onStatus?.('Checking wallet initialization...');
  const currentOwner = await wallet.getOwner();
  if (currentOwner !== ownerPublicKey) {
    throw new Error(`Wallet owner mismatch! Expected ${ownerPublicKey} but got ${currentOwner}.`);
  }

  onStatus?.('Adding guardians...');
  await wallet.addGuardians(guardians, ownerKeypair);

  return wallet;
}

/**
 * Execute a transaction with session key
 */
export async function executeWithSession(
  contractId: string,
  sessionSecret: string,
  targetContract: string,
  targetFunction: string,
  execAmount: string,
  onStatus?: (message: string) => void
) {
  const wallet = new SmartWallet(contractId, RPC_URL, StellarSDK.Networks.TESTNET);
  const sessionKeypair = Keypair.fromSecret(sessionSecret);
  const sessionPublicKey = sessionKeypair.publicKey();

  // Ensure session account is funded
  await ensureAccountFunded(sessionPublicKey, wallet.getServer(), onStatus);

  onStatus?.(`Executing via session...\n\nSession: ${sessionPublicKey}\nTarget: ${targetContract}\nFunction: ${targetFunction}\nAmount: ${execAmount} stroops`);
  await wallet.executeSession(
    sessionPublicKey,
    targetContract,
    targetFunction,
    [],
    execAmount,
    sessionKeypair
  );

  return wallet;
}

/**
 * Recover wallet with guardians
 */
export async function recoverWalletWithGuardians(
  contractId: string,
  guardian1Secret: string,
  guardian2Secret: string,
  newOwner: string,
  onStatus?: (message: string) => void
) {
  const wallet = new SmartWallet(contractId, RPC_URL, StellarSDK.Networks.TESTNET);
  const g1Keypair = Keypair.fromSecret(guardian1Secret);
  const g2Keypair = Keypair.fromSecret(guardian2Secret);
  const g1Public = g1Keypair.publicKey();
  const g2Public = g2Keypair.publicKey();

  // Ensure guardian1 is funded (pays for transaction)
  await ensureAccountFunded(g1Public, wallet.getServer(), onStatus);
  // Guardian2 also needs to be funded for multi-sig
  await ensureAccountFunded(g2Public, wallet.getServer(), onStatus);

  onStatus?.(`Recovering wallet...\n\nNew Owner: ${newOwner}\nGuardian 1: ${g1Public}\nGuardian 2: ${g2Public}`);
  await wallet.recover(newOwner, g1Public, g2Public, g1Keypair, g2Keypair);

  return wallet;
}

/**
 * Fetch wallet information
 */
export async function fetchWalletInformation(
  contractId: string,
  ownerSecret?: string,
  sessionKey?: string
) {
  const wallet = new SmartWallet(contractId, RPC_URL, StellarSDK.Networks.TESTNET);

  // Get source account for simulation if available
  let sourceAccount;
  if (ownerSecret) {
    try {
      const ownerKeypair = Keypair.fromSecret(ownerSecret);
      sourceAccount = await wallet.getServer().getAccount(ownerKeypair.publicKey());
    } catch (e) {
      // Owner account not found, will use dummy
    }
  }

  const owner = await wallet.getOwner(sourceAccount);
  const guardians = await wallet.getGuardians(sourceAccount);
  const session = sessionKey ? await wallet.getSession(sessionKey, sourceAccount) : null;

  return { owner, guardians, session };
}

// Re-export StellarSDK for convenience
import * as StellarSDK from '@stellar/stellar-sdk';
export { StellarSDK };
