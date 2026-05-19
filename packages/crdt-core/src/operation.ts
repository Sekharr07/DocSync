import { CharId } from "./char";

export type OperationType = "insert" | "delete";

export interface InsertOperation {
  type: "insert";
  charId: CharId;      // renamed from "id" — avoids Mongoose's virtual .id getter
  value: string;
  parentId: CharId | null;
  siteId: string;
  clock: number;
}

export interface DeleteOperation {
  type: "delete";
  targetId: CharId;
  siteId: string;
  clock: number;
}

export type Operation = InsertOperation | DeleteOperation;
