import * as StellarSDK from '@stellar/stellar-sdk';
import {
  GetTransactionResponse,
  SorobanRpcServer,
  StellarSDKWithRpc,
  ContractMethod,
  ScVal,
} from './types';

const {
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
} = StellarSDK;

/**
 * Submit a transaction and wait for confirmation
 */
export async function submitTransaction(
  tx: StellarSDK.Transaction,
  sourceKeypair: StellarSDK.Keypair,
  server: SorobanRpcServer,
): Promise<GetTransactionResponse> {
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(sourceKeypair);

  return await submitSignedTransaction(prepared, server);
}

/**
 * Submit an already signed transaction
 */
export async function submitSignedTransaction(
  tx: StellarSDK.Transaction,
  server: SorobanRpcServer,
): Promise<GetTransactionResponse> {
  const sendResponse = await server.sendTransaction(tx);
  const stellarWithRpc = StellarSDK as unknown as StellarSDKWithRpc;
  const GetTransactionStatus = stellarWithRpc.rpc.Api.GetTransactionStatus;

  if (sendResponse.status === 'PENDING') {
    let getResponse = await server.getTransaction(sendResponse.hash);
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    while (
      getResponse.status === GetTransactionStatus.NOT_FOUND &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      getResponse = await server.getTransaction(sendResponse.hash);
      attempts++;
    }

    if (getResponse.status === GetTransactionStatus.SUCCESS) {
      return getResponse;

    } else if (getResponse.status === GetTransactionStatus.FAILED) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(getResponse.resultXdr || 'Unknown error')}`
      );

    } else if (getResponse.status === GetTransactionStatus.NOT_FOUND) {
      throw new Error('Transaction timed out - not found after 30 seconds');

    } else {
      throw new Error(`Transaction ended with status: ${getResponse.status}`);
    }

  } else if (sendResponse.status === 'ERROR') {
    // Extract error details from the response
    let errorMessage = 'Unknown error';

    // The response may have errorResult with detailed error info (not in types)
    const errorResult = (sendResponse as any).errorResult;
    if (errorResult?._attributes?.result?._switch?.name) {
      errorMessage = errorResult._attributes.result._switch.name;
    } else if (sendResponse.errorResultXdr) {
      errorMessage = `XDR: ${sendResponse.errorResultXdr}`;
    }

    throw new Error(
      `Transaction submission error: ${errorMessage}`
    );
    
  } else {
    throw new Error(`Unexpected transaction status: ${sendResponse.status}`);
  }
}

/**
 * Build a transaction with standard configuration
 */
export async function buildTransaction(
  contract: StellarSDK.Contract,
  server: SorobanRpcServer,
  networkPassphrase: string,
  sourceAccount: StellarSDK.Account,
  method: ContractMethod,
  ...args: ScVal[]
): Promise<StellarSDK.Transaction> {
  return new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
}

/**
 * Build and submit a transaction
 */
export async function buildAndSubmitTransaction(
  contract: StellarSDK.Contract,
  server: SorobanRpcServer,
  networkPassphrase: string,
  sourceKeypair: StellarSDK.Keypair,
  method: ContractMethod,
  ...args: ScVal[]
): Promise<GetTransactionResponse> {
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());
  const tx = await buildTransaction(
    contract,
    server,
    networkPassphrase,
    sourceAccount,
    method,
    ...args
  );
  return await submitTransaction(tx, sourceKeypair, server);
}

/**
 * Build a transaction for simulation (read-only queries)
 */
export async function buildSimulationTransaction(
  contract: StellarSDK.Contract,
  server: SorobanRpcServer,
  networkPassphrase: string,
  method: ContractMethod,
  ...args: ScVal[]
): Promise<StellarSDK.Transaction> {
  // Use a dummy account for simulation
  const stellarWithRpc = StellarSDK as unknown as StellarSDKWithRpc;
  const Account = stellarWithRpc.Account;
  const dummyAccount = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    '0'
  );

  return await buildTransaction(
    contract,
    server,
    networkPassphrase,
    dummyAccount,
    method,
    ...args
  );
}

/**
 * Execute simulation and extract result
 */
export async function executeSimulation<T>(
  contract: StellarSDK.Contract,
  server: SorobanRpcServer,
  networkPassphrase: string,
  method: ContractMethod,
  ...args: ScVal[]
): Promise<T> {
  const tx = await buildSimulationTransaction(
    contract,
    server,
    networkPassphrase,
    method,
    ...args
  );
  const simulated = await server.simulateTransaction(tx);

  const stellarWithRpc = StellarSDK as unknown as StellarSDKWithRpc;
  const Api = stellarWithRpc.rpc.Api;

  if (Api.isSimulationSuccess(simulated)) {
    return scValToNative(simulated.result!.retval as ScVal) as T;
  }

  throw new Error(`Failed to execute ${method}`);
}