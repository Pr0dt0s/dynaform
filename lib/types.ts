// Flat option: rendered as a plain radio/checkbox label.
// Tabular option: used when the field has `columns` — rendered as a table row, the
// checkbox/radio is the first cell, `cells` fills the rest (one per column).
export type FieldOption = { value: string; label?: string; cells?: string[] };

// Show this field only when another field's current value matches. Evaluated against
// sibling fields at the same level — top-level fields compare against the top-level
// answers, fields inside a `repeat` item compare against that item's own values.
export type VisibleIf = {
  field: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: (string | number)[];
};

type BaseField = {
  id: string;
  visibleIf?: VisibleIf;
  // Which page of a multi-page form this field belongs to (default 0 = single page).
  // Meaningless (ignored) on fields nested inside a `repeat`.
  page?: number;
};

export type FormField = BaseField &
  (
    | {
        type: "text" | "textarea";
        label: string;
        required?: boolean;
        placeholder?: string;
        pattern?: string;
        minLength?: number;
        maxLength?: number;
      }
    | {
        type: "number";
        label: string;
        required?: boolean;
        placeholder?: string;
        min?: number;
        max?: number;
        step?: number;
      }
    | {
        type: "email";
        label: string;
        required?: boolean;
        placeholder?: string;
      }
    | {
        type: "single_select" | "multi_select";
        label: string;
        required?: boolean;
        options: FieldOption[];
        // If set, options render as a table (checkbox/radio + one cell per column)
        // instead of a flat list. Each option must then provide `cells` matching this.
        columns?: string[];
      }
    | {
        type: "slider_discrete";
        label: string;
        required?: boolean;
        options: FieldOption[];
      }
    | {
        type: "slider_number";
        label: string;
        required?: boolean;
        min: number;
        max: number;
        step?: number;
        defaultValue?: number;
      }
    | {
        type: "toggle";
        label: string;
        defaultValue?: boolean;
      }
    | {
        type: "date";
        label: string;
        required?: boolean;
      }
    | {
        type: "display";
        label?: string;
        content: string;
      }
    | {
        type: "repeat";
        label: string;
        itemLabel?: string;
        minItems?: number;
        maxItems?: number;
        // Leaf fields only — no nested `repeat`, `page` is ignored here.
        fields: FormField[];
      }
  );

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  browserPublicKey: string;
};

export type ResolveStatus = "pending" | "submitted" | "expired";

export type ResolveResult =
  | { status: "pending" }
  | { status: "expired" }
  | ({ status: "submitted" } & EncryptedPayload);
