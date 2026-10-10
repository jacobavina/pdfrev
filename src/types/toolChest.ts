import { MarkupStyle, MarkupTextFormat, MarkupType } from './markup';

export type ToolChestMode = 'properties' | 'drawing';

export interface ToolChestTool {
  id: string;
  paletteId: string;
  name: string;
  type: MarkupType;
  style: MarkupStyle;
  text?: string;
  textFormat?: MarkupTextFormat;
  order: number;
  mode: ToolChestMode;
  createdAt: string; // ISO
}

export interface ToolChestPalette {
  id: string;
  name: string;
  isDefault?: boolean;
  order: number;
  createdAt: string; // ISO
}

export type CreatePaletteInput = {
  name: string;
  isDefault?: boolean;
  order?: number;
  id?: string;
  createdAt?: string;
};

export type CreateToolInput = {
  paletteId: string;
  name: string;
  type: MarkupType;
  style: MarkupStyle;
  text?: string;
  textFormat?: MarkupTextFormat;
  order?: number;
  mode?: ToolChestMode;
  id?: string;
  createdAt?: string;
};

export interface RecentTool {
  id: string;
  type: MarkupType;
  style: MarkupStyle;
  text?: string;
  textFormat?: MarkupTextFormat;
  mode: ToolChestMode;
  timestamp: number; // ms epoch
}

export type ToolChestPersistenceErrorReason =
  | 'unavailable'
  | 'blocked'
  | 'quotaExceeded'
  | 'transactionError'
  | 'openError';

export interface ToolChestPersistenceErrorInfo {
  error: Error;
  reason: ToolChestPersistenceErrorReason;
  isPersistent: boolean;
}

export type ToolChestErrorHandler = (info: ToolChestPersistenceErrorInfo) => void;
