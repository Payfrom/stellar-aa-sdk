'use client';

import { useState } from 'react';
import * as StellarSDK from '@stellar/stellar-sdk';

const {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  Keypair,
  Networks,
} = StellarSDK;

class SmartWallet {
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

    // Sign with both guardians
    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(guardian1Keypair);
    prepared.sign(guardian2Keypair);

    return await this.submitSignedTransaction(prepared);
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

  private async buildSimulationTransaction(method: string, sourceAccount?: any, ...args: any[]) {
    // If no source account provided, use a dummy one
    if (!sourceAccount) {
      const Account = (StellarSDK as any).Account;
      // Use a well-known testnet account address format for simulation
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
      const maxAttempts = 30; // 30 seconds max

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
      throw new Error(`Transaction submission error: ${sendResponse.errorResultXdr || 'Unknown error'}`);
    } else {
      throw new Error(`Unexpected transaction status: ${sendResponse.status}`);
    }
  }
}

export default function Home() {
  const [contractId, setContractId] = useState('');
  const [ownerSecret, setOwnerSecret] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [walletInfo, setWalletInfo] = useState<any>(null);

  // Session state
  const [sessionKey, setSessionKey] = useState('');
  const [sessionLimit, setSessionLimit] = useState('1000000');
  const [sessionDuration, setSessionDuration] = useState('3600');

  // Session execution state
  const [sessionSecret, setSessionSecret] = useState('');
  const [execAmount, setExecAmount] = useState('100');
  const [targetContract, setTargetContract] = useState('');
  const [targetFunction, setTargetFunction] = useState('');

  // Guardian state
  const [guardian1, setGuardian1] = useState('');
  const [guardian2, setGuardian2] = useState('');

  // Recovery state
  const [guardian1Secret, setGuardian1Secret] = useState('');
  const [guardian2Secret, setGuardian2Secret] = useState('');
  const [newOwner, setNewOwner] = useState('');

  const RPC_URL = 'https://soroban-testnet.stellar.org';
  const NETWORK_PASSPHRASE = Networks.TESTNET;

  const generateKeys = async () => {
    const keypair = Keypair.random();
    setOwnerSecret(keypair.secret());
    setStatus(`Generated keys. Public: ${keypair.publicKey()}\n\nFunding account on testnet...`);

    try {
      // Fund the account using Friendbot
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(keypair.publicKey())}`
      );
      await response.json();

      if (response.ok) {
        setStatus(`Generated keys. Public: ${keypair.publicKey()}\n\n✅ Account funded successfully!`);
      } else {
        setStatus(`Generated keys. Public: ${keypair.publicKey()}\n\n⚠️ Warning: Failed to fund account. You may need to fund it manually at https://laboratory.stellar.org/#account-creator?network=test`);
      }
    } catch (error: any) {
      setStatus(`Generated keys. Public: ${keypair.publicKey()}\n\n⚠️ Warning: Failed to fund account. You may need to fund it manually.`);
    }
  };

  const generateSessionKey = async () => {
    const keypair = Keypair.random();
    setSessionKey(keypair.publicKey());
    setSessionSecret(keypair.secret());
    setStatus(`Generated session key!\n\nPublic: ${keypair.publicKey()}\nSecret: ${keypair.secret()}\n\n⚠️ SAVE THE SECRET KEY! You'll need it to execute transactions with this session.\n\nNote: Session keys don't need funding - they're authorized by the owner.`);
  };

  const generateGuardianKeys = async () => {
    const g1 = Keypair.random();
    const g2 = Keypair.random();
    setGuardian1(g1.publicKey());
    setGuardian2(g2.publicKey());
    setGuardian1Secret(g1.secret());
    setGuardian2Secret(g2.secret());
    setStatus(`Generated guardians!\n\nGuardian 1:\nPublic: ${g1.publicKey()}\nSecret: ${g1.secret()}\n\nGuardian 2:\nPublic: ${g2.publicKey()}\nSecret: ${g2.secret()}\n\n⚠️ SAVE THESE SECRET KEYS! You'll need them for wallet recovery.\n\nNote: Guardian addresses don't need funding to be added.`);
  };

  const initializeWallet = async () => {
    if (!contractId || !ownerSecret) {
      setStatus('Please provide contract ID and owner secret key');
      return;
    }

    setLoading(true);
    try {
      const wallet = new SmartWallet(contractId, RPC_URL, NETWORK_PASSPHRASE);
      const ownerKeypair = Keypair.fromSecret(ownerSecret);
      const ownerPublicKey = ownerKeypair.publicKey();

      setStatus('Initializing wallet...');
      await wallet.initialize(ownerPublicKey, ownerKeypair);
      setStatus(`✅ Wallet initialized successfully!\n\nOwner: ${ownerPublicKey}\n\nFetching wallet info...`);
      await fetchWalletInfo();
      setStatus(`✅ Wallet initialized successfully!\n\nOwner: ${ownerPublicKey}`);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!contractId || !ownerSecret || !sessionKey) {
      setStatus('Please provide all required fields');
      return;
    }

    setLoading(true);
    setStatus('Creating session...');
    try {
      const ownerKeypair = Keypair.fromSecret(ownerSecret);
      const ownerPublicKey = ownerKeypair.publicKey();

      // Check if owner account exists, if not fund it
      try {
        const server = new (StellarSDK as any).rpc.Server(RPC_URL);
        await server.getAccount(ownerPublicKey);
      } catch (error) {
        setStatus('Owner account not funded. Funding via Friendbot...');
        const response = await fetch(
          `https://friendbot.stellar.org?addr=${encodeURIComponent(ownerPublicKey)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fund owner account.');
        }
        await response.json();
        setStatus('✅ Owner account funded! Creating session...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const wallet = new SmartWallet(contractId, RPC_URL, NETWORK_PASSPHRASE);

      // Check if wallet is initialized and owner matches
      setStatus('Verifying wallet...');
      try {
        const currentOwner = await wallet.getOwner();
        if (currentOwner !== ownerPublicKey) {
          throw new Error(`⚠️ Wallet owner mismatch!\n\nWallet owner: ${currentOwner}\nYour account: ${ownerPublicKey}\n\nYou must use the owner's secret key.`);
        }
      } catch (e: any) {
        if (e.message.includes('NotInitialized') || e.message.includes('not found')) {
          throw new Error('⚠️ Wallet not initialized! Please click "Initialize Wallet" first.');
        }
        throw e;
      }

      setStatus(`Creating session...\n\nSession Key: ${sessionKey}\nLimit: ${sessionLimit} stroops\nDuration: ${sessionDuration}s`);
      console.log('Creating session:', { sessionKey, sessionLimit, sessionDuration, ownerPublicKey });

      await wallet.createSession(sessionKey, sessionLimit, parseInt(sessionDuration), ownerKeypair);

      setStatus('✅ Session created successfully!');
      await fetchWalletInfo();
    } catch (error: any) {
      console.error('Session creation error:', error);
      setStatus(`❌ Error creating session:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const addGuardians = async () => {
    if (!contractId || !ownerSecret || !guardian1 || !guardian2) {
      setStatus('Please provide all required fields');
      return;
    }

    setLoading(true);
    setStatus('Adding guardians...');
    try {
      const ownerKeypair = Keypair.fromSecret(ownerSecret);
      const ownerPublicKey = ownerKeypair.publicKey();

      // Check if owner account exists, if not fund it
      try {
        const server = new (StellarSDK as any).rpc.Server(RPC_URL);
        await server.getAccount(ownerPublicKey);
      } catch (error) {
        // Account doesn't exist, fund it with Friendbot
        setStatus('Owner account not funded. Funding via Friendbot...');
        const response = await fetch(
          `https://friendbot.stellar.org?addr=${encodeURIComponent(ownerPublicKey)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fund owner account. Please fund it manually at https://laboratory.stellar.org/#account-creator?network=test');
        }
        await response.json();
        setStatus('✅ Owner account funded! Adding guardians...');
        // Wait a bit for the account to be available
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const wallet = new SmartWallet(contractId, RPC_URL, NETWORK_PASSPHRASE);

      // Check if wallet is initialized
      setStatus('Checking wallet initialization...');
      try {
        const currentOwner = await wallet.getOwner();
        if (currentOwner !== ownerPublicKey) {
          throw new Error(`Wallet owner mismatch! Expected ${ownerPublicKey} but got ${currentOwner}. Make sure you initialized with the correct owner.`);
        }
        setStatus(`✅ Wallet verified. Adding guardians...`);
      } catch (e: any) {
        if (e.message.includes('NotInitialized') || e.message.includes('not found')) {
          throw new Error('⚠️ Wallet not initialized! Please click "Initialize Wallet" first.');
        }
        throw e;
      }

      console.log('Adding guardians:', guardian1, guardian2);
      const result = await wallet.addGuardians([guardian1, guardian2], ownerKeypair);
      console.log('Guardian transaction result:', result);

      setStatus('✅ Guardians added successfully! Fetching wallet info...');
      await fetchWalletInfo();
      setStatus(`✅ Guardians added successfully!\n\nGuardian 1: ${guardian1}\nGuardian 2: ${guardian2}`);
    } catch (error: any) {
      console.error('Full error:', error);
      setStatus(`❌ Error adding guardians:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const executeSessionTx = async () => {
    if (!contractId || !sessionSecret || !targetContract || !targetFunction || !execAmount) {
      setStatus('Please provide all required fields for session execution');
      return;
    }

    setLoading(true);
    setStatus('Executing transaction with session key...');
    try {
      const sessionKeypair = Keypair.fromSecret(sessionSecret);
      const sessionPublicKey = sessionKeypair.publicKey();

      // Check if session account exists, if not fund it
      try {
        const server = new (StellarSDK as any).rpc.Server(RPC_URL);
        await server.getAccount(sessionPublicKey);
      } catch (error) {
        setStatus('Session account not funded. Funding via Friendbot...');
        const response = await fetch(
          `https://friendbot.stellar.org?addr=${encodeURIComponent(sessionPublicKey)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fund session account.');
        }
        await response.json();
        setStatus('✅ Session account funded! Executing...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const wallet = new SmartWallet(contractId, RPC_URL, NETWORK_PASSPHRASE);

      setStatus(`Executing via session...\n\nSession: ${sessionPublicKey}\nTarget: ${targetContract}\nFunction: ${targetFunction}\nAmount: ${execAmount} stroops`);

      await wallet.executeSession(
        sessionPublicKey,
        targetContract,
        targetFunction,
        [], // Empty args for now - can be extended
        execAmount,
        sessionKeypair
      );

      setStatus('✅ Session execution successful!');
      await fetchWalletInfo();
    } catch (error: any) {
      console.error('Session execution error:', error);
      setStatus(`❌ Error executing session:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const recoverWallet = async () => {
    if (!contractId || !guardian1Secret || !guardian2Secret || !newOwner) {
      setStatus('Please provide all required fields for recovery');
      return;
    }

    setLoading(true);
    setStatus('Recovering wallet...');
    try {
      const g1Keypair = Keypair.fromSecret(guardian1Secret);
      const g2Keypair = Keypair.fromSecret(guardian2Secret);
      const g1Public = g1Keypair.publicKey();
      const g2Public = g2Keypair.publicKey();

      // Check if guardian1 account exists, if not fund it
      try {
        const server = new (StellarSDK as any).rpc.Server(RPC_URL);
        await server.getAccount(g1Public);
      } catch (error) {
        setStatus('Guardian 1 account not funded. Funding via Friendbot...');
        const response = await fetch(
          `https://friendbot.stellar.org?addr=${encodeURIComponent(g1Public)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fund guardian 1 account.');
        }
        await response.json();
        setStatus('✅ Guardian 1 funded! Recovering...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const wallet = new SmartWallet(contractId, RPC_URL, NETWORK_PASSPHRASE);

      setStatus(`Recovering wallet...\n\nNew Owner: ${newOwner}\nGuardian 1: ${g1Public}\nGuardian 2: ${g2Public}`);

      await wallet.recover(newOwner, g1Public, g2Public, g1Keypair, g2Keypair);

      setStatus('✅ Wallet recovery successful! Owner has been changed.');
      await fetchWalletInfo();
    } catch (error: any) {
      console.error('Recovery error:', error);
      setStatus(`❌ Error recovering wallet:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletInfo = async () => {
    if (!contractId) return;

    setLoading(true);
    try {
      const wallet = new SmartWallet(contractId, RPC_URL, NETWORK_PASSPHRASE);

      // Get a source account for simulation
      let sourceAccount;
      if (ownerSecret) {
        try {
          const ownerKeypair = Keypair.fromSecret(ownerSecret);
          sourceAccount = await wallet['server'].getAccount(ownerKeypair.publicKey());
        } catch (e) {
          // Owner account not found, will use dummy
        }
      }

      const owner = await wallet.getOwner(sourceAccount);
      const guardians = await wallet.getGuardians(sourceAccount);
      const session = sessionKey ? await wallet.getSession(sessionKey, sourceAccount) : null;

      setWalletInfo({ owner, guardians, session });
      setStatus('✅ Wallet info fetched successfully!');
    } catch (error: any) {
      console.error('Error fetching wallet info:', error);
      setStatus(`Error fetching wallet info: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8 text-gray-800 text-center">Stellar Smart Wallet Demo</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
        {/* Left Column - Controls */}
        <div className="space-y-6">
          {/* Wallet Status */}
          {walletInfo?.owner && (
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-3 text-gray-800 flex items-center">
                <span className="text-green-600 mr-2">✓</span> Wallet Active
              </h2>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Owner:</strong>
                  <code className="ml-2 text-xs bg-white px-2 py-1 rounded">{walletInfo.owner}</code>
                </div>
                {ownerSecret && (
                  <div>
                    {Keypair.fromSecret(ownerSecret).publicKey() === walletInfo.owner ? (
                      <span className="text-green-700 font-medium">✓ You have the correct owner key</span>
                    ) : (
                      <span className="text-red-700 font-medium">⚠ WARNING: Your key doesn't match the owner!</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration */}
          <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-700">Setup</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contract ID</label>
              <input
                type="text"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
                placeholder="Paste your deployed contract ID"
              />
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Owner Secret Key
              </label>

              {!walletInfo?.owner ? (
                <>
                  <p className="text-xs text-gray-600 mb-2">
                    Choose one: Generate a new keypair OR paste your existing secret key
                  </p>
                  <button
                    onClick={generateKeys}
                    className="w-full mb-3 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Generate New Keypair
                  </button>
                  <div className="text-center text-gray-500 text-sm mb-3">- OR -</div>
                </>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-2">
                  ⚠ Wallet already initialized. Make sure you paste the ORIGINAL owner secret key.
                </p>
              )}

              <input
                type="password"
                value={ownerSecret}
                onChange={(e) => setOwnerSecret(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
                placeholder="Paste secret key (S...)"
              />

              {ownerSecret && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <strong>This key controls:</strong>
                  <code className="ml-1">{Keypair.fromSecret(ownerSecret).publicKey().slice(0, 10)}...</code>
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Initialize Wallet */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">
              {walletInfo?.owner ? '✓ Wallet Initialized' : '1. Initialize New Wallet'}
            </h2>
            {walletInfo?.owner ? (
              <div className="text-green-700 bg-green-50 p-3 rounded">
                This wallet is already set up. Use the features below to manage it.
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  First time setup: This registers your owner address with the contract.
                </p>
                <button
                  onClick={initializeWallet}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Processing...' : 'Initialize Wallet'}
                </button>
              </>
            )}
          </div>

          {/* Create Session */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">2. Create Session Key</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Session Key Address</label>
              <input
                type="text"
                value={sessionKey}
                onChange={(e) => setSessionKey(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
                placeholder="G..."
              />
              <button
                onClick={generateSessionKey}
                className="mt-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Generate Session Key
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Limit (stroops)</label>
              <input
                type="text"
                value={sessionLimit}
                onChange={(e) => setSessionLimit(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Duration (seconds)</label>
              <input
                type="text"
                value={sessionDuration}
                onChange={(e) => setSessionDuration(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
              />
            </div>
              <button
                onClick={createSession}
                disabled={loading}
                className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {loading ? 'Processing...' : 'Create Session'}
              </button>
            </div>
          </div>

          {/* Add Guardians */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">3. Add Guardians</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Guardian 1 Address</label>
              <input
                type="text"
                value={guardian1}
                onChange={(e) => setGuardian1(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
                placeholder="G..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Guardian 2 Address</label>
              <input
                type="text"
                value={guardian2}
                onChange={(e) => setGuardian2(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-gray-900"
                placeholder="G..."
              />
            </div>
            <button
              onClick={generateGuardianKeys}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Generate Guardian Keys
            </button>
            <button
              onClick={addGuardians}
              disabled={loading}
              className="ml-4 px-6 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
            >
              {loading ? 'Processing...' : 'Add Guardians'}
            </button>
          </div>
        </div>

          {/* Execute Session */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">4. Execute with Session Key</h2>
            <p className="text-sm text-gray-600 mb-4">
              Test spending stroops using a session key. The session must be created first (step 2).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Session Secret Key</label>
                <input
                  type="password"
                  value={sessionSecret}
                  onChange={(e) => setSessionSecret(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                  placeholder="S... (secret from Generate Session Key)"
                />
                {sessionSecret && (
                  <div className="mt-1 text-xs text-gray-600">
                    Public: {Keypair.fromSecret(sessionSecret).publicKey().slice(0, 10)}...
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Contract ID</label>
                <input
                  type="text"
                  value={targetContract}
                  onChange={(e) => setTargetContract(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                  placeholder="C... (contract to call)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Function Name</label>
                <input
                  type="text"
                  value={targetFunction}
                  onChange={(e) => setTargetFunction(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                  placeholder="e.g., transfer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount (stroops)</label>
                <input
                  type="text"
                  value={execAmount}
                  onChange={(e) => setExecAmount(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                />
              </div>
              <button
                onClick={executeSessionTx}
                disabled={loading}
                className="px-6 py-3 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400"
              >
                {loading ? 'Processing...' : 'Execute Session Transaction'}
              </button>
            </div>
          </div>

          {/* Recover Wallet */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">5. Recover Wallet</h2>
            <p className="text-sm text-gray-600 mb-4">
              Change wallet owner using 2 guardian signatures. Guardians must be added first (step 3).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Owner Address</label>
                <input
                  type="text"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                  placeholder="G... (new owner public key)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Guardian 1 Secret Key</label>
                <input
                  type="password"
                  value={guardian1Secret}
                  onChange={(e) => setGuardian1Secret(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                  placeholder="S..."
                />
                {guardian1Secret && (
                  <div className="mt-1 text-xs text-gray-600">
                    Public: {Keypair.fromSecret(guardian1Secret).publicKey().slice(0, 10)}...
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Guardian 2 Secret Key</label>
                <input
                  type="password"
                  value={guardian2Secret}
                  onChange={(e) => setGuardian2Secret(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-gray-900"
                  placeholder="S..."
                />
                {guardian2Secret && (
                  <div className="mt-1 text-xs text-gray-600">
                    Public: {Keypair.fromSecret(guardian2Secret).publicKey().slice(0, 10)}...
                  </div>
                )}
              </div>
              <button
                onClick={recoverWallet}
                disabled={loading}
                className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
              >
                {loading ? 'Processing...' : 'Recover Wallet'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Status & Info */}
        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          {/* Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">Status</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm whitespace-pre-wrap text-gray-900 max-h-64 overflow-y-auto">
              {status || 'Ready'}
            </pre>
          </div>

          {/* Get Wallet Info Button */}
          {contractId && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">Wallet Info</h2>
              <button
                onClick={fetchWalletInfo}
                disabled={loading}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {loading ? 'Loading...' : 'Fetch Wallet Info'}
              </button>
            </div>
          )}

          {/* Wallet Info Display */}
          {walletInfo && (
            <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-700">Wallet Information</h2>
            <div className="space-y-2 text-sm font-mono text-gray-900">
              <div>
                <strong>Owner:</strong> {walletInfo.owner}
              </div>
              <div>
                <strong>Guardians:</strong> {walletInfo.guardians?.length || 0}
                {walletInfo.guardians?.map((g: string, i: number) => (
                  <div key={i} className="ml-4">- {g}</div>
                ))}
              </div>
              {walletInfo.session && (
                <div>
                  <strong>Session:</strong>
                  <div className="ml-4">Limit: {String(walletInfo.session.limit)} stroops</div>
                  <div className="ml-4">Spent: {String(walletInfo.session.spent)} stroops</div>
                  <div className="ml-4">Expires: {new Date(Number(walletInfo.session.expires_at) * 1000).toLocaleString()}</div>
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
