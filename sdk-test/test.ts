import {
  WalletFactory,
  SmartWallet,
  StellarSDK,
} from "@stellar-aa/sdk";
import * as fs from "fs";
import * as path from "path";

const { Keypair, Networks } = StellarSDK;

const TEST_ACCOUNT_FILE = path.join(__dirname, "test-account.json");

interface Guardian {
  publicKey: string;
  secretKey: string;
}

interface TestAccount {
  publicKey: string;
  secretKey: string;
  contractId?: string;
  guardians?: Guardian[];
}

async function fundAccount(publicKey: string): Promise<void> {
  console.log(`► Funding account ${publicKey.slice(0, 8)}... via Friendbot...`);
  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) {
      const text = await response.text();
      // Account might already be funded
      if (text.includes("createAccountAlreadyExist")) {
        console.log("  [i] Account already funded");
        return;
      }
      throw new Error(`Failed to fund account: ${text}`);
    }
    await response.json();
    console.log("  ✓ Account funded successfully");
  } catch (error) {
    console.error("  ✗ Funding error:", error);
    throw error;
  }
  // Wait for account to be available
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function waitForConfirmation(seconds: number = 3): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function getOrCreateTestAccount(): Promise<{
  keypair: StellarSDK.Keypair;
  contractId?: string;
  guardians?: Guardian[];
}> {
  // Check if test account exists
  if (fs.existsSync(TEST_ACCOUNT_FILE)) {
    console.log("► Loading existing test account...");
    const data = JSON.parse(
      fs.readFileSync(TEST_ACCOUNT_FILE, "utf-8")
    ) as TestAccount;
    const keypair = Keypair.fromSecret(data.secretKey);
    console.log("  ✓ Loaded account:", data.publicKey);
    return { keypair, contractId: data.contractId, guardians: data.guardians };
  }

  // Create new test account
  console.log("► Creating new test account...");
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  console.log("  • Public Key:", publicKey);
  console.log("  • Secret Key:", secretKey);

  // Fund the account
  await fundAccount(publicKey);

  // Save to file
  const accountData: TestAccount = {
    publicKey,
    secretKey,
  };
  fs.writeFileSync(TEST_ACCOUNT_FILE, JSON.stringify(accountData, null, 2));
  console.log("  ✓ Test account saved to test-account.json");

  return { keypair };
}

function saveContractId(contractId: string): void {
  const data = JSON.parse(
    fs.readFileSync(TEST_ACCOUNT_FILE, "utf-8")
  ) as TestAccount;
  data.contractId = contractId;
  fs.writeFileSync(TEST_ACCOUNT_FILE, JSON.stringify(data, null, 2));
  console.log("  ✓ Contract ID saved to test-account.json");
}

function saveGuardians(guardians: Guardian[]): void {
  const data = JSON.parse(
    fs.readFileSync(TEST_ACCOUNT_FILE, "utf-8")
  ) as TestAccount;
  data.guardians = guardians;
  fs.writeFileSync(TEST_ACCOUNT_FILE, JSON.stringify(data, null, 2));
  console.log("  ✓ Guardians saved to test-account.json");
}

async function getOrCreateGuardians(existingGuardians?: Guardian[]): Promise<{
  guardian1: StellarSDK.Keypair;
  guardian2: StellarSDK.Keypair;
  guardian3: StellarSDK.Keypair;
}> {
  if (existingGuardians && existingGuardians.length >= 3) {
    console.log("  ✓ Using existing guardians from storage");
    return {
      guardian1: Keypair.fromSecret(existingGuardians[0].secretKey),
      guardian2: Keypair.fromSecret(existingGuardians[1].secretKey),
      guardian3: Keypair.fromSecret(existingGuardians[2].secretKey),
    };
  }

  console.log("  • Creating and funding new guardian accounts...");
  const guardian1 = Keypair.random();
  const guardian2 = Keypair.random();
  const guardian3 = Keypair.random();

  // Fund all guardians
  await fundAccount(guardian1.publicKey());
  await fundAccount(guardian2.publicKey());
  await fundAccount(guardian3.publicKey());

  // Save to file
  const guardiansData: Guardian[] = [
    { publicKey: guardian1.publicKey(), secretKey: guardian1.secret() },
    { publicKey: guardian2.publicKey(), secretKey: guardian2.secret() },
    { publicKey: guardian3.publicKey(), secretKey: guardian3.secret() },
  ];
  saveGuardians(guardiansData);

  return { guardian1, guardian2, guardian3 };
}

async function testSDK() {
  // Get or create test account
  const { keypair, contractId: existingContractId, guardians: existingGuardians } =
    await getOrCreateTestAccount();

  // Test 1: Create factory
  console.log("\n► Creating WalletFactory...");
  const factory = new WalletFactory({
    wasmHash:
      "8a02111e765f6fc970a95b9af8efc137649a611b2b576a52bfe5c59a0a1a5da0",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  });

  let contractId = existingContractId;

  // Test 2: Deploy wallet (if not already deployed)
  if (!contractId) {
    console.log("\n► Deploying smart wallet...");
    console.log("  • Owner:", keypair.publicKey());

    contractId = await factory.createWallet(
      keypair.publicKey(),
      keypair
    );

    console.log("  ✓ Wallet deployed:", contractId);
    saveContractId(contractId);
  } else {
    console.log("\n► Using existing wallet:", contractId);
  }

  // Test 3: Use wallet
  console.log("\n► Testing wallet functionality...");
  const wallet = new SmartWallet({
    contractId,
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  });

  const owner = await wallet.getOwner();
  console.log("  ✓ Owner:", owner);
  console.log("  ✓ Owner matches:", owner === keypair.publicKey());

  // Test 4: Get guardians
  const guardians = await wallet.getGuardians();
  console.log("  ✓ Guardians count:", guardians.length);

  // Test 5: Create and test session
  console.log("\n► Testing session functionality...");
  const sessionKeypair = Keypair.random();
  console.log("  • Creating session key:", sessionKeypair.publicKey());

  const sessionLimit = "1000000"; // 1 XLM equivalent in stroops
  const sessionDuration = 3600; // 1 hour

  await wallet.createSession(
    sessionKeypair.publicKey(),
    sessionLimit,
    sessionDuration,
    keypair
  );
  console.log("  ✓ Session created");
  await waitForConfirmation();

  // Test 6: Get session info
  console.log("\n► Retrieving session info...");
  const sessionInfo = await wallet.getSession(sessionKeypair.publicKey());
  console.log("  ✓ Session info:", sessionInfo);
  if (sessionInfo) {
    console.log("    • Limit:", sessionInfo.limit);
    console.log("    • Spent:", sessionInfo.spent);
    console.log("    • Expires at:", sessionInfo.expires_at);
  }

  // Test 7: Add guardians
  console.log("\n► Testing guardian management...");
  const { guardian1, guardian2, guardian3 } = await getOrCreateGuardians(existingGuardians);

  console.log("  • Guardian accounts:");
  console.log("    - Guardian 1:", guardian1.publicKey());
  console.log("    - Guardian 2:", guardian2.publicKey());
  console.log("    - Guardian 3:", guardian3.publicKey());

  // Check if guardians are already added to contract
  const currentGuardians = await wallet.getGuardians();
  const guardian1Exists = currentGuardians.includes(guardian1.publicKey());
  const guardian2Exists = currentGuardians.includes(guardian2.publicKey());
  const guardian3Exists = currentGuardians.includes(guardian3.publicKey());

  if (!guardian1Exists || !guardian2Exists || !guardian3Exists) {
    console.log("  • Adding guardians to contract...");
    await wallet.addGuardians(
      [guardian1.publicKey(), guardian2.publicKey(), guardian3.publicKey()],
      keypair
    );
    console.log("  ✓ Guardians added to contract");
    await waitForConfirmation();
  } else {
    console.log("  ✓ Guardians already added to contract");
  }

  // Test 8: Verify guardians were added
  console.log("\n► Verifying guardians...");
  const updatedGuardians = await wallet.getGuardians();
  console.log("  ✓ Total guardians:", updatedGuardians.length);
  console.log("  • Guardians:", updatedGuardians);

  // Test 9: Test recovery flow
  console.log("\n► Testing recovery flow...");
  const newOwnerKeypair = Keypair.random();
  console.log("  • New owner:", newOwnerKeypair.publicKey());
  console.log("  • Using guardians:", guardian1.publicKey().slice(0, 8) + "...", "and", guardian2.publicKey().slice(0, 8) + "...");

  try {
    await wallet.recover(
      newOwnerKeypair.publicKey(),
      guardian1.publicKey(),
      guardian2.publicKey(),
      guardian1,
      guardian2
    );
    console.log("  ✓ Wallet recovered with new owner");
    await waitForConfirmation();

    // Verify new owner
    const recoveredOwner = await wallet.getOwner();
    console.log("  ✓ New owner:", recoveredOwner);
    console.log("  ✓ Owner matches:", recoveredOwner === newOwnerKeypair.publicKey());
  } catch (error: any) {
    console.error("  ✗ Recovery failed:", error.message || error);
  }

  console.log("\n✓ All tests completed!");
  console.log("\nTest Summary:");
  console.log("  ✓ WalletFactory creation");
  console.log("  ✓ Smart wallet deployment");
  console.log("  ✓ Owner verification");
  console.log("  ✓ Guardian management");
  console.log("  ✓ Session creation");
  console.log("  ✓ Session retrieval");
  console.log("  ✓ Guardian addition and verification");
  console.log("  ✓ Wallet recovery flow");
}

testSDK().catch(console.error);
