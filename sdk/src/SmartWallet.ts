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

  /**
   * Initialize wallet with owner
   * @param ownerPublicKey - The Stellar address of the owner
   * @param ownerRawPublicKey - The raw 32-byte public key for signature verification
   * @param sourceKeypair - Keypair to pay for the transaction
   */
  async initialize(
    ownerPublicKey: string,
    ownerRawPublicKey: Buffer,
    sourceKeypair: StellarSDK.Keypair
  ) {
    const pubKeyScVal = nativeToScVal(ownerRawPublicKey, { type: "bytes" });
    return this.callContract(
      ContractMethod.Initialize,
      [new Address(ownerPublicKey).toScVal(), pubKeyScVal as ScVal],
      sourceKeypair
    );
  }

  /**
   * DEPRECATED: The execute() pattern has been removed.
   *
   * With __check_auth, you now interact with contracts directly.
   * The smart wallet's authorization is automatically verified when the target
   * contract calls require_auth() on the smart wallet address.
   *
   * Example:
   * ```typescript
   * // Instead of: wallet.execute(tokenContract, "transfer", [...])
   * // Do: Call the target contract directly with the smart wallet as the authorizing address
   *
   * const tokenContract = new Contract(tokenContractId);
   * const tx = new TransactionBuilder(...)
   *   .addOperation(
   *     tokenContract.call("transfer",
   *       smartWalletAddress, // The smart wallet authorizes this
   *       recipientAddress,
   *       amount
   *     )
   *   )
   *   .build();
   * ```
   *
   * @deprecated Use direct contract interaction instead
   */
  async execute(
    _targetContractId: string,
    _functionName: string,
    _args: unknown[],
    _sourceKeypair: StellarSDK.Keypair
  ): Promise<never> {
    throw new Error(
      "execute() has been removed. With __check_auth, interact with contracts directly. " +
      "The smart wallet's __check_auth will be called automatically when the target contract " +
      "calls require_auth(). See SDK documentation for examples."
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

  /**
   * Create session key (owner only)
   * @param sessionKeyPublicKey - The Stellar address of the session key
   * @param sessionRawPublicKey - The raw 32-byte public key for signature verification
   * @param limit - Spending limit for this session
   * @param durationSeconds - How long the session is valid
   * @param sourceKeypair - Owner's keypair to authorize
   */
  async createSession(
    sessionKeyPublicKey: string,
    sessionRawPublicKey: Buffer,
    limit: string,
    durationSeconds: number,
    sourceKeypair: StellarSDK.Keypair
  ) {
    const pubKeyScVal = nativeToScVal(sessionRawPublicKey, { type: "bytes" });
    return this.callContract(
      ContractMethod.CreateSession,
      [
        new Address(sessionKeyPublicKey).toScVal(),
        pubKeyScVal as ScVal,
        nativeToScVal(BigInt(limit), { type: "i128" }),
        nativeToScVal(durationSeconds, { type: "u64" }),
      ],
      sourceKeypair
    );
  }

  /**
   * Revoke a session key (owner only)
   * @param sessionKeyPublicKey - The address of the session key to revoke
   * @param sourceKeypair - Owner's keypair to authorize
   */
  async revokeSession(
    sessionKeyPublicKey: string,
    sourceKeypair: StellarSDK.Keypair
  ) {
    return this.callContract(
      ContractMethod.RevokeSession,
      [new Address(sessionKeyPublicKey).toScVal()],
      sourceKeypair
    );
  }

  /**
   * DEPRECATED: The executeSession() pattern has been removed.
   *
   * Session keys now work through __check_auth. When you sign a transaction
   * with a session key, the smart wallet automatically verifies it's valid
   * and within spending limits when require_auth() is called.
   *
   * @deprecated Session keys are now verified automatically in __check_auth
   */
  async executeSession(
    _sessionKeyPublicKey: string,
    _targetContractId: string,
    _functionName: string,
    _args: unknown[],
    _amount: string,
    _sourceKeypair: StellarSDK.Keypair
  ): Promise<never> {
    throw new Error(
      "executeSession() has been removed. Session keys are now verified automatically " +
      "in __check_auth when you interact with contracts. Create a session key with " +
      "createSession(), then use it to sign transactions directly."
    );
  }

  /* Recovery (requires 2 guardian signatures) */

  /**
   * Recover wallet with guardians
   * @param newOwnerPublicKey - The new owner's Stellar address
   * @param newOwnerRawPublicKey - The new owner's raw 32-byte public key
   * @param guardian1PublicKey - First guardian's address
   * @param guardian2PublicKey - Second guardian's address
   * @param guardian1Keypair - First guardian's keypair to sign
   * @param guardian2Keypair - Second guardian's keypair to sign
   */
  async recover(
    newOwnerPublicKey: string,
    newOwnerRawPublicKey: Buffer,
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
          nativeToScVal(newOwnerRawPublicKey, { type: "bytes" }) as ScVal,
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
