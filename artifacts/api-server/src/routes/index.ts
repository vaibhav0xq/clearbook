import { Router, type IRouter } from "express";
import configRouter from "./config";
import healthRouter from "./health";
import statementsRouter from "./statements";
import tradesRouter from "./trades";
import walletsRouter from "./wallets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(walletsRouter);
router.use(statementsRouter);
router.use(tradesRouter);

export default router;
