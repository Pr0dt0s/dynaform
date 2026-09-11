import type { EncryptedPayload, FormField } from "./types";

export class ValidationError extends Error {}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export function validatePublicKey(v: unknown): string {
  if (!isNonEmptyString(v)) throw new ValidationError("publicKey is required");
  // Raw uncompressed P-256 point (0x04 || X || Y = 65 bytes), base64url-encoded.
  const decoded = Buffer.from(v, "base64url");
  if (decoded.length !== 65 || decoded[0] !== 0x04) {
    throw new ValidationError("publicKey must be a base64url-encoded raw uncompressed P-256 point");
  }
  return v;
}

function validateOptionValues(options: unknown[], fieldIndex: number): void {
  const seen = new Set<string>();
  for (const [j, opt] of options.entries()) {
    const value = (opt as Record<string, unknown>)?.value;
    if (!isNonEmptyString(value)) {
      throw new ValidationError(`fields[${fieldIndex}].options[${j}].value is required`);
    }
    if (seen.has(value)) {
      throw new ValidationError(`fields[${fieldIndex}].options[${j}].value is duplicated: ${value}`);
    }
    seen.add(value);
  }
}

function validateVisibleIf(v: unknown, fieldIndex: number): void {
  if (v === undefined) return;
  if (typeof v !== "object" || v === null) throw new ValidationError(`fields[${fieldIndex}].visibleIf must be an object`);
  const cond = v as Record<string, unknown>;
  if (!isNonEmptyString(cond.field)) throw new ValidationError(`fields[${fieldIndex}].visibleIf.field is required`);
  const hasEquals = cond.equals !== undefined;
  const hasNotEquals = cond.notEquals !== undefined;
  const hasIn = cond.in !== undefined;
  if (!hasEquals && !hasNotEquals && !hasIn) {
    throw new ValidationError(`fields[${fieldIndex}].visibleIf needs one of equals/notEquals/in`);
  }
  if (hasIn && !Array.isArray(cond.in)) {
    throw new ValidationError(`fields[${fieldIndex}].visibleIf.in must be an array`);
  }
}

function validatePage(v: unknown, fieldIndex: number): void {
  if (v === undefined) return;
  if (!isNonNegativeInt(v)) throw new ValidationError(`fields[${fieldIndex}].page must be a non-negative integer`);
}

export function validateFields(v: unknown, opts: { insideRepeat?: boolean } = {}): FormField[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new ValidationError("fields must be a non-empty array");
  }
  return v.map((f, i) => {
    if (typeof f !== "object" || f === null) throw new ValidationError(`fields[${i}] must be an object`);
    const field = f as Record<string, unknown>;
    if (!isNonEmptyString(field.id)) throw new ValidationError(`fields[${i}].id is required`);
    if (!isNonEmptyString(field.type)) throw new ValidationError(`fields[${i}].type is required`);
    validateVisibleIf(field.visibleIf, i);
    if (opts.insideRepeat && field.page !== undefined) {
      throw new ValidationError(`fields[${i}].page is not allowed inside a repeat field`);
    }
    validatePage(field.page, i);

    switch (field.type) {
      case "text":
      case "textarea":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        if (field.pattern !== undefined) {
          if (!isNonEmptyString(field.pattern)) throw new ValidationError(`fields[${i}].pattern must be a string`);
          try {
            new RegExp(field.pattern);
          } catch {
            throw new ValidationError(`fields[${i}].pattern is not a valid regular expression`);
          }
        }
        if (field.minLength !== undefined && !isNonNegativeInt(field.minLength)) {
          throw new ValidationError(`fields[${i}].minLength must be a non-negative integer`);
        }
        if (field.maxLength !== undefined && !isNonNegativeInt(field.maxLength)) {
          throw new ValidationError(`fields[${i}].maxLength must be a non-negative integer`);
        }
        if (
          typeof field.minLength === "number" &&
          typeof field.maxLength === "number" &&
          field.minLength > field.maxLength
        ) {
          throw new ValidationError(`fields[${i}].minLength must be <= maxLength`);
        }
        break;
      case "number":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        for (const key of ["min", "max", "step"] as const) {
          if (field[key] !== undefined && typeof field[key] !== "number") {
            throw new ValidationError(`fields[${i}].${key} must be a number`);
          }
        }
        if (typeof field.min === "number" && typeof field.max === "number" && field.min > field.max) {
          throw new ValidationError(`fields[${i}].min must be <= max`);
        }
        break;
      case "email":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        break;
      case "single_select":
      case "multi_select": {
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        if (!Array.isArray(field.options) || field.options.length === 0) {
          throw new ValidationError(`fields[${i}].options must be a non-empty array`);
        }
        validateOptionValues(field.options, i);
        const columns = field.columns;
        if (columns !== undefined) {
          if (!Array.isArray(columns) || columns.length === 0 || !columns.every(isNonEmptyString)) {
            throw new ValidationError(`fields[${i}].columns must be a non-empty array of strings`);
          }
          for (const [j, opt] of (field.options as unknown[]).entries()) {
            const o = opt as Record<string, unknown>;
            if (!Array.isArray(o.cells) || o.cells.length !== columns.length) {
              throw new ValidationError(`fields[${i}].options[${j}].cells must have ${columns.length} entries`);
            }
          }
        } else {
          for (const [j, opt] of (field.options as unknown[]).entries()) {
            if (!isNonEmptyString((opt as Record<string, unknown>).label)) {
              throw new ValidationError(`fields[${i}].options[${j}].label is required (or set fields[${i}].columns)`);
            }
          }
        }
        break;
      }
      case "slider_discrete":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        if (!Array.isArray(field.options) || field.options.length === 0) {
          throw new ValidationError(`fields[${i}].options must be a non-empty array`);
        }
        validateOptionValues(field.options, i);
        for (const [j, opt] of (field.options as unknown[]).entries()) {
          if (!isNonEmptyString((opt as Record<string, unknown>).label)) {
            throw new ValidationError(`fields[${i}].options[${j}].label is required`);
          }
        }
        break;
      case "slider_number":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        if (typeof field.min !== "number" || typeof field.max !== "number" || field.min >= field.max) {
          throw new ValidationError(`fields[${i}].min/max must be numbers with min < max`);
        }
        break;
      case "toggle":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        break;
      case "date":
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        break;
      case "display":
        if (!isNonEmptyString(field.content)) throw new ValidationError(`fields[${i}].content is required`);
        break;
      case "repeat": {
        if (opts.insideRepeat) throw new ValidationError(`fields[${i}] repeat cannot be nested inside a repeat`);
        if (!isNonEmptyString(field.label)) throw new ValidationError(`fields[${i}].label is required`);
        const minItems = field.minItems ?? 0;
        const maxItems = field.maxItems ?? 50;
        if (!isNonNegativeInt(minItems)) throw new ValidationError(`fields[${i}].minItems must be a non-negative integer`);
        if (!isNonNegativeInt(maxItems) || maxItems < 1) {
          throw new ValidationError(`fields[${i}].maxItems must be a positive integer`);
        }
        if (minItems > maxItems) throw new ValidationError(`fields[${i}].minItems must be <= maxItems`);
        validateFields(field.fields, { insideRepeat: true });
        break;
      }
      default:
        throw new ValidationError(`fields[${i}].type is invalid: ${String(field.type)}`);
    }
    return field as unknown as FormField;
  });
}

export function validateEncryptedPayload(v: unknown): EncryptedPayload {
  if (typeof v !== "object" || v === null) throw new ValidationError("body must be an object");
  const body = v as Record<string, unknown>;
  if (!isNonEmptyString(body.ciphertext)) throw new ValidationError("ciphertext is required");
  if (!isNonEmptyString(body.iv)) throw new ValidationError("iv is required");
  validatePublicKey(body.browserPublicKey);
  return {
    ciphertext: body.ciphertext,
    iv: body.iv,
    browserPublicKey: body.browserPublicKey as string,
  };
}

export function validatePin(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (!isNonEmptyString(v) || v.length < 4 || v.length > 64) {
    throw new ValidationError("pin must be a string between 4 and 64 characters");
  }
  return v;
}

export function validateEnvVarName(v: unknown): string {
  if (!isNonEmptyString(v) || !/^[A-Z_][A-Z0-9_]*$/.test(v)) {
    throw new ValidationError("envVarName must look like an env var name, e.g. API_KEY");
  }
  return v;
}

export function parseTimeout(v: string | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
