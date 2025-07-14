VoteX Backend (Node.js with TypeScript)
This repository contains the backend API services for the VoteX Blockchain-Based E-Voting System. It acts as the intermediary between the React frontend, the MySQL database, and the Solidity smart contracts on the blockchain.

✨ Features
Admin API: Endpoints for managing elections (create, start, end, audit), posts, candidates, and registering voters.

Voter API: Endpoints for voter authentication (wallet signature), viewing available elections, casting votes, and retrieving vote receipts.

Public API: Endpoints for viewing public election results.

MySQL Integration: Stores off-chain data such as election metadata, voter profiles, party details, and audit logs.

Blockchain Integration: Interacts with deployed Solidity smart contracts for core voting logic (whitelisting, vote casting, result tallying).

JWT Authentication: Secure API access for both administrators and authenticated voters.

Cloudinary Integration: (Optional) For image storage (e.g., candidate photos).

🧱 Tech Stack
Backend Framework: Node.js with Express.js

Language: TypeScript

Database: MySQL (mysql2 client)

Blockchain Interaction: Ethers.js

Authentication: JSON Web Tokens (JWT)

Password Hashing: Bcrypt.js

Environment Variables: Dotenv

Image Storage: Cloudinary SDK

🚀 Getting Started
Follow these steps to get the VoteX Backend up and running on your local machine.

Prerequisites
Node.js (LTS version recommended)

npm (Node Package Manager) or Yarn

MySQL Server (running locally or accessible)

VoteX Smart Contracts (deployed to local Hardhat Network)

Installation
Clone the repository:

git clone https://github.com/SegunCodes/votex-api.git # Replace with your actual repo URL
cd votex-backend

Install dependencies:

npm install
# or
yarn install

Configure Environment Variables:
Create a .env file in the root of the votex-backend directory:

# .env
PORT=5000
JWT_SECRET=YOUR_SUPER_SECRET_JWT_KEY # IMPORTANT: Use a strong, random string
ADMIN_EMAIL=
ADMIN_PASSWORD=

# MySQL Database Configuration
DB_HOST=localhost
DB_USER=
DB_PASSWORD=
DB_DATABASE=
DB_PORT=3306

# Ethereum Blockchain Configuration (for backend to interact with contracts)
ETHEREUM_RPC_URL=http://127.0.0.1:8545 # Hardhat Network default RPC
ADMIN_PRIVATE_KEY=0xYOUR_HARDHAT_NODE_TEST_PRIVATE_KEY # Private key of the wallet that deploys/administers contracts
ELECTION_SYSTEM_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS # Replace with your deployed contract address

# Cloudinary Credentials (Optional, only if using image upload)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

JWT_SECRET: A secret key for signing JWTs.

ADMIN_EMAIL / ADMIN_PASSWORD: Default admin credentials for testing.

DB_*: Your MySQL database connection details.

ETHEREUM_RPC_URL: The RPC endpoint for your local Hardhat Network.

ADMIN_PRIVATE_KEY: The private key of the Ethereum wallet that acts as the admin for your smart contract (must have test ETH on Hardhat Network).

ELECTION_SYSTEM_CONTRACT_ADDRESS: The address of the deployed VoteXElection smart contract (obtained after deploying contracts, see votex-contracts README).

CLOUDINARY_*: Your Cloudinary API credentials if you enable image uploads.

Database Setup and Seeding
Create MySQL Database:
Ensure you have a MySQL server running and create a database named votex_db (or whatever you configured in DB_DATABASE).

Build Project:
Compile the TypeScript code:

npm run build

Seed Database:
This script will create the necessary tables and populate initial data (admin user, parties, party members, some voters).

npm run seed-db

Important: If you restart your local Hardhat Network (npx hardhat node), its state is reset. It's highly recommended to run npm run seed-db again after restarting npx hardhat node to keep your database synchronized with the fresh blockchain state.

Running the Application
To start the development server:

npm run dev
# or
yarn dev

The backend API will typically be available at http://localhost:5000/api.

📂 Project Structure
votex-backend/
├── dist/                     # Compiled JavaScript output
├── src/
│   ├── config/               # Database and other configurations
│   ├── controllers/          # Business logic for API endpoints
│   ├── database/             # SQL schema and seeding scripts
│   ├── routes/               # API route definitions
│   ├── services/             # Interactions with MySQL, Blockchain, Auth, Cloudinary
│   ├── types/                # TypeScript type definitions
│   └── app.ts                # Main Express application setup
├── .env                      # Environment variables (local)
├── .gitignore
├── package.json
├── tsconfig.json             # TypeScript configuration
└── server.ts                 # Entry point for starting the server

🤝 Contributing
Contributions are welcome! Please follow standard Gitflow practices.