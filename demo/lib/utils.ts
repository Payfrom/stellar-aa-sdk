import * as StellarSDK from '@stellar/stellar-sdk';

const { Keypair } = StellarSDK;

export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = StellarSDK.Networks.TESTNET;

/**
 * Fund an account using Friendbot (Testnet only)
 */
export async function fundAccount(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );

    if (!response.ok) {
      return false;
    }

    await response.json();
    // Wait for account to be available
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  } catch (error) {
    console.error('Friendbot error:', error);
    return false;
  }
}

/**
 * Check if an account exists on the network
 */
export async function accountExists(publicKey: string, server: any): Promise<boolean> {
  try {
    await server.getAccount(publicKey);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure an account is funded, fund it if necessary
 */
export async function ensureAccountFunded(
  publicKey: string,
  server: any,
  onStatus?: (message: string) => void
): Promise<void> {
  const exists = await accountExists(publicKey, server);

  if (!exists) {
    onStatus?.(`Account not funded. Funding via Friendbot...`);
    const funded = await fundAccount(publicKey);

    if (!funded) {
      throw new Error('Failed to fund account. Please fund it manually at https://laboratory.stellar.org/#account-creator?network=test');
    }

    onStatus?.('Account funded successfully!');
  }
}

/**
 * Generate a new Stellar keypair
 */
export function generateKeypair(): { publicKey: string; secretKey: string } {
  const keypair = Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Get public key from secret key
 */
export function getPublicKey(secretKey: string): string {
  return Keypair.fromSecret(secretKey).publicKey();
}

/**
 * Validate if a string is a valid Stellar public key
 */
export function isValidPublicKey(key: string): boolean {
  try {
    return key.startsWith('G') && key.length === 56;
  } catch {
    return false;
  }
}

/**
 * Validate if a string is a valid Stellar secret key
 */
export function isValidSecretKey(key: string): boolean {
  try {
    Keypair.fromSecret(key);
    return true;
  } catch {
    return false;
  }
}
