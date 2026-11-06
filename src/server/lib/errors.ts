export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string>,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = () => new AppError('NOT_FOUND', 404, 'This item is not available.');
export const forbidden = () => new AppError('FORBIDDEN', 403, 'You do not have access to this area.');
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new AppError(code, 409, message, undefined, details);
export const policy = (code: string, message: string, details?: Record<string, unknown>) => new AppError(code, 422, message, undefined, details);
export const invalid = (message: string, fieldErrors?: Record<string, string>) => new AppError('VALIDATION', 400, message, fieldErrors);

export function isPgError(e: unknown, code: string): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === code || err?.cause?.code === code;
}
