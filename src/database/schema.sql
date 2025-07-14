-- Drop tables if they exist to allow for clean re-creation during development
DROP TABLE IF EXISTS voter_receipts;
DROP TABLE IF EXISTS vote_logs;
DROP TABLE IF EXISTS candidates;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS elections;
DROP TABLE IF EXISTS voters;
DROP TABLE IF EXISTS party_members;
DROP TABLE IF EXISTS parties;
DROP TABLE IF EXISTS users; -- For admin users, etc.

-- 1. Users Table (for Admin login, potentially other internal users)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'voter') NOT NULL, -- 'voter' role here for backend management, not primary voter auth
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Parties Table
CREATE TABLE parties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    logo_url VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Party Members Table (individuals who belong to parties, can become candidates)
CREATE TABLE party_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    party_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    image_url VARCHAR(255), -- Cloudinary URL for member's photo
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);

-- 4. Voters Table (Admin-registered voter profiles, linked to DIDs later)
CREATE TABLE voters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL, -- Primary identifier for admin registration
    name VARCHAR(255) NOT NULL,
    age INT,
    gender ENUM('Male', 'Female', 'Other'),
    national_id_number VARCHAR(255) UNIQUE, -- If NIN is used for verification
    wallet_address VARCHAR(255) UNIQUE, -- Linked MetaMask wallet (DID)
    auth_nonce VARCHAR(255),
    is_eligible_on_chain BOOLEAN DEFAULT FALSE, -- Set to TRUE when whitelisted on smart contract
    registration_status ENUM('pending_email_verification', 'email_verified', 'wallet_linked', 'eligible_on_chain') DEFAULT 'pending_email_verification',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Elections Table
CREATE TABLE elections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status ENUM('pending', 'active', 'ended') DEFAULT 'pending',
    blockchain_contract_address VARCHAR(255), -- Address of the deployed smart contract for this election
    results JSON, -- Store final aggregated results as JSON
    winning_candidate_id INT, -- ID of the winning candidate from the candidates table
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6. Posts Table (e.g., President, Governor, Senator within an election)
CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    election_id INT NOT NULL,
    name VARCHAR(255) NOT NULL, -- e.g., "President", "Governor"
    max_votes_per_voter INT DEFAULT 1, -- How many candidates a voter can choose for this post
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE
);

-- 7. Candidates Table (linking party members to specific election posts)
CREATE TABLE candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    election_id INT NOT NULL, -- Redundant but useful for direct queries
    party_member_id INT NOT NULL,
    blockchain_candidate_id VARCHAR(255), -- ID used in smart contract (e.g., hash of their name/party)
    vote_count INT DEFAULT 0, -- Can be updated from blockchain (for display/final results)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    FOREIGN KEY (party_member_id) REFERENCES party_members(id) ON DELETE CASCADE,
    UNIQUE (post_id, party_member_id) -- A party member can only run for a post once per election
);

-- 8. Vote Logs Table (for backend auditing, not anonymous vote storage)
CREATE TABLE vote_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    election_id INT NOT NULL,
    post_id INT NOT NULL,
    candidate_id INT NOT NULL,
    voter_wallet_address VARCHAR(255) NOT NULL, -- The DID of the voter who cast the vote
    transaction_hash VARCHAR(255) UNIQUE NOT NULL, -- Blockchain transaction hash for the vote
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    -- No direct foreign key to voters.id to maintain anonymity of the vote itself,
    -- but wallet_address links to voter profile if needed for specific admin tasks.
);

-- 9. Voter Receipts Table (for voters to verify their own vote)
CREATE TABLE voter_receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voter_wallet_address VARCHAR(255) NOT NULL,
    election_id INT NOT NULL,
    post_id INT NOT NULL,
    candidate_id INT NOT NULL, -- The candidate they voted for (for their personal record)
    transaction_hash VARCHAR(255) UNIQUE NOT NULL, -- Blockchain transaction hash
    blockchain_receipt_id VARCHAR(255), -- Optional: a unique ID returned by smart contract
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);