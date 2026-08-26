import "dotenv/config";
import express from "express";
import cors from "cors";
import { raceGoalsRouter } from "./routes/raceGoals.js";
import { trainingPlansRouter } from "./routes/trainingPlans.js";
import { workoutLogsRouter } from "./routes/workoutLogs.js";
import { profilesRouter } from "./routes/profiles.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/profiles", profilesRouter);
app.use("/race-goals", raceGoalsRouter);
app.use("/training-plans", trainingPlansRouter);
app.use("/workout-logs", workoutLogsRouter);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
app.listen(port, () => {
  console.log(`API en écoute sur http://localhost:${port}`);
});
