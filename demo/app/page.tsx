'use client';

import { useState } from 'react';
import {
  initializeWallet,
  createSessionKey,
  addGuardiansToWallet,
  executeWithSession,
  recoverWalletWithGuardians,
  fetchWalletInformation,
} from '@/lib/walletOperations';
import { generateKeypair, fundAccount, getPublicKey } from '@/lib/utils';

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
  const [sessionSecret, setSessionSecret] = useState('');

  // Session execution state
  const [execAmount, setExecAmount] = useState('100');
  const [targetContract, setTargetContract] = useState('');
  const [targetFunction, setTargetFunction] = useState('');

  // Guardian state
  const [guardian1, setGuardian1] = useState('');
  const [guardian2, setGuardian2] = useState('');
  const [guardian1Secret, setGuardian1Secret] = useState('');
  const [guardian2Secret, setGuardian2Secret] = useState('');

  // Recovery state
  const [newOwner, setNewOwner] = useState('');

  const handleGenerateKeys = async () => {
    const { publicKey, secretKey } = generateKeypair();
    setOwnerSecret(secretKey);
    setStatus(`Generated keys. Public: ${publicKey}\n\nFunding account on testnet...`);

    const funded = await fundAccount(publicKey);
    if (funded) {
      setStatus(`Generated keys. Public: ${publicKey}\n\n✓ Account funded successfully!`);
    } else {
      setStatus(`Generated keys. Public: ${publicKey}\n\n⚠ Warning: Failed to fund account. You may need to fund it manually at https://laboratory.stellar.org/#account-creator?network=test`);
    }
  };

  const handleGenerateSessionKey = () => {
    const { publicKey, secretKey } = generateKeypair();
    setSessionKey(publicKey);
    setSessionSecret(secretKey);
    setStatus(`Generated session key!\n\nPublic: ${publicKey}\nSecret: ${secretKey}\n\n⚠ SAVE THE SECRET KEY! You'll need it to execute transactions with this session.\n\nNote: Session keys don't need funding - they're authorized by the owner.`);
  };

  const handleGenerateGuardianKeys = () => {
    const g1 = generateKeypair();
    const g2 = generateKeypair();
    setGuardian1(g1.publicKey);
    setGuardian2(g2.publicKey);
    setGuardian1Secret(g1.secretKey);
    setGuardian2Secret(g2.secretKey);
    setStatus(`Generated guardians!\n\nGuardian 1:\nPublic: ${g1.publicKey}\nSecret: ${g1.secretKey}\n\nGuardian 2:\nPublic: ${g2.publicKey}\nSecret: ${g2.secretKey}\n\n⚠ SAVE THESE SECRET KEYS! You'll need them for wallet recovery.`);
  };

  const handleInitializeWallet = async () => {
    if (!contractId || !ownerSecret) {
      setStatus('Please provide contract ID and owner secret key');
      return;
    }

    setLoading(true);
    try {
      const { ownerPublicKey } = await initializeWallet(contractId, ownerSecret, setStatus);
      setStatus(`✓ Wallet initialized successfully!\n\nOwner: ${ownerPublicKey}\n\nFetching wallet info...`);
      await handleFetchWalletInfo();
      setStatus(`✓ Wallet initialized successfully!\n\nOwner: ${ownerPublicKey}`);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!contractId || !ownerSecret || !sessionKey) {
      setStatus('Please provide all required fields');
      return;
    }

    setLoading(true);
    try {
      await createSessionKey(
        contractId,
        ownerSecret,
        sessionKey,
        sessionLimit,
        parseInt(sessionDuration),
        setStatus
      );

      setStatus('✓ Session created successfully!');
      await handleFetchWalletInfo();
    } catch (error: any) {
      console.error('Session creation error:', error);
      setStatus(`✗ Error creating session:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGuardians = async () => {
    if (!contractId || !ownerSecret || !guardian1 || !guardian2) {
      setStatus('Please provide all required fields');
      return;
    }

    setLoading(true);
    try {
      await addGuardiansToWallet(contractId, ownerSecret, [guardian1, guardian2], setStatus);

      setStatus('✓ Guardians added successfully! Fetching wallet info...');
      await handleFetchWalletInfo();
      setStatus(`✓ Guardians added successfully!\n\nGuardian 1: ${guardian1}\nGuardian 2: ${guardian2}`);
    } catch (error: any) {
      console.error('Full error:', error);
      setStatus(`✗ Error adding guardians:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSessionTx = async () => {
    if (!contractId || !sessionSecret || !targetContract || !targetFunction || !execAmount) {
      setStatus('Please provide all required fields for session execution');
      return;
    }

    setLoading(true);
    try {
      await executeWithSession(
        contractId,
        sessionSecret,
        targetContract,
        targetFunction,
        execAmount,
        setStatus
      );

      setStatus('✓ Session execution successful!');
      await handleFetchWalletInfo();
    } catch (error: any) {
      console.error('Session execution error:', error);
      setStatus(`✗ Error executing session:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverWallet = async () => {
    if (!contractId || !guardian1Secret || !guardian2Secret || !newOwner) {
      setStatus('Please provide all required fields for recovery');
      return;
    }

    setLoading(true);
    try {
      await recoverWalletWithGuardians(
        contractId,
        guardian1Secret,
        guardian2Secret,
        newOwner,
        setStatus
      );

      setStatus('✓ Wallet recovery successful! Owner has been changed.');
      await handleFetchWalletInfo();
    } catch (error: any) {
      console.error('Recovery error:', error);
      setStatus(`✗ Error recovering wallet:\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchWalletInfo = async () => {
    if (!contractId) return;

    setLoading(true);
    try {
      const info = await fetchWalletInformation(contractId, ownerSecret, sessionKey);
      setWalletInfo(info);
      setStatus('✓ Wallet info fetched successfully!');
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
                    {getPublicKey(ownerSecret) === walletInfo.owner ? (
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
                      onClick={handleGenerateKeys}
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
                    <code className="ml-1">{getPublicKey(ownerSecret).slice(0, 10)}...</code>
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
                  onClick={handleInitializeWallet}
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
                  onClick={handleGenerateSessionKey}
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
                onClick={handleCreateSession}
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
                onClick={handleGenerateGuardianKeys}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Generate Guardian Keys
              </button>
              <button
                onClick={handleAddGuardians}
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
                    Public: {getPublicKey(sessionSecret).slice(0, 10)}...
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
                onClick={handleExecuteSessionTx}
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
                    Public: {getPublicKey(guardian1Secret).slice(0, 10)}...
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
                    Public: {getPublicKey(guardian2Secret).slice(0, 10)}...
                  </div>
                )}
              </div>
              <button
                onClick={handleRecoverWallet}
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
                onClick={handleFetchWalletInfo}
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
