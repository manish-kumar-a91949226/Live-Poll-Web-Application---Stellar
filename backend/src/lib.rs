#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Symbol};

#[contract]
pub struct LivePollContract;

const OPTION_A: Symbol = symbol_short!("OptionA");
const OPTION_B: Symbol = symbol_short!("OptionB");
const VOTERS: Symbol = symbol_short!("Voters");

#[contractimpl]
impl LivePollContract {
    /// Initialize the poll
    pub fn init(env: Env) {
        env.storage().instance().set(&OPTION_A, &0u32);
        env.storage().instance().set(&OPTION_B, &0u32);
    }

    /// Cast a vote for an option (1 for A, 2 for B)
    pub fn vote(env: Env, voter: Address, option: u32) {
        voter.require_auth();

        if option == 1 {
            let mut current: u32 = env.storage().instance().get(&OPTION_A).unwrap_or(0);
            current += 1;
            env.storage().instance().set(&OPTION_A, &current);
        } else if option == 2 {
            let mut current: u32 = env.storage().instance().get(&OPTION_B).unwrap_or(0);
            current += 1;
            env.storage().instance().set(&OPTION_B, &current);
        } else {
            panic!("Invalid option");
        }

        // Emit an event
        env.events().publish((symbol_short!("vote"), option), voter);
    }

    /// Get current vote counts for A and B
    pub fn get_votes(env: Env) -> (u32, u32) {
        let count_a: u32 = env.storage().instance().get(&OPTION_A).unwrap_or(0);
        let count_b: u32 = env.storage().instance().get(&OPTION_B).unwrap_or(0);
        (count_a, count_b)
    }
}
