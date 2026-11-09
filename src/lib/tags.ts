/** Rough skill tags for free text, using the same tag words as approved examples and job criteria. */
const RULES: [string, RegExp][] = [
  ['reconciliations', /reconcil/i], ['reporting', /\breport/i], ['month_end', /month[- ]?end|\bclose\b|closing/i], ['budgeting', /budget/i],
  ['forecasting', /forecast/i], ['controls', /\bcontrols?\b|sign[- ]off|approval/i], ['audit', /audit/i], ['payroll', /payroll/i],
  ['bookkeeping', /bookkeep|ledger|invoice|purchase order/i], ['credit_control', /credit control|debtor|chas(e|ing) (payment|invoice)/i], ['tax', /\b(tax|vat|hmrc)\b/i],
  ['analysis', /analys|insight|data/i], ['excel', /excel|spreadsheet|pivot|vlookup|xlookup/i], ['sql', /\bsql\b/i], ['automation', /automat|macro|script/i],
  ['process_design', /process|checklist|workflow|template/i], ['customer_work', /customer|client|supplier/i], ['sales', /\bsales?\b|selling/i],
  ['partnerships', /partner/i], ['project_delivery', /project|deliver/i], ['coordination', /coordinat|organis|organiz|schedul|plann/i],
  ['leadership', /\bled\b|\blead|manag|mentor|train(ed|ing) (a |new )/i], ['learning', /learn|course|qualif|studied|study/i],
];
export function inferTags(text: string): string[] {
  return RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
}
