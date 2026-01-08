import * as StellarSDK from "@stellar/stellar-sdk";
import {
  Session,
  WalletConfig,
  SorobanRpcServer,
  StellarSDKWithRpc,
  GetTransactionResponse,
  ScVal,
  ContractMethod,
} from "./types";
import {
  submitTransaction,
  submitSignedTransaction,
  executeSimulation,
} from "./soroban-utils";

const { Contract, TransactionBuilder, BASE_FEE, Address, nativeToScVal } =
  StellarSDK;

// Cache the SDK type cast
const stellarWithRpc = StellarSDK as unknown as StellarSDKWithRpc;

/**
 * SmartWallet - Account abstraction for Stellar
 */
export class SmartWallet {
  private contract: StellarSDK.Contract;
  private server: SorobanRpcServer;
  private networkPassphrase: string;

  constructor(config: WalletConfig) {
    this.contract = new Contract(config.contractId);
    const rpc = stellarWithRpc.rpc;
    if (!rpc?.Server) throw new Error("SorobanRpc.Server not found in SDK");
    this.server = new rpc.Server(config.rpcUrl);
    this.networkPassphrase = config.networkPassphrase;
  }

  /* Private helpers */

  /** Build and submit a contract call transaction */
  private async callContract(
    method: ContractMethod,
    args: ScVal[],
    sourceKeypair: StellarSDK.Keypair
  ): Promise<GetTransactionResponse> {
    const sourceAccount = await this.server.getAccount(
      sourceKeypair.publicKey()
    );
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    return submitTransaction(tx, sourceKeypair, this.server);
  }

  /** Convert unknown args to ScVal */
  private toScArgs(args: unknown[]): ScVal[] {
    return args.map((arg) =>
      typeof arg === "string" ? nativeToScVal(arg) : arg
    ) as ScVal[];
  }

  /** Sign auth entries for multi-signer transactions */
  private async signAuthEntries(
    authEntries: any[],
    signers: Record<string, StellarSDK.Keypair>,
    ledger: number
  ): Promise<any[]> {
    return Promise.all(
      authEntries.map(async (entry) => {
        const creds = entry.credentials();
        if (creds.switch().name !== "sorobanCredentialsAddress") return entry;

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

  /* Owner Operations */

  /** Initialize wallet with owner */
  async initialize(ownerPublicKey: string, sourceKeypair: StellarSDK.Keypair) {
    return this.callContract(
      ContractMethod.Initialize,
      [new Address(ownerPublicKey).toScVal()],
      sourceKeypair
    );
  }

  /** Execute contract call (owner only) */
  async execute(
    targetContractId: string,
    functionName: string,
    args: unknown[],
    sourceKeypair: StellarSDK.Keypair
  ) {
    return this.callContract(
      ContractMethod.Execute,
      [
        new Address(targetContractId).toScVal(),
        nativeToScVal(functionName, { type: "symbol" }),
        nativeToScVal(this.toScArgs(args), { type: "vec" }),
      ],
      sourceKeypair
    );
  }

  /** Add guardians (owner only) */
  async addGuardians(
    guardianAddresses: string[],
    sourceKeypair: StellarSDK.Keypair
  ) {
    const addresses = guardianAddresses.map((addr) =>
      new Address(addr).toScVal()
    );
    return this.callContract(
      ContractMethod.AddGuardians,
      [nativeToScVal(addresses, { type: "vec" })],
      sourceKeypair
    );
  }

  /* Session operations */

  /** Create session key (owner only) */
  async createSession(
    sessionKeyPublicKey: string,
    limit: string,
    durationSeconds: number,
    sourceKeypair: StellarSDK.Keypair
  ) {
    return this.callContract(
      ContractMethod.CreateSession,
      [
        new Address(sessionKeyPublicKey).toScVal(),
        nativeToScVal(BigInt(limit), { type: "i128" }),
        nativeToScVal(durationSeconds, { type: "u64" }),
      ],
      sourceKeypair
    );
  }

  /** Execute using session key */
  async executeSession(
    sessionKeyPublicKey: string,
    targetContractId: string,
    functionName: string,
    args: unknown[],
    amount: string,
    sourceKeypair: StellarSDK.Keypair
  ) {
    return this.callContract(
      ContractMethod.ExecuteSession,
      [
        new Address(sessionKeyPublicKey).toScVal(),
        new Address(targetContractId).toScVal(),
        nativeToScVal(functionName, { type: "symbol" }),
        nativeToScVal(this.toScArgs(args), { type: "vec" }),
        nativeToScVal(BigInt(amount), { type: "i128" }),
      ],
      sourceKeypair
    );
  }

  /* Recovery (requires 2 guardian signatures) */

  async recover(
    newOwnerPublicKey: string,
    guardian1PublicKey: string,
    guardian2PublicKey: string,
    guardian1Keypair: StellarSDK.Keypair,
    guardian2Keypair: StellarSDK.Keypair
  ): Promise<GetTransactionResponse> {
    const sourceAccount = await this.server.getAccount(
      guardian1Keypair.publicKey()
    );

    // Build transaction
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          ContractMethod.Recover,
          new Address(newOwnerPublicKey).toScVal(),
          new Address(guardian1PublicKey).toScVal(),
          new Address(guardian2PublicKey).toScVal()
        )
      )
      .setTimeout(30)
      .build();

    // Simulate and validate
    const sim = await this.server.simulateTransaction(tx);
    if (!stellarWithRpc.rpc.Api.isSimulationSuccess(sim)) {
      throw new Error(`Simulation failed: ${JSON.stringify(sim)}`);
    }

    const simAny = sim as any;
    const authEntries = simAny.result?.auth || [];
    if (!authEntries.length) throw new Error("No auth entries in simulation");

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
    const assembled = (
      stellarWithRpc.rpc.assembleTransaction(tx, modifiedSim) as any
    ).build();
    assembled.sign(guardian1Keypair);

    return submitSignedTransaction(assembled, this.server);
  }

  /* View functions (read-only) */

  async getOwner(): Promise<string> {
    return executeSimulation(
      this.contract,
      this.server,
      this.networkPassphrase,
      ContractMethod.GetOwner
    );
  }

  async getGuardians(): Promise<string[]> {
    return executeSimulation(
      this.contract,
      this.server,
      this.networkPassphrase,
      ContractMethod.GetGuardians
    );
  }

  async getSession(sessionKeyPublicKey: string): Promise<Session | null> {
    return executeSimulation(
      this.contract,
      this.server,
      this.networkPassphrase,
      ContractMethod.GetSession,
      new Address(sessionKeyPublicKey).toScVal() as ScVal
    );
  }
}
