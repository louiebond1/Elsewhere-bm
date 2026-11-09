/** Friendly names for skill tags, for people rather than databases. */
const NAMES: Record<string, string> = {
  reconciliations: 'Reconciliations', reporting: 'Reporting', month_end: 'Month-end', budgeting: 'Budgeting', forecasting: 'Forecasting',
  controls: 'Controls', audit: 'Audit', payroll: 'Payroll', bookkeeping: 'Bookkeeping', credit_control: 'Credit control', tax: 'Tax and VAT',
  analysis: 'Analysis', excel: 'Excel', sql: 'SQL', automation: 'Automation', process_design: 'Better processes', customer_work: 'Customers',
  sales: 'Sales', partnerships: 'Partnerships', project_delivery: 'Projects', coordination: 'Organising', leadership: 'Leading others', learning: 'Learning fast',
};
export const skillName = (t: string) => NAMES[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
