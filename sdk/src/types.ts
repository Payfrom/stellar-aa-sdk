import * as StellarSDK from '@stellar/stellar-sdk';

// Stellar SDK types
// ScVal is the Stellar contract value type - using 'any' as it's an opaque type from Stellar SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScVal = any;

// Smart Wallet contract interface
export enum ContractMethod {
  Initialize = 'initialize',
  Execute = 'execute',
  CreateSession = 'create_session',
  ExecuteSession = 'execute_session',
  AddGuardians = 'add_guardians',
  Recover = 'recover',
  GetOwner = 'get_owner',
  GetGuardians = 'get_guardians',
  GetSession = 'get_session',
}

// Configuration types
interface BaseConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

export interface WalletConfig extends BaseConfig {
  contractId: string;
}

export interface FactoryConfig extends BaseConfig {
  wasmHash: string;
}

// Session management types
export interface Session {
  key: string;
  limit: string;
  spent: string;
  expires_at: number;
}

// Stellar SDK type augmentation
export interface SorobanRpcServer {
  getAccount(address: string): Promise<StellarSDK.Account>;
  prepareTransaction(tx: StellarSDK.Transaction): Promise<StellarSDK.Transaction>;
  sendTransaction(tx: StellarSDK.Transaction): Promise<SendTransactionResponse>;
  getTransaction(hash: string): Promise<GetTransactionResponse>;
  simulateTransaction(tx: StellarSDK.Transaction): Promise<SimulateTransactionResponse>;
  readonly serverURL: URL;
}

export interface SendTransactionResponse {
  status: 'PENDING' | 'ERROR' | 'DUPLICATE';
  hash: string;
  errorResultXdr?: string;
}

export interface GetTransactionResponse {
  status: TransactionStatus;
  resultXdr?: string;
  returnValue?: unknown;
}

export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  NOT_FOUND = 'NOT_FOUND',
}

export interface SimulateTransactionResponse {
  result?: {
    retval: unknown;
  };
  error?: string;
}

// Stellar SDK API helpers
export interface StellarApi {
  isSimulationSuccess(response: SimulateTransactionResponse): boolean;
  GetTransactionStatus: typeof TransactionStatus;
}

// RPC namespace structure
export interface StellarRpc {
  Server: new (url: string) => SorobanRpcServer;
  Api: StellarApi;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assembleTransaction: (tx: StellarSDK.Transaction, simulation: any) => StellarSDK.Transaction;
}

// Type guard for Stellar SDK with rpc namespace
export interface StellarSDKWithRpc {
  rpc: StellarRpc;
  Account: typeof StellarSDK.Account;
  scValToNative: (val: ScVal) => unknown;
  nativeToScVal: (val: unknown, opts?: { type?: string }) => ScVal;
}

