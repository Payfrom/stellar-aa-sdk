import * as StellarSDK from '@stellar/stellar-sdk';
import { SmartWallet } from './SmartWallet';
import {
  SorobanRpcServer,
  StellarSDKWithRpc,
  FactoryConfig,
} from './types';
import { submitSignedTransaction } from './soroban-utils';

const {
  TransactionBuilder,
  Operation,
} = StellarSDK;

/**
 * Factory for creating new SmartWallet instances
 * - Deploys a new contract instance for each user from the pre-deployed WASM
 */
export class WalletFactory {
  private wasmHash: string;
  private server: SorobanRpcServer;
  private networkPassphrase: string;
  private rpcUrl: string;

  constructor(config: FactoryConfig) {
    this.wasmHash = config.wasmHash;
    this.rpcUrl = config.rpcUrl;
    this.networkPassphrase = config.networkPassphrase;

    // Access the RPC server
    const stellarWithRpc = StellarSDK as unknown as StellarSDKWithRpc;
    const rpc = stellarWithRpc.rpc;
    if (!rpc?.Server) {
      throw new Error('SorobanRpc.Server not found in SDK');
    }
    this.server = new rpc.Server(config.rpcUrl);
  }

  /**
   * Creates a new SmartWallet instance for a user
   * @param ownerPublicKey - The public key that will own this wallet
   * @param sourceKeypair - Keypair to pay for deployment and sign transactions
   * @returns The contract ID of the newly deployed wallet
   */
  async createWallet(
    ownerPublicKey: string,
    sourceKeypair: StellarSDK.Keypair
  ): Promise<string> {
    // 1. Deploy new contract instance from WASM hash
    const contractId = await this.deployInstance(sourceKeypair);

    // 2. Initialize the wallet with the owner
    const wallet = new SmartWallet({
      contractId,
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
    });

    await wallet.initialize(ownerPublicKey, sourceKeypair);

    return contractId;
  }

  /**
   * Deploy a new contract instance from the WASM hash
   * @private
   */
  private async deployInstance(sourceKeypair: StellarSDK.Keypair): Promise<string> {
    const sourceAccount = await this.server.getAccount(sourceKeypair.publicKey());

    // Build deployment transaction using invokeHostFunction
    const tx = new TransactionBuilder(sourceAccount, {
      fee: '10000000', // Higher fee for deployment
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: StellarSDK.xdr.HostFunction.hostFunctionTypeCreateContract(
            new StellarSDK.xdr.CreateContractArgs({
              contractIdPreimage: StellarSDK.xdr.ContractIdPreimage.contractIdPreimageFromAddress(
                new StellarSDK.xdr.ContractIdPreimageFromAddress({
                  address: new StellarSDK.Address(sourceKeypair.publicKey()).toScAddress(),
                  salt: StellarSDK.Keypair.random().rawPublicKey(),
                })
              ),
              executable: StellarSDK.xdr.ContractExecutable.contractExecutableWasm(
                Buffer.from(this.wasmHash, 'hex')
              ),
            })
          ),
          auth: [],
        })
      )
      .setTimeout(30)
      .build();

    // Sign and submit
    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(sourceKeypair);

    const result = await submitSignedTransaction(prepared, this.server);

    // Extract contract ID from the transaction result
    if (result.returnValue) {
      // The return value is an ScAddress which needs to be converted
      const scValToNative = (StellarSDK as any).scValToNative;
      const contractId = scValToNative(result.returnValue as any);
      return contractId;
    }

    throw new Error('Failed to extract contract ID from deployment result');
  }
}
