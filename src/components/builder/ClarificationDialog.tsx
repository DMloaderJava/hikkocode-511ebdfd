import { useState, useCallback, useRef } from "react";
import { HelpCircle, Key, ChevronRight, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type ClarificationField =
  | { type: "text"; id: string; label: string; placeholder?: string; required?: boolean }
  | { type: "password"; id: string; label: string; placeholder?: string; required?: boolean }
  | { type: "choice"; id: string; label: string; options: { value: string; label: string; description?: string }[] };

export interface ClarificationRequest {
  title: string;
  description?: string;
  fields: ClarificationField[];
}

export type ClarificationResult = Record<string, string> | null;

type ResolverFn = (result: ClarificationResult) => void;

export function useClarification() {
  const [request, setRequest] = useState<ClarificationRequest | null>(null);
  const resolverRef = useRef<ResolverFn | null>(null);

  const askUser = useCallback((req: ClarificationRequest): Promise<ClarificationResult> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest(req);
    });
  }, []);

  const handleSubmit = useCallback((values: Record<string, string>) => {
    resolverRef.current?.(values);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.(null);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  return { request, askUser, handleSubmit, handleCancel };
}

export function ClarificationDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: ClarificationRequest | null;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleOpen = (open: boolean) => {
    if (!open) onCancel();
  };

  const handleFieldChange = (id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const allRequiredFilled = request?.fields
    .filter((f) => f.type !== "choice" && f.required)
    .every((f) => values[f.id]?.trim()) ?? true;

  const handleFormSubmit = () => {
    if (!allRequiredFilled) return;
    onSubmit(values);
    setValues({});
  };

  if (!request) return null;

  return (
    <Dialog open={!!request} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            {request.title}
          </DialogTitle>
          {request.description && (
            <DialogDescription>{request.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {request.fields.map((field) => {
            if (field.type === "choice") {
              return (
                <div key={field.id} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{field.label}</label>
                  <div className="space-y-1.5">
                    {field.options.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          handleFieldChange(field.id, opt.value);
                          // Auto-submit single choice
                          if (request.fields.length === 1) {
                            onSubmit({ [field.id]: opt.value });
                            setValues({});
                          }
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all flex items-center gap-3 ${
                          values[field.id] === opt.value
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-secondary/30 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{opt.label}</p>
                          {opt.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                          )}
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={field.id} className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{field.label}</label>
                <input
                  type={field.type === "password" ? "password" : "text"}
                  value={values[field.id] || ""}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
            );
          })}

          {/* Show submit button only if there are text/password fields or multiple choice fields */}
          {(request.fields.some((f) => f.type !== "choice") || request.fields.length > 1) && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onCancel}
                className="flex-1 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleFormSubmit}
                disabled={!allRequiredFilled}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Продолжить
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
