import express from 'express';
import cors from 'cors';

import adminRoutes from './routes/adminRoutes';
import voterRoutes from './routes/voterRoutes';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/api', (req, res) => {
  res.status(200).json({ message: 'Welcome to the VoteX Backend API!' });
});

app.use('/api/admin', adminRoutes);
app.use('/api/voters', voterRoutes);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

export default app;