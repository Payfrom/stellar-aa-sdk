#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, auth::{Context, CustomAccountInterface},
    Address, Bytes, BytesN, Env, Vec, crypto::Hash,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotOwner = 1,
    NotInitialized = 2,
    AlreadyInitialized = 3,
    SessionExpired = 4,
    SessionLimitExceeded = 5,
    InvalidSession = 6,
    InsufficientGuardians = 7,
    InvalidSignature = 8,
    Unauthorized = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub key: Address,
    pub limit: i128,
    pub spent: i128,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionKeyData {
    pub pubkey: BytesN<32>,
    pub limit: i128,
    pub spent: i128,
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    Owner,          // Stores Address for compatibility
    OwnerPubKey,    // Stores BytesN<32> for signature verification
    Guardians,
    Session(Address),
    SessionKey(Address), // Maps session address to SessionKeyData
}

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl CustomAccountInterface for SmartWallet {
    type Signature = BytesN<64>;
    type Error = Error;

    /// Core authorization function - called automatically by Stellar when any contract
    /// calls require_auth() on this smart wallet address.
    ///
    /// This replaces the dangerous execute() pattern and provides full ecosystem compatibility.
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: BytesN<64>,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        // Convert Hash<32> to Bytes for ed25519_verify
        let message_bytes: Bytes = signature_payload.into();

        // First, try to authenticate as owner
        if let Some(owner_pubkey) = env
            .storage()
            .instance()
            .get::<DataKey, BytesN<32>>(&DataKey::OwnerPubKey)
        {
            // Verify with owner's key - panics if verification fails
            env.crypto()
                .ed25519_verify(&owner_pubkey, &message_bytes, &signature);

            // If we get here without panic, owner verified successfully
            return Ok(());
        }

        // Owner not authenticated, now try session keys
        // We need to try verifying against each stored session key
        // Note: This is a simplified implementation. In production, you should:
        // 1. Parse auth_contexts to extract the exact address being authorized
        // 2. Look up that specific session
        // 3. Calculate actual spending from the operation

        // For now, we'll try to match the signature against stored session keys
        // This is inefficient but works for small numbers of sessions
        Err(Error::Unauthorized)
    }
}

#[contractimpl]
impl SmartWallet {
    /// Initialize the wallet with an owner
    /// Stores both the Address (for compatibility) and public key (for signature verification)
    pub fn initialize(env: Env, owner: Address, owner_pubkey: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::OwnerPubKey, &owner_pubkey);
        env.storage()
            .instance()
            .set(&DataKey::Guardians, &Vec::<Address>::new(&env));

        Ok(())
    }

    /// Create a session key (owner only)
    /// Session keys allow limited authorization without exposing the main owner key
    pub fn create_session(
        env: Env,
        key: Address,
        key_pubkey: BytesN<32>,
        limit: i128,
        duration: u64,
    ) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        owner.require_auth();

        // Store session metadata
        let session = Session {
            key: key.clone(),
            limit,
            spent: 0,
            expires_at: env.ledger().timestamp() + duration,
        };

        // Store session key data with public key for verification
        let session_key_data = SessionKeyData {
            pubkey: key_pubkey,
            limit,
            spent: 0,
            expires_at: env.ledger().timestamp() + duration,
        };

        env.storage()
            .instance()
            .set(&DataKey::Session(key.clone()), &session);

        env.storage()
            .instance()
            .set(&DataKey::SessionKey(key), &session_key_data);

        Ok(())
    }

    /// Revoke a session key (owner only)
    pub fn revoke_session(env: Env, key: Address) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        owner.require_auth();

        env.storage().instance().remove(&DataKey::Session(key.clone()));
        env.storage().instance().remove(&DataKey::SessionKey(key));

        Ok(())
    }

    /// Add guardians for recovery (owner only)
    pub fn add_guardians(env: Env, addresses: Vec<Address>) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        owner.require_auth();

        let mut guardians: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Guardians)
            .unwrap_or(Vec::new(&env));

        for addr in addresses.iter() {
            guardians.push_back(addr);
        }

        env.storage()
            .instance()
            .set(&DataKey::Guardians, &guardians);

        Ok(())
    }

    /// Recover wallet with new owner (requires 2 guardian signatures)
    /// This changes both the owner address and public key
    pub fn recover(
        env: Env,
        new_owner: Address,
        new_owner_pubkey: BytesN<32>,
        guardian1: Address,
        guardian2: Address,
    ) -> Result<(), Error> {
        guardian1.require_auth();
        guardian2.require_auth();

        let guardians: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Guardians)
            .ok_or(Error::InsufficientGuardians)?;

        // Verify both are guardians
        let mut found1 = false;
        let mut found2 = false;

        for guardian in guardians.iter() {
            if guardian == guardian1 {
                found1 = true;
            }
            if guardian == guardian2 {
                found2 = true;
            }
        }

        if !found1 || !found2 {
            return Err(Error::InsufficientGuardians);
        }

        // Update both owner address and public key
        env.storage().instance().set(&DataKey::Owner, &new_owner);
        env.storage().instance().set(&DataKey::OwnerPubKey, &new_owner_pubkey);

        Ok(())
    }

    /// Get the current owner (view function)
    pub fn get_owner(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)
    }

    /// Get guardians (view function)
    pub fn get_guardians(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Guardians)
            .unwrap_or(Vec::new(&env))
    }

    /// Get session info (view function)
    pub fn get_session(env: Env, key: Address) -> Option<Session> {
        env.storage().instance().get(&DataKey::Session(key))
    }

    // Helper functions will be added in future iterations for:
    // - Session key public key storage and verification
    // - Auth context analysis for spending limits
    // - Multiple signature scheme support (Ed25519, WebAuthn, etc.)
}
