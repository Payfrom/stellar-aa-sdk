#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env,
    Symbol, Val, Vec,
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
pub enum DataKey {
    Owner,
    Guardians,
    Session(Address),
}

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl SmartWallet {
    /// Initialize the wallet with an owner
    pub fn initialize(env: Env, owner: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage()
            .instance()
            .set(&DataKey::Guardians, &Vec::<Address>::new(&env));

        Ok(())
    }

    /// Execute a contract call (owner only)
    pub fn execute(
        env: Env,
        target: Address,
        function: Symbol,
        args: Vec<Val>,
    ) -> Result<Val, Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        owner.require_auth();

        let result = env.invoke_contract(&target, &function, args);
        Ok(result)
    }

    /// Create a session key (owner only)
    pub fn create_session(env: Env, key: Address, limit: i128, duration: u64) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        owner.require_auth();

        let session = Session {
            key: key.clone(),
            limit,
            spent: 0,
            expires_at: env.ledger().timestamp() + duration,
        };

        env.storage()
            .instance()
            .set(&DataKey::Session(key), &session);

        Ok(())
    }

    /// Execute using a session key
    pub fn execute_session(
        env: Env,
        key: Address,
        target: Address,
        function: Symbol,
        args: Vec<Val>,
        amount: i128,
    ) -> Result<Val, Error> {
        key.require_auth();

        let mut session: Session = env
            .storage()
            .instance()
            .get(&DataKey::Session(key.clone()))
            .ok_or(Error::InvalidSession)?;

        // Check expiration
        if env.ledger().timestamp() > session.expires_at {
            return Err(Error::SessionExpired);
        }

        // Check limit
        if session.spent + amount > session.limit {
            return Err(Error::SessionLimitExceeded);
        }

        // Update spent amount
        session.spent += amount;
        env.storage()
            .instance()
            .set(&DataKey::Session(key), &session);

        let result = env.invoke_contract(&target, &function, args);
        Ok(result)
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
    pub fn recover(
        env: Env,
        new_owner: Address,
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

        // Update owner
        env.storage().instance().set(&DataKey::Owner, &new_owner);

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
}
