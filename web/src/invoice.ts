// Sends one invoice file to the stateless reader (/api/read-invoice) and returns its draft bill.
export interface Draft {
  vendor: string;
  address: string;
  amount: string;
  due: string;
  summary: string;
}

const toBase64 = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });

export async function readInvoice(file: File): Promise<Draft> {
  const resp = await fetch("/api/read-invoice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: await toBase64(file), media_type: file.type }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.error || `Invoice reader unavailable (${resp.status})`);
  return body.draft as Draft;
}

/** A draft as one import line: name, payee, amount, due, repeat, critical. Missing fields stay empty for the owner to fill. */
export function draftToLine(d: Draft, fallbackName: string): string {
  const q = (s: string) => (/[,;"\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [q(d.vendor || fallbackName), d.address, d.amount, d.due, "once", "no"].join(", ");
}
