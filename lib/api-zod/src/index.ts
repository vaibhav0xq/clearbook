export * from "./generated/api";
export type * from "./generated/types";
// Operations with both path and query parameters produce a zod schema and a
// TypeScript type with the same name. The explicit re-export below resolves the
// ambiguity in favour of the zod schema (path params). Query params remain
// available as <OperationId>QueryParams.
export { ExportTaxLotsCsvParams, GetPortfolioParams, GetTaxLotsParams, ListActivityParams, ListLotsParams, PrepareNotarizationParams } from "./generated/api";
export * from './generated/types';
