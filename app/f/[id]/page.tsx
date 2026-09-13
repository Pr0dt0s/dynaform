"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Centered from "@/components/Centered";
import PinGate from "@/components/PinGate";
import { encryptForRecipient } from "@/lib/client-crypto";
import type { FormField, VisibleIf } from "@/lib/types";

type Schema = {
  title: string;
  description: string | null;
  fields: FormField[];
  publicKey: string;
  status: string;
};

type Value = string | string[] | number | boolean | Record<string, Value>[];
type Scope = Record<string, Value>;

function isVisible(visibleIf: VisibleIf | undefined, scope: Scope): boolean {
  if (!visibleIf) return true;
  const v = scope[visibleIf.field];
  if (visibleIf.equals !== undefined) return v === visibleIf.equals;
  if (visibleIf.notEquals !== undefined) return v !== visibleIf.notEquals;
  if (visibleIf.in) return visibleIf.in.includes(v as string | number);
  return true;
}

function defaultsFor(fields: FormField[]): Scope {
  const defaults: Scope = {};
  for (const field of fields) {
    if (field.type === "toggle") defaults[field.id] = field.defaultValue ?? false;
    if (field.type === "slider_number") defaults[field.id] = field.defaultValue ?? field.min;
    if (field.type === "slider_discrete") defaults[field.id] = field.options[0]?.value ?? "";
    if (field.type === "repeat") defaults[field.id] = Array(field.minItems ?? 0).fill(defaultsFor(field.fields));
  }
  return defaults;
}

export default function FormPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const secret = searchParams.get("s") ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [values, setValues] = useState<Scope>({});
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function loadSchema() {
    try {
      const res = await fetch(`/api/forms/${id}?s=${encodeURIComponent(secret)}`);
      if (res.status === 401) {
        setNeedsPin(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Schema;
      if (data.status !== "pending") {
        setError("This form was already submitted or has expired.");
        return;
      }
      setNeedsPin(false);
      setSchema(data);
      setValues((v) => ({ ...defaultsFor(data.fields), ...v }));
    } catch {
      setError("This form doesn't exist or has expired.");
    }
  }

  useEffect(() => {
    if (!secret) {
      setError("Missing access token.");
      return;
    }
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, secret]);

  async function handleUnlock(pin: string) {
    const res = await fetch(`/api/forms/${id}/unlock?s=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.status === 410) return { ok: false as const, burned: true };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false as const,
        error:
          body.attemptsRemaining !== undefined
            ? `Wrong PIN — ${body.attemptsRemaining} attempt(s) left before this link is destroyed.`
            : "Wrong PIN.",
      };
    }
    await loadSchema();
    return { ok: true as const };
  }

  function updateValue(fieldId: string, value: Value) {
    setValues((v) => ({ ...v, [fieldId]: value }));
  }

  const pages = useMemo(() => {
    if (!schema) return [0];
    const set = new Set(schema.fields.map((f) => f.page ?? 0));
    return [...set].sort((a, b) => a - b);
  }, [schema]);

  const visibleFieldsOnPage = useMemo(() => {
    if (!schema) return [];
    const currentPage = pages[page] ?? 0;
    return schema.fields.filter((f) => (f.page ?? 0) === currentPage && isVisible(f.visibleIf, values));
  }, [schema, pages, page, values]);

  function goNext() {
    if (!formRef.current?.reportValidity()) return;
    setPage((p) => Math.min(p + 1, pages.length - 1));
  }

  function goBack() {
    setPage((p) => Math.max(p - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!schema) return;
    setSubmitting(true);
    setError(null);
    try {
      // Only submit values for fields that are actually visible right now — a field
      // hidden by visibleIf may still hold a stale value from before it was hidden.
      const visibleIds = new Set(schema.fields.filter((f) => isVisible(f.visibleIf, values)).map((f) => f.id));
      const answers: Scope = {};
      for (const [k, v] of Object.entries(values)) if (visibleIds.has(k)) answers[k] = v;

      const payload = await encryptForRecipient(schema.publicKey, JSON.stringify(answers));
      const res = await fetch(`/api/forms/${id}/submit?s=${encodeURIComponent(secret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setError("Could not submit. The form may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <Centered>
        <p className="text-red-600">{error}</p>
      </Centered>
    );
  }
  if (needsPin) {
    return (
      <Centered>
        <PinGate onUnlock={handleUnlock} />
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <p>Thanks — you can close this tab.</p>
      </Centered>
    );
  }
  if (!schema) {
    return (
      <Centered>
        <p>Loading…</p>
      </Centered>
    );
  }

  const isLastPage = page === pages.length - 1;

  return (
    <Centered>
      <form ref={formRef} onSubmit={handleSubmit} className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{schema.title}</h1>
          {schema.description && <p className="text-sm text-gray-500 mt-1">{schema.description}</p>}
          {pages.length > 1 && (
            <p className="text-xs text-gray-400 mt-1">
              Page {page + 1} of {pages.length}
            </p>
          )}
        </div>
        {visibleFieldsOnPage.map((field) => (
          <FieldInput key={field.id} field={field} value={values[field.id]} onChange={(v) => updateValue(field.id, v)} />
        ))}
        <div className="flex gap-2">
          {page > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="flex-1 rounded-md border border-gray-300 py-2"
            >
              Back
            </button>
          )}
          {!isLastPage ? (
            <button
              type="button"
              onClick={goNext}
              className="flex-1 rounded-md bg-black text-white py-2"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-black text-white py-2 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          )}
        </div>
      </form>
    </Centered>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: Value | undefined;
  onChange: (v: Value) => void;
}) {
  switch (field.type) {
    case "display":
      return (
        <div className="rounded-md bg-gray-50 text-gray-900 p-3 text-sm whitespace-pre-wrap">
          {field.label && <div className="font-medium mb-1">{field.label}</div>}
          {field.content}
        </div>
      );
    case "text":
      return (
        <label className="block">
          <span className="block text-sm font-medium mb-1">{field.label}</span>
          <input
            type="text"
            required={field.required}
            placeholder={field.placeholder}
            pattern={field.pattern}
            minLength={field.minLength}
            maxLength={field.maxLength}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
      );
    case "number":
      return (
        <label className="block">
          <span className="block text-sm font-medium mb-1">{field.label}</span>
          <input
            type="number"
            required={field.required}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
      );
    case "email":
      return (
        <label className="block">
          <span className="block text-sm font-medium mb-1">{field.label}</span>
          <input
            type="email"
            required={field.required}
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
      );
    case "textarea":
      return (
        <label className="block">
          <span className="block text-sm font-medium mb-1">{field.label}</span>
          <textarea
            required={field.required}
            placeholder={field.placeholder}
            minLength={field.minLength}
            maxLength={field.maxLength}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            rows={4}
          />
        </label>
      );
    case "single_select": {
      if (field.columns) {
        return (
          <TableSelect
            field={field}
            mode="single"
            selected={value ? [value as string] : []}
            onChange={(next) => onChange(next[0] ?? "")}
          />
        );
      }
      return (
        <fieldset>
          <legend className="block text-sm font-medium mb-1">{field.label}</legend>
          <div className="space-y-1">
            {field.options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.id}
                  required={field.required}
                  checked={value === opt.value}
                  onChange={() => onChange(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      if (field.columns) {
        return <TableSelect field={field} mode="multi" selected={selected} onChange={onChange} />;
      }
      return (
        <fieldset>
          <legend className="block text-sm font-medium mb-1">{field.label}</legend>
          <div className="space-y-1">
            {field.options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter((v) => v !== opt.value);
                    onChange(next);
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "slider_discrete": {
      const index = Math.max(0, field.options.findIndex((o) => o.value === value));
      const current = field.options[index] ?? field.options[0];
      return (
        <div>
          <span className="block text-sm font-medium mb-1">
            {field.label} — <span className="text-gray-500">{current?.label}</span>
          </span>
          <input
            type="range"
            min={0}
            max={field.options.length - 1}
            step={1}
            value={index}
            onChange={(e) => onChange(field.options[Number(e.target.value)].value)}
            className="w-full"
          />
        </div>
      );
    }
    case "slider_number": {
      const current = typeof value === "number" ? value : field.defaultValue ?? field.min;
      return (
        <div>
          <span className="block text-sm font-medium mb-1">
            {field.label} — <span className="text-gray-500">{current}</span>
          </span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={current}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      );
    }
    case "toggle": {
      const checked = typeof value === "boolean" ? value : field.defaultValue ?? false;
      return (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    }
    case "date":
      return (
        <label className="block">
          <span className="block text-sm font-medium mb-1">{field.label}</span>
          <input
            type="date"
            required={field.required}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </label>
      );
    case "repeat":
      return <RepeatField field={field} rows={(value as Record<string, Value>[]) ?? []} onChange={onChange} />;
  }
}

function RepeatField({
  field,
  rows,
  onChange,
}: {
  field: Extract<FormField, { type: "repeat" }>;
  rows: Record<string, Value>[];
  onChange: (next: Record<string, Value>[]) => void;
}) {
  const minItems = field.minItems ?? 0;
  const maxItems = field.maxItems ?? 50;

  function updateRow(index: number, fieldId: string, value: Value) {
    const next = rows.map((row, i) => (i === index ? { ...row, [fieldId]: value } : row));
    onChange(next);
  }

  function addRow() {
    onChange([...rows, defaultsFor(field.fields)]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="space-y-3">
      <legend className="block text-sm font-medium mb-1">{field.label}</legend>
      {rows.map((row, index) => (
        <div key={index} className="rounded-md border border-gray-200 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              {field.itemLabel ?? "Item"} {index + 1}
            </span>
            {rows.length > minItems && (
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          {field.fields
            .filter((f) => isVisible(f.visibleIf, row))
            .map((f) => (
              <FieldInput key={f.id} field={f} value={row[f.id]} onChange={(v) => updateRow(index, f.id, v)} />
            ))}
        </div>
      ))}
      {rows.length < maxItems && (
        <button type="button" onClick={addRow} className="text-sm rounded-md border border-gray-300 px-3 py-1.5">
          + Add {field.itemLabel ?? "item"}
        </button>
      )}
    </fieldset>
  );
}

function TableSelect({
  field,
  mode,
  selected,
  onChange,
}: {
  field: Extract<FormField, { type: "single_select" | "multi_select" }>;
  mode: "single" | "multi";
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(optValue: string) {
    if (mode === "single") {
      onChange([optValue]);
      return;
    }
    onChange(selected.includes(optValue) ? selected.filter((v) => v !== optValue) : [...selected, optValue]);
  }

  return (
    <fieldset>
      <legend className="block text-sm font-medium mb-1">{field.label}</legend>
      <table className="w-full text-sm border border-gray-200 rounded-md overflow-hidden">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <th className="w-8" />
            {field.columns?.map((col) => (
              <th key={col} className="text-left font-medium px-3 py-2">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {field.options.map((opt) => (
            <tr key={opt.value} className="border-t border-gray-100">
              <td className="px-3 py-2">
                <input
                  type={mode === "single" ? "radio" : "checkbox"}
                  name={mode === "single" ? field.id : undefined}
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
              </td>
              {opt.cells?.map((cell, i) => (
                <td key={i} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
