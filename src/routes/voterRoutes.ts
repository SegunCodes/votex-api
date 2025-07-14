import { Router, Request, Response, NextFunction } from 'express';
import * as voterController from '../controllers/voterController';
import * as authController from '../controllers/authController';
import { verifyToken } from '../services/authService';
import { DecodedToken }  from '../types/index.d';

const router = Router();

// Message that the frontend will sign for voter authentication
export const VOTER_AUTH_MESSAGE = "Authenticate to VoteX: Please sign this message to verify your identity. This action will not cost gas.";

// --- Voter Authentication Middleware ---
const authenticateVoter = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required. Format: Bearer [token]' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }

  if (decoded.role !== 'voter' || !decoded.walletAddress) {
    return res.status(403).json({ error: 'Access denied. Valid voter token with wallet address required.' });
  }

  req.user = decoded;
  next();
};

// --- Public Routes (No Authentication Required) ---
router.get('/auth-message', (req: Request, res: Response) => {
  res.status(200).json({ message: VOTER_AUTH_MESSAGE });
});
router.post('/request-auth-message', authController.requestVoterAuthMessage);
router.post('/authenticate', authController.voterAuthenticate);
router.get('/elections/:electionId/results', voterController.getElectionResults);
router.get('/elections/:electionId', voterController.getElectionDetailsPublic);
router.get('/elections/:electionId/posts', voterController.getElectionPostsPublic);
router.get('/posts/:postId/candidates', voterController.getPostCandidatesPublic);
router.get('/public/elections', voterController.getAllElectionsPublic);

// --- Protected Voter Routes (Require Authentication) ---
router.use(authenticateVoter);
router.get('/elections', voterController.getAvailableElections);
router.post('/vote', voterController.castVote);
router.get('/elections/:electionId/status', voterController.getVoterElectionStatus);
router.get('/receipts', voterController.getVoterVoteReceipts);


export default router;