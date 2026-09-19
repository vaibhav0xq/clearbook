import { Router, type IRouter } from "express";
import {
  CreateStatementBody,
  CreateStatementParams,
  CreateStatementResponse,
  ExportStatementCsvParams,
  ExportStatementPdfParams,
  GetStatementParams,
  GetStatementResponse,
  ListStatementsParams,
  ListStatementsResponse,
  PrepareNotarizationParams,
  PrepareNotarizationQueryParams,
  PrepareNotarizationResponse,
  SubmitNotarizationBody,
  SubmitNotarizationParams,
  SubmitNotarizationResponse,
} from "@workspace/api-zod";
import { assertAddress } from "../services/indexer";
import { renderStatementPdf } from "../services/pdf";
import {
  createStatement,
  listStatementSummaries,
  prepareNotarization,
  refreshPendingProof,
  requireStatement,
  statementCsv,
  statementFileName,
  statementView,
  submitNotarization,
} from "../services/statements";

const router: IRouter = Router();

router.get("/wallets/:address/statements", async (req, res) => {
  const { address } = ListStatementsParams.parse(req.params);
  assertAddress(address);
  res.json(ListStatementsResponse.parse(await listStatementSummaries(address)));
});

router.post("/wallets/:address/statements", async (req, res) => {
  const { address } = CreateStatementParams.parse(req.params);
  const body = CreateStatementBody.parse(req.body);
  const statement = await createStatement(address, {
    periodStart: typeof body.periodStart === "string" ? body.periodStart : (body.periodStart as Date).toISOString().slice(0, 10),
    periodEnd: typeof body.periodEnd === "string" ? body.periodEnd : (body.periodEnd as Date).toISOString().slice(0, 10),
    method: body.method,
    title: body.title,
  });
  res.status(201).json(CreateStatementResponse.parse(statement));
});

router.get("/statements/:statementId", async (req, res) => {
  const { statementId } = GetStatementParams.parse(req.params);
  const row = await refreshPendingProof(await requireStatement(statementId));
  res.json(GetStatementResponse.parse(statementView(row)));
});

router.get("/statements/:statementId/export.csv", async (req, res) => {
  const { statementId } = ExportStatementCsvParams.parse(req.params);
  const row = await requireStatement(statementId);
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${statementFileName(row, "csv")}"`);
  res.send(statementCsv(row));
});

router.get("/statements/:statementId/export.pdf", async (req, res) => {
  const { statementId } = ExportStatementPdfParams.parse(req.params);
  const row = await requireStatement(statementId);
  const bytes = await renderStatementPdf(row);
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="${statementFileName(row, "pdf")}"`);
  res.send(Buffer.from(bytes));
});

router.get("/statements/:statementId/notarization", async (req, res) => {
  const { statementId } = PrepareNotarizationParams.parse(req.params);
  const { payer } = PrepareNotarizationQueryParams.parse(req.query);
  res.json(PrepareNotarizationResponse.parse(await prepareNotarization(statementId, payer)));
});

router.post("/statements/:statementId/notarization", async (req, res) => {
  const { statementId } = SubmitNotarizationParams.parse(req.params);
  const body = SubmitNotarizationBody.parse(req.body);
  res.json(SubmitNotarizationResponse.parse(await submitNotarization(statementId, { signature: body.signature ?? null, simulate: body.simulate })));
});

export default router;
