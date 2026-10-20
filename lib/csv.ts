export function csvText(rows: (string | number)[][]): string {
  return '\uFEFF'+rows.map(row=>row.map(value=>{
    const text=typeof value==='number'?String(value):/^[=+\-@\t\r]/.test(value)?`'${value}`:value;
    return `"${text.replaceAll('"','""')}"`;
  }).join(';')).join('\r\n');
}
