import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { connectDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { exercisesRouter } from './routes/exercises.js';
import { workoutsRouter } from './routes/workouts.js';
import { nutritionRouter } from './routes/nutrition.js';
import { programsRouter } from './routes/programs.js';
import { usersRouter } from './routes/users.js';
import { coachesRouter } from './routes/coaches.js';
import { coachRequestsRouter } from './routes/coachRequests.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '512kb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

app.use('/auth', authRouter);
app.use('/exercises', exercisesRouter);
app.use('/workouts', workoutsRouter);
app.use('/nutrition', nutritionRouter);
app.use('/programs', programsRouter);
app.use('/users', usersRouter);
app.use('/coaches', coachesRouter);
app.use('/coach-requests', coachRequestsRouter);

connectDb().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
