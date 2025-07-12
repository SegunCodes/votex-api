// --- Base Types ---
interface Timestamped {
  created_at?: Date;
  updated_at?: Date;
}

// --- User/Auth Types ---
export interface DecodedToken {
  id?: number; // User ID from DB
  email?: string;
  walletAddress?: string; // For voters
  role: "admin" | "voter";
  iat: number;
  exp: number;
}

// Extend Express Request to include user property
declare global {
  namespace Express {
    interface Request {
      user?: DecodedToken;
    }
  }
}

// --- Database Models ---
export interface User extends Timestamped {
  id?: number; // Auto-incrementing primary key
  email: string;
  password_hash: string;
  role: "admin" | "voter";
}

export interface Party extends Timestamped {
  id?: number;
  name: string;
  logo_url?: string;
  description?: string;
}

export interface PartyMember extends Timestamped {
  id?: number;
  party_id: number;
  name: string;
  email: string;
  image_url?: string; // Cloudinary URL for member's photo
}

export interface Voter extends Timestamped {
  id?: number;
  email: string; // Primary identifier for admin registration
  name: string;
  age: number;
  gender: "Male" | "Female" | "Other";
  national_id_number?: string; // If NIN is used for verification
  wallet_address?: string; // Linked MetaMask wallet (DID)
  is_eligible_on_chain?: boolean; // If whitelisted on smart contract
  registration_status:
    | "pending_email_verification"
    | "email_verified"
    | "wallet_linked"
    | "eligible_on_chain";
  // Add a nonce for wallet linking/authentication
  auth_nonce?: string;
}

export interface Election extends Timestamped {
  id?: number;
  title: string;
  description: string;
  start_date: Date;
  end_date: Date;
  status: "pending" | "active" | "ended"; // pending, active, ended
  blockchain_contract_address?: string; // Address of the deployed election smart contract
  results?: string; // Store final aggregated results as JSON string
  winning_candidate_id?: number;
}

export interface Post extends Timestamped {
  // Represents an election post like "President", "Governor"
  id?: number;
  election_id: number;
  name: string; // e.g., "President", "Governor"
  max_votes_per_voter?: number; // How many candidates a voter can choose for this post
}

export interface Candidate extends Timestamped {
  id?: number;
  post_id: number; // Links to a specific election post
  election_id: number; // Redundant but useful for direct queries
  party_member_id: number; // Links to party_members table
  blockchain_candidate_id?: string; // ID used in smart contract (e.g., hash of their name/party)
  vote_count?: number; // Can be updated from blockchain (for display/final results)
}

export interface VoteLog extends Timestamped {
  // For backend auditing, not anonymous vote storage
  id?: number;
  election_id: number;
  post_id: number;
  candidate_id: number;
  voter_wallet_address: string; // The DID of the voter who cast the vote
  transaction_hash: string; // Blockchain transaction hash
}

export interface VoterReceipt extends Timestamped {
  // For voters to verify their own vote
  id?: number;
  voter_wallet_address: string;
  election_id: number;
  post_id: number;
  candidate_id: number; // The candidate they voted for (for their personal record)
  transaction_hash: string;
  blockchain_receipt_id?: string; // Optional: a unique ID returned by smart contract
}
