// Main SDK exports
export { SmartWallet } from './SmartWallet';
export { WalletFactory } from './WalletFactory';
export * from './soroban-utils';

// Type exports
export { Session, WalletConfig, FactoryConfig, ContractMethod } from './types';

// Re-export Stellar SDK for convenience
export * as StellarSDK from '@stellar/stellar-sdk';
