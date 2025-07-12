import { Router, Request, Response, NextFunction } from "express";
import * as voterController from "../controllers/voterController";
import * as authController from "../controllers/authController";
import { verifyToken } from "../services/authService";
import { DecodedToken } from "../types/index.d";

const router = Router();

const authenticateVoter = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authentication token required. Format: Bearer [token]" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }

  if (decoded.role !== "voter" || !decoded.walletAddress) {
    return res
      .status(403)
      .json({
        error: "Access denied. Valid voter token with wallet address required.",
      });
  }

  req.user = decoded;
  next();
};

// Endpoint for the frontend to get the unique message to sign for authentication.
router.post("/request-auth-message", authController.requestVoterAuthMessage);
// Endpoint for voter login using wallet signature verification.
router.post("/authenticate", authController.voterAuthenticate);
// Retrieves public results for a specific election.
router.get(
  "/elections/:electionId/results",
  voterController.getElectionResults
);
router.use(authenticateVoter);
router.get("/elections", voterController.getAvailableElections);
router.post("/vote", voterController.castVote);
router.get(
  "/elections/:electionId/status",
  voterController.getVoterElectionStatus
);
router.get("/receipts", voterController.getVoterVoteReceipts);

export default router;
