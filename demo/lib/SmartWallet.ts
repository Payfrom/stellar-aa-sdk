import * as StellarSDK from '@stellar/stellar-sdk';

const {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  Networks,
} = StellarSDK;

export class SmartWallet {
  private contract: any;
  private server: any;
  private networkPassphrase: string;

  constructor(contractId: string, rpcUrl: string, networkPassphrase: string) {
    this.contract = new Contract(contractId);

    // Access the RPC server (SDK uses 'rpc' namespace)
    const rpc = (StellarSDK as any).rpc;
    if (!rpc?.Server) {
      throw new Error('SorobanRpc.Server not found in SDK');
    }
    this.server = new rpc.Server(rpcUrl);
    this.networkPassphrase = networkPassphrase;
  }

  async initialize(ownerPublicKey: string, sourceKeypair: any) {
    const sourceAccount = await this.server.getAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call('initialize', new Address(ownerPublicKey).toScVal()))
      .setTimeout(30)
      .build();
    return await this.submitTransaction(tx, sourceKeypair);
  }

  async createSession(sessionKeyPublicKey: string, limit: string, durationSeconds: number, sourceKeypair: any) {
    const sourceAccount = await this.server.getAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'create_session',
          new Address(sessionKeyPublicKey).toScVal(),
          nativeToScVal(BigInt(limit), { type: 'i128' }),
          nativeToScVal(durationSeconds, { type: 'u64' })
        )
      )
      .setTimeout(30)
      .build();
    return await this.submitTransaction(tx, sourceKeypair);
  }

  async addGuardians(guardianAddresses: string[], sourceKeypair: any) {
    const sourceAccount = await this.server.getAccount(sourceKeypair.publicKey());

    // Build vector of addresses
    const addressScVals = guardianAddresses.map((addr) => new Address(addr).toScVal());
    const addressesVec = nativeToScVal(addressScVals, { type: 'vec' });

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call('add_guardians', addressesVec))
      .setTimeout(30)
      .build();
    return await this.submitTransaction(tx, sourceKeypair);
  }

  async executeSession(
    sessionKeyPublicKey: string,
    targetContractId: string,
    functionName: string,
    args: any[],
    amount: string,
    sourceKeypair: any
  ) {
    const sourceAccount = await this.server.getAccount(sourceKeypair.publicKey());

    const scArgs = args.map((arg) => {
      if (typeof arg === 'string') {
        return nativeToScVal(arg);
      }
      return arg;
    });

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'execute_session',
          new Address(sessionKeyPublicKey).toScVal(),
          new Address(targetContractId).toScVal(),
          nativeToScVal(functionName, { type: 'symbol' }),
          nativeToScVal(scArgs, { type: 'vec' }),
          nativeToScVal(BigInt(amount), { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    return await this.submitTransaction(tx, sourceKeypair);
  }

  async recover(
    newOwnerPublicKey: string,
    guardian1PublicKey: string,
    guardian2PublicKey: string,
    guardian1Keypair: any,
    guardian2Keypair: any
  ) {
    const sourceAccount = await this.server.getAccount(guardian1Keypair.publicKey());

    // Build transaction
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'recover',
          new Address(newOwnerPublicKey).toScVal(),
          new Address(guardian1PublicKey).toScVal(),
          new Address(guardian2PublicKey).toScVal()
        )
      )
      .setTimeout(30)
      .build();

    // Simulate and validate
    const sim = await this.server.simulateTransaction(tx);
    const Api = (StellarSDK as any).rpc.Api;

    if (!Api.isSimulationSuccess(sim)) {
      throw new Error(`Simulation failed: ${JSON.stringify(sim)}`);
    }

    const simAny = sim as any;
    const authEntries = simAny.result?.auth || [];
    if (!authEntries.length) {
      throw new Error('No auth entries in simulation');
    }

    // Sign auth entries with both guardians
    const signedAuth = await this.signAuthEntries(
      authEntries,
      {
        [guardian1PublicKey]: guardian1Keypair,
        [guardian2PublicKey]: guardian2Keypair,
      },
      simAny.latestLedger || 0
    );

    // Assemble with signed auth and submit
    const modifiedSim = {
      ...simAny,
      result: { ...simAny.result, auth: signedAuth },
    };
    const rpc = (StellarSDK as any).rpc;
    const assembled = (rpc.assembleTransaction(tx, modifiedSim) as any).build();
    assembled.sign(guardian1Keypair);

    return await this.submitSignedTransaction(assembled);
  }

  private async signAuthEntries(
    authEntries: any[],
    signers: Record<string, any>,
    ledger: number
  ): Promise<any[]> {
    return Promise.all(
      authEntries.map(async (entry: any) => {
        const creds = entry.credentials();
        if (creds.switch().name !== 'sorobanCredentialsAddress') return entry;

        const pubKey = StellarSDK.Address.fromScAddress(
          creds.address().address()
        ).toString();
        const signer = signers[pubKey];
        if (!signer) return entry;

        return StellarSDK.authorizeEntry(
          entry,
          signer,
          ledger + 100,
          this.networkPassphrase
        );
      })
    );
  }

  async getOwner(sourceAccount?: any) {
    const tx = await this.buildSimulationTransaction('get_owner', sourceAccount);
    const simulated = await this.server.simulateTransaction(tx);
    const Api = (StellarSDK as any).rpc.Api;
    if (Api.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.result!.retval);
    }
    throw new Error('Failed to get owner');
  }

  async getGuardians(sourceAccount?: any) {
    const tx = await this.buildSimulationTransaction('get_guardians', sourceAccount);
    const simulated = await this.server.simulateTransaction(tx);
    const Api = (StellarSDK as any).rpc.Api;
    if (Api.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.result!.retval);
    }
    throw new Error('Failed to get guardians');
  }

  async getSession(sessionKeyPublicKey: string, sourceAccount?: any) {
    const tx = await this.buildSimulationTransaction('get_session', sourceAccount, new Address(sessionKeyPublicKey).toScVal());
    const simulated = await this.server.simulateTransaction(tx);
    const Api = (StellarSDK as any).rpc.Api;
    if (Api.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.result!.retval) || null;
    }
    throw new Error('Failed to get session');
  }

  getServer() {
    return this.server;
  }

  private async buildSimulationTransaction(method: string, sourceAccount?: any, ...args: any[]) {
    // If no source account provided, use a dummy one
    if (!sourceAccount) {
      const Account = (StellarSDK as any).Account;
      sourceAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    }

    return new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();
  }

  private async submitTransaction(tx: any, sourceKeypair: any) {
    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(sourceKeypair);
    return await this.submitSignedTransaction(prepared);
  }

  private async submitSignedTransaction(tx: any) {
    const sendResponse = await this.server.sendTransaction(tx);
    const GetTransactionStatus = (StellarSDK as any).rpc.Api.GetTransactionStatus;

    if (sendResponse.status === 'PENDING') {
      let getResponse = await this.server.getTransaction(sendResponse.hash);
      let attempts = 0;
      const maxAttempts = 30;

      while (getResponse.status === GetTransactionStatus.NOT_FOUND && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        getResponse = await this.server.getTransaction(sendResponse.hash);
        attempts++;
      }

      if (getResponse.status === GetTransactionStatus.SUCCESS) {
        return getResponse;
      } else if (getResponse.status === GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${JSON.stringify(getResponse.resultXdr || 'Unknown error')}`);
      } else if (getResponse.status === GetTransactionStatus.NOT_FOUND) {
        throw new Error('Transaction timed out - not found after 30 seconds');
      } else {
        throw new Error(`Transaction ended with status: ${getResponse.status}`);
      }
    } else if (sendResponse.status === 'ERROR') {
      const errorResult = (sendResponse as any).errorResult;
      let errorMessage = 'Unknown error';
      if (errorResult?._attributes?.result?._switch?.name) {
        errorMessage = errorResult._attributes.result._switch.name;
      } else if (sendResponse.errorResultXdr) {
        errorMessage = `XDR: ${sendResponse.errorResultXdr}`;
      }
      throw new Error(`Transaction submission error: ${errorMessage}`);
    } else {
      throw new Error(`Unexpected transaction status: ${sendResponse.status}`);
    }
  }
}
